import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { EMAIL_SENDER, sendViaResend } from "../_shared/email-delivery.ts";
import {
  claimEmailQueueRow,
  markEmailQueueRowSent,
  releaseEmailQueueRow,
} from "../_shared/email-queue-rpc.ts";
import { EMAIL_TEMPLATES, isTemplateName, renderEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface SendEmailRequest {
  to: string;
  template: string;
  subject?: string;
  payload?: unknown;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return json({ error: "Email service not configured" }, 503);
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!isAdminRequest(req)) {
      return json({ error: "Forbidden: admin access required" }, 403);
    }

    const body = await req.json() as SendEmailRequest;

    if (!body.to || !isValidEmail(body.to)) {
      return json({ error: "Valid recipient email is required" }, 400);
    }

    if (!body.template || !isTemplateName(body.template)) {
      return json({ error: `Invalid template. Valid templates: ${EMAIL_TEMPLATES.join(", ")}` }, 400);
    }

    if (body.payload !== undefined && !isPlainObject(body.payload)) {
      return json({ error: "Payload must be a JSON object" }, 400);
    }

    const payload = body.payload ?? {};
    const rendered = renderEmail(body.template, payload, body.template);
    const finalSubject = body.subject || rendered.subject;

    const { data: queueRow, error: queueError } = await supabase
      .from("email_queue")
      .insert({
        recipient_email: body.to,
        template_name: body.template,
        subject: finalSubject,
        payload,
        status: "pending",
      })
      .select("id")
      .single();

    if (queueError || !queueRow) {
      return json({ error: "Failed to enqueue email" }, 500);
    }

    const claimed = await claimEmailQueueRow(supabase, queueRow.id);
    if (!claimed) {
      return json({ success: true, message: "Email queued", id: queueRow.id }, 202);
    }

    const outcome = await sendViaResend({
      apiKey: RESEND_API_KEY,
      idempotencyKey: queueRow.id,
      from: EMAIL_SENDER,
      to: body.to,
      subject: finalSubject,
      html: rendered.html,
    });

    if (outcome.kind === "sent") {
      await markEmailQueueRowSent(supabase, claimed);
      return json({ success: true, message: "Email sent", id: queueRow.id }, 200);
    }

    await releaseEmailQueueRow(supabase, claimed, outcome.kind, outcome.message);

    if (outcome.kind === "retry") {
      return json({ success: true, message: "Email queued for retry", id: queueRow.id }, 202);
    }

    if (outcome.kind === "config") {
      return json({ error: "Email service is misconfigured: Resend rejected the API key", details: outcome.message }, 503);
    }

    return json({ error: "Failed to send email", details: outcome.message }, 502);
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
});
