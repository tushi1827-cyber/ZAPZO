import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { EMAIL_SENDER, sendViaResend, type SendOutcome } from "../_shared/email-delivery.ts";
import {
  markEmailQueueRowSent,
  releaseEmailQueueRow,
  type ClaimedRow,
  type QueueWriteResult,
} from "../_shared/email-queue-rpc.ts";
import { renderEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = 10;

type DbError = { event: string; row_id: string | null; message: string };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logError(event: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: "error", fn: "process-email-queue", event, ...details }));
}

function recordDbError(dbErrors: DbError[], event: string, rowId: string | null, message: string): void {
  logError(event, { row_id: rowId, message });
  dbErrors.push({ event, row_id: rowId, message });
}

function isAdminRequest(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.replace("Bearer ", "");
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  try {
    const payload = JSON.parse(atob(parts[1]));
    return payload?.app_metadata?.is_admin === true || payload?.role === "service_role";
  } catch {
    return false;
  }
}

function isClaimedRow(value: unknown): value is ClaimedRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.claim_token === "string" &&
    typeof row.recipient_email === "string" &&
    typeof row.template_name === "string" &&
    typeof row.subject === "string";
}

async function deliverRow(row: ClaimedRow, apiKey: string): Promise<SendOutcome> {
  const rendered = renderEmail(row.template_name, row.payload || {}, row.subject);
  return sendViaResend({
    apiKey,
    idempotencyKey: row.id,
    from: EMAIL_SENDER,
    to: row.recipient_email,
    subject: row.subject,
    html: rendered.html,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!isAdminRequest(req)) {
      return jsonResponse({ error: "Forbidden: admin access required" }, 403);
    }

    if (!RESEND_API_KEY) {
      return jsonResponse({ error: "Email service not configured: RESEND_API_KEY is missing" }, 503);
    }

    const dbErrors: DbError[] = [];

    const { error: requeueError } = await supabase.rpc("requeue_stale_email_queue");
    if (requeueError) {
      recordDbError(dbErrors, "requeue_failed", null, requeueError.message);
    }

    const { data: claimedRows, error: claimError } = await supabase
      .rpc("claim_email_queue_batch", { p_max: BATCH_SIZE });

    if (claimError) {
      logError("claim_failed", { message: claimError.message });
      return jsonResponse({ error: "Failed to claim email batch" }, 500);
    }

    if (!Array.isArray(claimedRows)) {
      logError("claim_unexpected_shape", {});
      return jsonResponse({ error: "Failed to claim email batch" }, 500);
    }

    const rows: ClaimedRow[] = [];
    for (const item of claimedRows) {
      if (isClaimedRow(item)) {
        rows.push(item);
      } else {
        const rowId = typeof item?.id === "string" ? item.id : null;
        recordDbError(dbErrors, "claim_row_invalid", rowId, "Claimed row is missing id or claim token");
      }
    }

    let sent = 0;
    let failed = 0;
    let unrecordedSends = 0;
    let configProblem: string | null = null;

    for (const row of rows) {
      if (configProblem) {
        const released = await releaseEmailQueueRow(supabase, row, "config", configProblem);
        failed++;
        if (!released.ok) recordDbError(dbErrors, "release_failed", row.id, released.error);
        continue;
      }

      let outcome: SendOutcome;
      try {
        outcome = await deliverRow(row, RESEND_API_KEY);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to render email";
        outcome = { kind: "permanent", message };
      }

      if (outcome.kind === "sent") {
        const marked: QueueWriteResult = await markEmailQueueRowSent(supabase, row);
        if (marked.ok) {
          sent++;
        } else {
          unrecordedSends++;
          recordDbError(dbErrors, "mark_sent_failed", row.id, marked.error);
        }
        continue;
      }

      failed++;
      if (outcome.kind === "config") configProblem = outcome.message;
      const released = await releaseEmailQueueRow(supabase, row, outcome.kind, outcome.message);
      if (!released.ok) recordDbError(dbErrors, "release_failed", row.id, released.error);
    }

    const hasDbErrors = dbErrors.length > 0;
    const body = {
      success: configProblem === null && !hasDbErrors,
      processed: rows.length,
      sent,
      failed,
      unrecorded_sends: unrecordedSends,
      ...(configProblem ? { error: `Email delivery paused: ${configProblem}` } : {}),
      ...(hasDbErrors ? { error: "Queue bookkeeping failed for one or more rows", db_errors: dbErrors } : {}),
    };

    if (configProblem) return jsonResponse(body, 503);
    if (hasDbErrors) return jsonResponse(body, 500);
    return jsonResponse(body, 200);
  } catch (err) {
    logError("unhandled", { message: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
