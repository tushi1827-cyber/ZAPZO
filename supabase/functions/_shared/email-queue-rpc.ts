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

export async function claimEmailQueueRow(client: RpcClient, id: string): Promise<ClaimedRow | null> {
  const { data, error } = await client.rpc("claim_email_queue_row", { p_id: id });
  if (error) {
    console.error("claim_email_queue_row failed:", id, error.message);
    return null;
  }
  return (data as ClaimedRow | null) ?? null;
}

export async function markEmailQueueRowSent(
  client: RpcClient,
  row: Pick<ClaimedRow, "id" | "claim_token">,
): Promise<void> {
  const { data, error } = await client.rpc("mark_email_queue_row_sent", {
    p_id: row.id,
    p_claim_token: row.claim_token,
  });
  if (error) console.error("mark_email_queue_row_sent failed:", row.id, error.message);
  else if (data !== true) console.error("Lost claim before marking sent:", row.id);
}

export async function releaseEmailQueueRow(
  client: RpcClient,
  row: Pick<ClaimedRow, "id" | "claim_token">,
  outcome: FailedOutcome,
  message: string,
): Promise<void> {
  const { data, error } = await client.rpc("release_email_queue_row", {
    p_id: row.id,
    p_claim_token: row.claim_token,
    p_outcome: outcome,
    p_error: message,
  });
  if (error) console.error("release_email_queue_row failed:", row.id, error.message);
  else if (data === "not_owner") console.error("Lost claim before release:", row.id);
}
