import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const VALID_TEMPLATES = [
  "welcome",
  "withdrawal_requested",
  "withdrawal_approved",
  "withdrawal_rejected",
  "withdrawal_paid",
  "gift_card_fulfilled",
  "task_approved",
  "task_rejected",
  "support_reply",
  "ticket_status_changed",
  "account_suspended",
] as const;

type TemplateName = (typeof VALID_TEMPLATES)[number];

interface SendEmailRequest {
  to: string;
  template: string;
  subject?: string;
  payload?: Record<string, unknown>;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isTemplateName(value: string): value is TemplateName {
  return (VALID_TEMPLATES as readonly string[]).includes(value);
}

function renderTemplate(template: TemplateName, payload: Record<string, unknown>): { subject: string; html: string } {
  const siteName = "ZAPZO";
  const subject = payload.subject as string | undefined;

  const wrapper = (inner: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0b;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#141416;border-radius:16px;overflow:hidden;max-width:560px;">
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#fafafa;">${siteName}</h1>
              ${inner}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0;font-size:12px;color:#71717a;">This is an automated message from ${siteName}. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const paragraphs = (payload.paragraphs as string[] | undefined) || [];
  const ctaUrl = payload.cta_url as string | undefined;
  const ctaLabel = payload.cta_label as string | undefined;

  let inner = "";
  if (subject) {
    inner += `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#fafafa;">${subject}</h2>`;
  }
  for (const p of paragraphs) {
    inner += `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d4d4d8;">${p}</p>`;
  }
  if (ctaUrl && ctaLabel) {
    inner += `<a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${ctaLabel}</a>`;
  }

  return {
    subject: subject || `${siteName} Notification`,
    html: wrapper(inner),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json() as SendEmailRequest;

    if (!body.to || !isValidEmail(body.to)) {
      return new Response(
        JSON.stringify({ error: "Valid recipient email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!body.template || !isTemplateName(body.template)) {
      return new Response(
        JSON.stringify({ error: `Invalid template. Valid templates: ${VALID_TEMPLATES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = body.payload || {};
    const rendered = renderTemplate(body.template, payload);
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

    if (queueError) {
      return new Response(
        JSON.stringify({ error: "Failed to enqueue email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ZAPZO <noreply@resend.dev>",
        to: [body.to],
        subject: finalSubject,
        html: rendered.html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      await supabase
        .from("email_queue")
        .update({
          status: "failed",
          attempts: 1,
          last_error: resendData?.message || `Resend API error: ${resendResponse.status}`,
        })
        .eq("id", queueRow.id);

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData?.message || "Resend API error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase
      .from("email_queue")
      .update({
        status: "sent",
        attempts: 1,
        sent_at: new Date().toISOString(),
      })
      .eq("id", queueRow.id);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent", id: queueRow.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
