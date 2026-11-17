import type { SendOutcome } from "./email-delivery.ts";

type RpcResult = { data: unknown; error: { message: string } | null };

export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type ClaimedRow = {
  id: string;
  recipient_email: string;
  template_name: string;
  subject: string;
  payload: Record<string, unknown>;
  attempts: number;
  claim_token: string;
};

export type FailedOutcome = Exclude<SendOutcome["kind"], "sent">;

export type QueueWriteResult = { ok: true } | { ok: false; error: string };

export async function claimEmailQueueRow(client: RpcClient, id: string): Promise<ClaimedRow | null> {
  const { data, error } = await client.rpc("claim_email_queue_row", { p_id: id });
  if (error) throw new Error(`claim_email_queue_row failed: ${error.message}`);
  return (data as ClaimedRow | null) ?? null;
}

export async function markEmailQueueRowSent(
  client: RpcClient,
  row: Pick<ClaimedRow, "id" | "claim_token">,
): Promise<QueueWriteResult> {
  const { data, error } = await client.rpc("mark_email_queue_row_sent", {
    p_id: row.id,
    p_claim_token: row.claim_token,
  });
  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: "Claim was no longer owned by this worker" };
  return { ok: true };
}

export async function releaseEmailQueueRow(
  client: RpcClient,
  row: Pick<ClaimedRow, "id" | "claim_token">,
  outcome: FailedOutcome,
  message: string,
): Promise<QueueWriteResult> {
  const { data, error } = await client.rpc("release_email_queue_row", {
    p_id: row.id,
    p_claim_token: row.claim_token,
    p_outcome: outcome,
    p_error: message,
  });
  if (error) return { ok: false, error: error.message };
  if (data === "not_owner") return { ok: false, error: "Claim was no longer owned by this worker" };
  return { ok: true };
}
