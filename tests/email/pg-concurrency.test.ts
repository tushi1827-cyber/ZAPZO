import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";
import { openClient, startTestCluster, type TestCluster } from "./pg-cluster.ts";
import type { ClaimedRow } from "../../supabase/functions/_shared/email-queue-rpc.ts";

const baseSchema = readFileSync(new URL("./base-schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("./email_queue_reliability.sql", import.meta.url), "utf8");

let cluster: TestCluster;

type Workers = { a: pg.Client; b: pg.Client };

async function newWorkers(): Promise<Workers> {
  const url = await cluster.createDatabase(`t_${randomUUID().replaceAll("-", "")}`);
  const a = openClient(url);
  const b = openClient(url);
  await a.connect();
  await b.connect();
  await a.query(baseSchema);
  await a.query(migration);
  for (const c of [a, b]) await c.query("SET statement_timeout = '10s'");
  return { a, b };
}

async function closeWorkers({ a, b }: Workers): Promise<void> {
  await a.end();
  await b.end();
}

async function enqueue(c: pg.Client, dedupKey: string | null = null): Promise<string> {
  const res = await c.query<{ id: string | null }>(
    `SELECT public.enqueue_email_insert($1, $2, $3, $4::jsonb, $5) AS id`,
    ["user@example.com", "welcome", "Welcome to WorkPixo", "{}", dedupKey],
  );
  return res.rows[0].id as string;
}

async function claimOne(c: pg.Client, id: string): Promise<ClaimedRow | null> {
  const res = await c.query<{ r: ClaimedRow | null }>(`SELECT public.claim_email_queue_row($1) AS r`, [id]);
  return res.rows[0].r;
}

async function claimBatch(c: pg.Client, max = 50): Promise<ClaimedRow[]> {
  const res = await c.query<{ r: ClaimedRow[] }>(`SELECT public.claim_email_queue_batch($1) AS r`, [max]);
  return res.rows[0].r;
}

async function markSent(c: pg.Client, row: ClaimedRow): Promise<boolean> {
  const res = await c.query<{ r: boolean }>(`SELECT public.mark_email_queue_row_sent($1, $2) AS r`, [row.id, row.claim_token]);
  return res.rows[0].r;
}

async function release(
  c: pg.Client,
  row: ClaimedRow,
  outcome: "retry" | "permanent" | "config",
  message: string,
): Promise<string> {
  const res = await c.query<{ r: string }>(
    `SELECT public.release_email_queue_row($1, $2, $3, $4) AS r`,
    [row.id, row.claim_token, outcome, message],
  );
  return res.rows[0].r;
}

async function requeueStale(c: pg.Client): Promise<number> {
  const res = await c.query<{ r: number }>(`SELECT public.requeue_stale_email_queue() AS r`);
  return res.rows[0].r;
}

async function makeDue(c: pg.Client, id: string): Promise<void> {
  await c.query(`UPDATE public.email_queue SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [id]);
}

async function ageClaim(c: pg.Client, id: string): Promise<void> {
  await c.query(`UPDATE public.email_queue SET claimed_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
}

async function rowState(c: pg.Client, id: string) {
  const res = await c.query<{
    status: string;
    attempts: number;
    last_error: string | null;
    claim_token: string | null;
  }>(`SELECT status, attempts, last_error, claim_token FROM public.email_queue WHERE id = $1`, [id]);
  return res.rows[0];
}

describe("PostgreSQL email queue concurrency", () => {
  before(async () => {
    cluster = await startTestCluster();
  });

  after(async () => {
    await cluster.stop();
  });

  it("uses two independent PostgreSQL backend connections", async () => {
    const w = await newWorkers();
    try {
      const [pa, pb] = await Promise.all([
        w.a.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`),
        w.b.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`),
      ]);
      assert.notEqual(pa.rows[0].pid, pb.rows[0].pid);
    } finally {
      await closeWorkers(w);
    }
  });

  it("does not let a second connection claim a row that another connection holds, and does not block", async () => {
    const w = await newWorkers();
    try {
      const id = await enqueue(w.a);
      await w.a.query("BEGIN");
      const held = await claimOne(w.a, id);
      assert.ok(held, "first connection should claim the row inside its open transaction");

      const started = Date.now();
      const contested = await claimOne(w.b, id);
      assert.equal(contested, null);
      assert.ok(Date.now() - started < 5000, "second claim must not wait on the lock");

      await w.a.query("COMMIT");
      assert.equal(await claimOne(w.b, id), null, "committed claim must block a later claim");
    } finally {
      await closeWorkers(w);
    }
  });

  it("gives each of 40 rows to exactly one worker when both race for it", async () => {
    const w = await newWorkers();
    try {
      const ids: string[] = [];
      for (let i = 0; i < 40; i++) ids.push(await enqueue(w.a));

      const results = await Promise.all(
        ids.map((id) => Promise.all([claimOne(w.a, id), claimOne(w.b, id)])),
      );
      for (const [first, second] of results) {
        assert.equal([first, second].filter((r) => r !== null).length, 1);
      }
    } finally {
      await closeWorkers(w);
    }
  });

  it("returns disjoint batches when both workers claim at the same moment", async () => {
    const w = await newWorkers();
    try {
      const ids: string[] = [];
      for (let i = 0; i < 60; i++) ids.push(await enqueue(w.a));

      const [batchA, batchB] = await Promise.all([claimBatch(w.a, 50), claimBatch(w.b, 50)]);
      const claimed = [...batchA, ...batchB].map((r) => r.id);
      assert.equal(claimed.length, 60);
      assert.equal(new Set(claimed).size, 60);
      assert.deepEqual([...claimed].sort(), [...ids].sort());
    } finally {
      await closeWorkers(w);
    }
  });

  it("does not let a stalled worker update a row that was recovered and re-claimed", async () => {
    const w = await newWorkers();
    try {
      const id = await enqueue(w.a);
      const stale = (await claimOne(w.a, id))!;
      await ageClaim(w.a, id);

      assert.ok((await requeueStale(w.b)) >= 1);
      const fresh = (await claimOne(w.b, id))!;
      assert.equal(fresh.attempts, 2, "recovery must keep the attempt count");

      assert.equal(await markSent(w.a, stale), false);
      assert.equal(await release(w.a, stale, "retry", "late"), "not_owner");

      const state = await rowState(w.b, id);
      assert.equal(state.status, "processing");
      assert.equal(state.claim_token, fresh.claim_token);
    } finally {
      await closeWorkers(w);
    }
  });

  it("fails a stale fifth attempt with an unknown-outcome error and never claims it again", async () => {
    const w = await newWorkers();
    try {
      const id = await enqueue(w.a);
      for (let attempt = 1; attempt <= 4; attempt++) {
        const row = (await claimOne(w.a, id))!;
        assert.equal(row.attempts, attempt);
        assert.equal(await release(w.a, row, "retry", `transient ${attempt}`), "pending");
        await makeDue(w.a, id);
      }
      const fifth = (await claimOne(w.a, id))!;
      assert.equal(fifth.attempts, 5);

      await ageClaim(w.a, id);
      await requeueStale(w.b);

      const state = await rowState(w.b, id);
      assert.equal(state.status, "failed");
      assert.equal(state.attempts, 5);
      assert.match(state.last_error ?? "", /outcome unknown/);
      assert.equal(await claimOne(w.a, id), null);
      assert.equal(await claimOne(w.b, id), null);
    } finally {
      await closeWorkers(w);
    }
  });

  it("keeps the same row id across an ambiguous retry so Resend sees the same idempotency key", async () => {
    const w = await newWorkers();
    try {
      const id = await enqueue(w.a);
      const first = (await claimOne(w.a, id))!;
      assert.equal(await release(w.a, first, "retry", "Network error (outcome unknown): reset"), "pending");
      await makeDue(w.a, id);

      const retry = (await claimOne(w.b, id))!;
      assert.equal(retry.id, first.id);
      assert.equal(retry.attempts, 2);
      assert.notEqual(retry.claim_token, first.claim_token);
    } finally {
      await closeWorkers(w);
    }
  });

  it("allows exactly five successful claims when two workers race on every cycle", async () => {
    const w = await newWorkers();
    try {
      const id = await enqueue(w.a);
      let successes = 0;
      for (let cycle = 0; cycle < 6; cycle++) {
        const results = await Promise.all([claimOne(w.a, id), claimOne(w.b, id)]);
        const winners = results.filter((r): r is ClaimedRow => r !== null);
        assert.ok(winners.length <= 1, "never more than one winner per cycle");
        if (winners.length === 1) {
          successes++;
          await release(w.a, winners[0], "retry", "transient");
          await makeDue(w.a, id);
        }
      }
      assert.equal(successes, 5);
      const state = await rowState(w.a, id);
      assert.equal(state.status, "failed");
      assert.equal(state.attempts, 5);
    } finally {
      await closeWorkers(w);
    }
  });

  it("rejects a late mark-sent from the old token after the row was released and re-claimed", async () => {
    const w = await newWorkers();
    try {
      const id = await enqueue(w.a);
      const first = (await claimOne(w.a, id))!;
      await release(w.a, first, "retry", "transient");
      await makeDue(w.a, id);
      const second = (await claimOne(w.b, id))!;

      assert.equal(await markSent(w.a, first), false);
      assert.equal(await markSent(w.b, second), true);
      assert.equal((await rowState(w.a, id)).status, "sent");
    } finally {
      await closeWorkers(w);
    }
  });

  it("never leaves two active claim tokens when recovery and claiming run at the same time", async () => {
    const w = await newWorkers();
    try {
      const id = await enqueue(w.a);
      await claimOne(w.a, id);
      await ageClaim(w.a, id);

      const [requeued, batch] = await Promise.all([requeueStale(w.a), claimBatch(w.b)]);
      assert.equal(requeued, 1);
      const state = await rowState(w.a, id);
      if (batch.length === 1) {
        assert.equal(state.status, "processing");
        assert.equal(state.claim_token, batch[0].claim_token);
        assert.equal(state.attempts, 2);
      } else {
        assert.equal(state.status, "pending");
        assert.equal(state.claim_token, null);
      }
    } finally {
      await closeWorkers(w);
    }
  });
});
