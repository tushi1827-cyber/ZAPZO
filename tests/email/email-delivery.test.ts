import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyResendStatus, sendViaResend } from "../../supabase/functions/_shared/email-delivery.ts";

const baseParams = {
  apiKey: "test-key",
  idempotencyKey: "queue-row-1",
  from: "WorkPixo <noreply@resend.dev>",
  to: "user@example.com",
  subject: "Welcome to WorkPixo",
  html: "<p>Hello</p>",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("classifyResendStatus", () => {
  const cases: Array<[number, string]> = [
    [200, "sent"],
    [201, "sent"],
    [400, "permanent"],
    [404, "permanent"],
    [422, "permanent"],
    [401, "config"],
    [403, "config"],
    [408, "retry"],
    [429, "retry"],
    [500, "retry"],
    [503, "retry"],
    [599, "retry"],
  ];

  for (const [status, kind] of cases) {
    it(`maps HTTP ${status} to ${kind}`, () => {
      assert.equal(classifyResendStatus(status).kind, kind);
    });
  }

  it("keeps the provider message on permanent failures", () => {
    const outcome = classifyResendStatus(422, "Invalid to address");
    assert.deepEqual(outcome, { kind: "permanent", message: "Invalid to address" });
  });
});

describe("sendViaResend", () => {
  it("returns sent for a 2xx response", async () => {
    const outcome = await sendViaResend(baseParams, async () => jsonResponse(200, { id: "re_1" }));
    assert.deepEqual(outcome, { kind: "sent" });
  });

  it("sends the queue row id as the Idempotency-Key header", async () => {
    let seen: Headers | undefined;
    await sendViaResend(baseParams, async (_url, init) => {
      seen = new Headers(init.headers);
      return jsonResponse(200, {});
    });
    assert.equal(seen?.get("Idempotency-Key"), "queue-row-1");
    assert.equal(seen?.get("Authorization"), "Bearer test-key");
  });

  it("retries 429 responses and surfaces the provider message", async () => {
    const outcome = await sendViaResend(baseParams, async () => jsonResponse(429, { message: "Rate limited" }));
    assert.deepEqual(outcome, { kind: "retry", message: "Rate limited" });
  });

  it("marks a 500 response retryable", async () => {
    const outcome = await sendViaResend(baseParams, async () => new Response("oops", { status: 500 }));
    assert.equal(outcome.kind, "retry");
  });

  it("marks a 422 response permanent", async () => {
    const outcome = await sendViaResend(baseParams, async () => jsonResponse(422, { message: "Bad sender" }));
    assert.deepEqual(outcome, { kind: "permanent", message: "Bad sender" });
  });

  it("treats a network error as retryable with unknown outcome", async () => {
    const outcome = await sendViaResend(baseParams, async () => {
      throw new TypeError("socket hang up");
    });
    assert.equal(outcome.kind, "retry");
    assert.match(outcome.kind === "retry" ? outcome.message : "", /outcome unknown/);
  });

  it("reuses the same Idempotency-Key and payload when retrying after an ambiguous failure", async () => {
    const calls: Array<{ key: string | null; body: string }> = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      calls.push({
        key: new Headers(init.headers).get("Idempotency-Key"),
        body: String(init.body),
      });
      if (calls.length === 1) throw new TypeError("connection reset after send");
      return jsonResponse(200, { id: "re_2" });
    };

    const first = await sendViaResend(baseParams, fetchImpl);
    const second = await sendViaResend(baseParams, fetchImpl);

    assert.equal(first.kind, "retry");
    assert.equal(second.kind, "sent");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].key, "queue-row-1");
    assert.equal(calls[1].key, "queue-row-1");
    assert.equal(calls[0].body, calls[1].body);
  });
});
