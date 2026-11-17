import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { EMAIL_TEMPLATES, isTemplateName, renderEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return json({ error: "Failed to queue email" }, 500);
    }

    return json({ success: true, queued: true, status: "pending", id: queueRow.id }, 202);
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
});
