import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { EMAIL_SENDER, sendViaResend, type SendOutcome } from "../_shared/email-delivery.ts";
import {
  markEmailQueueRowSent,
  releaseEmailQueueRow,
  type ClaimedRow,
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
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isAdminRequest(req)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Email service not configured: RESEND_API_KEY is missing" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: requeueResult, error: requeueError } = await supabase
      .rpc("requeue_stale_email_queue");

    if (requeueError) {
      console.error("requeue_stale_email_queue failed:", requeueError.message);
    }

    const { data: claimedRows, error: claimError } = await supabase
      .rpc("claim_email_queue_batch", { p_max: BATCH_SIZE });

    if (claimError) {
      return new Response(
        JSON.stringify({ error: "Failed to claim email batch" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows: ClaimedRow[] = Array.isArray(claimedRows) ? claimedRows : [];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          sent: 0,
          failed: 0,
          requeued: requeueResult ?? 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let failed = 0;
    let configProblem: string | null = null;

    for (const row of rows) {
      if (configProblem) {
        await releaseEmailQueueRow(supabase, row, "config", configProblem);
        failed++;
        continue;
      }

      const outcome = await deliverRow(row, RESEND_API_KEY);
      if (outcome.kind === "sent") {
        await markEmailQueueRowSent(supabase, row);
        sent++;
        continue;
      }

      failed++;
      if (outcome.kind === "config") configProblem = outcome.message;
      await releaseEmailQueueRow(supabase, row, outcome.kind, outcome.message);
    }

    const body = {
      success: configProblem === null,
      processed: rows.length,
      sent,
      failed,
      requeued: requeueResult ?? 0,
      ...(configProblem ? { error: `Email delivery paused: ${configProblem}` } : {}),
    };

    return new Response(
      JSON.stringify(body),
      { status: configProblem ? 503 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
