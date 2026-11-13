import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  claimEmailQueueRow,
  markEmailQueueRowSent,
  releaseEmailQueueRow,
  type ClaimedRow,
  type RpcClient,
} from "../../supabase/functions/_shared/email-queue-rpc.ts";
import { classifyResendStatus } from "../../supabase/functions/_shared/email-delivery.ts";

const baseSchema = readFileSync(new URL("./base-schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("./email_queue_reliability.sql", import.meta.url), "utf8");

async function withDb(run: (db: PGlite) => Promise<void>): Promise<void> {
  const db = new PGlite();
  try {
    await db.exec(baseSchema);
    await db.exec(migration);
    await run(db);
  } finally {
    await db.close();
  }
}

function rpcClient(db: PGlite): RpcClient {
  return {
    async rpc(fn, args) {
      const names = Object.keys(args);
      const placeholders = names.map((_, i) => `$${i + 1}`).join(", ");
      try {
        const res = await db.query<{ result: unknown }>(
          `SELECT public.${fn}(${placeholders}) AS result`,
          names.map((name) => args[name]),
        );
        return { data: res.rows[0].result, error: null };
      } catch (err) {
        return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
      }
    },
  };
}

async function enqueue(db: PGlite, dedupKey: string | null = null): Promise<string | null> {
  const res = await db.query<{ id: string | null }>(
    `SELECT public.enqueue_email_insert($1, $2, $3, $4::jsonb, $5) AS id`,
    ["user@example.com", "welcome", "Welcome to WorkPixo", "{}", dedupKey],
  );
  return res.rows[0].id;
}

async function rowState(db: PGlite, id: string) {
  const res = await db.query<{
    status: string;
    attempts: number;
    last_error: string | null;
    claim_token: string | null;
    next_in_seconds: number;
  }>(
    `SELECT status, attempts, last_error, claim_token,
            EXTRACT(EPOCH FROM (next_attempt_at - now()))::float AS next_in_seconds
     FROM public.email_queue WHERE id = $1`,
    [id],
  );
  return res.rows[0];
}

async function makeDue(db: PGlite, id: string): Promise<void> {
  await db.query(`UPDATE public.email_queue SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [id]);
}

async function claimOrFail(client: RpcClient, id: string): Promise<ClaimedRow> {
  const claimed = await claimEmailQueueRow(client, id);
  assert.ok(claimed, "expected row to be claimable");
  return claimed;
}

describe("email queue retry and ownership", () => {
  it("marks a first-attempt success as sent", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      const claimed = await claimOrFail(client, id);
      assert.equal(claimed.attempts, 1);

      await markEmailQueueRowSent(client, claimed);

      const state = await rowState(db, id);
      assert.equal(state.status, "sent");
      assert.equal(state.attempts, 1);
      assert.equal(state.claim_token, null);
    });
  });

  it("schedules a retry for a transient failure and respects the delay", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      const claimed = await claimOrFail(client, id);

      await releaseEmailQueueRow(client, claimed, "retry", "Rate limited");

      const state = await rowState(db, id);
      assert.equal(state.status, "pending");
      assert.equal(state.attempts, 1);
      assert.equal(state.last_error, "Rate limited");
      assert.ok(state.next_in_seconds > 50 && state.next_in_seconds <= 60, `delay was ${state.next_in_seconds}`);

      assert.equal(await claimEmailQueueRow(client, id), null, "row must not be claimable before its delay");

      await makeDue(db, id);
      const retried = await claimOrFail(client, id);
      assert.equal(retried.attempts, 2);
    });
  });

  it("uses the 1, 5, 15, 60 minute backoff schedule", async () => {
    await withDb(async (db) => {
      const minutes: number[] = [];
      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await db.query<{ m: number }>(
          `SELECT EXTRACT(EPOCH FROM public.email_queue_backoff($1))::int / 60 AS m`,
          [attempt],
        );
        minutes.push(res.rows[0].m);
      }
      assert.deepEqual(minutes, [1, 5, 15, 60]);
    });
  });

  it("fails the row after exactly five attempts and never claims it again", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;

      for (let attempt = 1; attempt <= 5; attempt++) {
        const claimed = await claimOrFail(client, id);
        assert.equal(claimed.attempts, attempt);
        await releaseEmailQueueRow(client, claimed, "retry", `transient ${attempt}`);
        await makeDue(db, id);
      }

      const state = await rowState(db, id);
      assert.equal(state.status, "failed");
      assert.equal(state.attempts, 5);
      assert.equal(state.last_error, "transient 5");
      assert.equal(await claimEmailQueueRow(client, id), null);
    });
  });

  it("fails permanent errors immediately and keeps last_error", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      const claimed = await claimOrFail(client, id);
      const outcome = classifyResendStatus(422, "Invalid recipient");
      assert.equal(outcome.kind, "permanent");

      await releaseEmailQueueRow(client, claimed, "permanent", outcome.message);

      const state = await rowState(db, id);
      assert.equal(state.status, "failed");
      assert.equal(state.attempts, 1);
      assert.equal(state.last_error, "Invalid recipient");
    });
  });

  it("treats 429 and 5xx as retryable through the classifier", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      for (const status of [429, 500, 503]) {
        const id = (await enqueue(db))!;
        const claimed = await claimOrFail(client, id);
        const outcome = classifyResendStatus(status);
        assert.equal(outcome.kind, "retry");
        await releaseEmailQueueRow(client, claimed, "retry", outcome.kind === "retry" ? outcome.message : "");
        assert.equal((await rowState(db, id)).status, "pending");
      }
    });
  });

  it("refunds the attempt on configuration errors so an outage does not exhaust retries", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;

      for (let i = 0; i < 7; i++) {
        const claimed = await claimOrFail(client, id);
        assert.equal(claimed.attempts, 1);
        await releaseEmailQueueRow(client, claimed, "config", "Resend rejected the API key (401)");
        await makeDue(db, id);
      }

      const state = await rowState(db, id);
      assert.equal(state.status, "pending");
      assert.equal(state.attempts, 0);
    });
  });

  it("recovers stale processing rows and rejects the old worker's token", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      const stale = await claimOrFail(client, id);

      await db.query(`UPDATE public.email_queue SET claimed_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
      const requeued = await db.query<{ r: number }>(`SELECT public.requeue_stale_email_queue() AS r`);
      assert.equal(requeued.rows[0].r, 1);
      assert.equal((await rowState(db, id)).status, "pending");

      assert.equal(await markSentReturns(client, stale), false);
      assert.equal(await releaseReturns(db, stale, "retry"), "not_owner");

      const fresh = await claimOrFail(client, id);
      assert.equal(fresh.attempts, 2, "recovery must not reset the attempt count");
      assert.notEqual(fresh.claim_token, stale.claim_token);
    });
  });

  it("fails stale rows that already used all five attempts", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      for (let i = 0; i < 4; i++) {
        const claimed = await claimOrFail(client, id);
        await releaseEmailQueueRow(client, claimed, "retry", "transient");
        await makeDue(db, id);
      }
      await claimOrFail(client, id);
      await db.query(`UPDATE public.email_queue SET claimed_at = now() - interval '10 minutes' WHERE id = $1`, [id]);

      await db.query(`SELECT public.requeue_stale_email_queue()`);
      const state = await rowState(db, id);
      assert.equal(state.status, "failed");
      assert.equal(state.attempts, 5);
      assert.match(state.last_error ?? "", /outcome unknown/);
      assert.equal(await claimEmailQueueRow(client, id), null);
    });
  });

  it("does not let a worker with an old token mark or release a row it no longer owns", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      const first = await claimOrFail(client, id);
      await db.query(`UPDATE public.email_queue SET claimed_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
      await db.query(`SELECT public.requeue_stale_email_queue()`);
      const second = await claimOrFail(client, id);

      assert.equal(await markSentReturns(client, first), false);
      assert.equal(await releaseReturns(db, first, "permanent"), "not_owner");

      const state = await rowState(db, id);
      assert.equal(state.status, "processing");
      assert.equal(state.claim_token, second.claim_token);
    });
  });

  it("rejects an unknown release outcome", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      const claimed = await claimOrFail(client, id);
      await assert.rejects(
        db.query(`SELECT public.release_email_queue_row($1, $2, 'bogus', 'x')`, [claimed.id, claimed.claim_token]),
      );
      assert.equal((await rowState(db, id)).status, "processing");
    });
  });
});

describe("email queue claiming", () => {
  it("lets only one worker claim a given row", async () => {
    await withDb(async (db) => {
      const client = rpcClient(db);
      const id = (await enqueue(db))!;
      const results = await Promise.all([
        claimEmailQueueRow(client, id),
        claimEmailQueueRow(client, id),
      ]);
      assert.equal(results.filter((r) => r !== null).length, 1);
    });
  });

  it("batch claims never return the same row twice", async () => {
    await withDb(async (db) => {
      for (let i = 0; i < 3; i++) await enqueue(db);
      const first = await db.query<{ r: Array<{ id: string }> }>(`SELECT public.claim_email_queue_batch(10) AS r`);
      const second = await db.query<{ r: Array<{ id: string }> }>(`SELECT public.claim_email_queue_batch(10) AS r`);
      const ids = [...first.rows[0].r, ...second.rows[0].r].map((r) => r.id);
      assert.equal(ids.length, 3);
      assert.equal(new Set(ids).size, 3);
      assert.equal(second.rows[0].r.length, 0);
    });
  });

  it("does not claim rows whose attempts are exhausted", async () => {
    await withDb(async (db) => {
      const id = (await enqueue(db))!;
      await db.query(`UPDATE public.email_queue SET attempts = 5 WHERE id = $1`, [id]);
      const res = await db.query<{ r: unknown[] }>(`SELECT public.claim_email_queue_batch(10) AS r`);
      assert.equal(res.rows[0].r.length, 0);
    });
  });
});

describe("email queue duplicate prevention and access", () => {
  it("does not create a second queue row for the same dedup key", async () => {
    await withDb(async (db) => {
      const first = await enqueue(db, "withdrawal_paid:abc");
      const second = await enqueue(db, "withdrawal_paid:abc");
      assert.ok(first);
      assert.equal(second, null);
      const count = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.email_queue`);
      assert.equal(count.rows[0].n, 1);
    });
  });

  it("keeps the new RPCs away from anon and authenticated roles", async () => {
    await withDb(async (db) => {
      const fns = [
        "public.claim_email_queue_row(uuid)",
        "public.claim_email_queue_batch(integer)",
        "public.mark_email_queue_row_sent(uuid, uuid)",
        "public.release_email_queue_row(uuid, uuid, text, text)",
        "public.requeue_stale_email_queue()",
      ];
      for (const fn of fns) {
        for (const role of ["anon", "authenticated"]) {
          const res = await db.query<{ ok: boolean }>(
            `SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`,
            [role, fn],
          );
          assert.equal(res.rows[0].ok, false, `${role} must not execute ${fn}`);
        }
        const svc = await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege('service_role', $1, 'EXECUTE') AS ok`,
          [fn],
        );
        assert.equal(svc.rows[0].ok, true, `service_role must execute ${fn}`);
      }
    });
  });
});

async function markSentReturns(client: RpcClient, row: ClaimedRow): Promise<boolean> {
  const { data } = await client.rpc("mark_email_queue_row_sent", {
    p_id: row.id,
    p_claim_token: row.claim_token,
  });
  return data === true;
}

async function releaseReturns(db: PGlite, row: ClaimedRow, outcome: "retry" | "permanent"): Promise<string> {
  const res = await db.query<{ r: string }>(
    `SELECT public.release_email_queue_row($1, $2, $3, 'err') AS r`,
    [row.id, row.claim_token, outcome],
  );
  return res.rows[0].r;
}
