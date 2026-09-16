import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    return payload?.app_metadata?.is_admin === true;
  } catch {
    return false;
  }
}

function isTemplateName(value: string): value is TemplateName {
  return (VALID_TEMPLATES as readonly string[]).includes(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const siteName = "ZAPZO";

interface TemplateContent {
  subject: string;
  inner: string;
}

function buildWrapper(inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0b;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#141416;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#fafafa;letter-spacing:-0.5px;">${siteName}</h1>
              ${inner}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;border-top:1px solid #27272a;">
              <p style="margin:16px 0 0;font-size:12px;color:#71717a;line-height:1.5;">This is an automated message from ${siteName}. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#fafafa;">${escapeHtml(text)}</h2>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">${escapeHtml(text)}</p>`;
}

function greeting(userName?: string): string {
  if (userName) {
    return paragraph(`Hi ${userName},`);
  }
  return paragraph(`Hello,`);
}

function infoRow(label: string, value: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
    <tr>
      <td style="padding:12px 16px;background-color:#18181b;border-radius:8px;">
        <span style="font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(label)}</span><br>
        <span style="font-size:15px;color:#fafafa;font-weight:500;">${escapeHtml(value)}</span>
      </td>
    </tr>
  </table>`;
}

function ctaButton(url: string, label: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">
    <tr>
      <td align="left">
        <a href="${escapeAttr(url)}" style="display:inline-block;padding:14px 32px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

function formatAmount(payload: Record<string, unknown>): string | undefined {
  const amount = payload.amount as number | string | undefined;
  const currency = (payload.currency as string | undefined) || "INR";
  if (amount === undefined || amount === null) return undefined;
  const formatted = typeof amount === "number"
    ? amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(amount);
  return `${currency} ${formatted}`;
}

const TEMPLATE_CONFIG: Record<TemplateName, { subject: string; ctaLabel: string }> = {
  welcome: { subject: "Welcome to ZAPZO", ctaLabel: "Explore Tasks" },
  withdrawal_requested: { subject: "Withdrawal Request Received", ctaLabel: "View Withdrawal" },
  withdrawal_approved: { subject: "Withdrawal Approved", ctaLabel: "View Wallet" },
  withdrawal_rejected: { subject: "Withdrawal Request Rejected", ctaLabel: "View Wallet" },
  withdrawal_paid: { subject: "Withdrawal Paid", ctaLabel: "View Wallet" },
  gift_card_fulfilled: { subject: "Your Gift Card Is Ready", ctaLabel: "View Gift Card" },
  task_approved: { subject: "Task Approved", ctaLabel: "View Wallet" },
  task_rejected: { subject: "Task Submission Rejected", ctaLabel: "View Tasks" },
  support_reply: { subject: "New Reply From ZAPZO Support", ctaLabel: "View Support Ticket" },
  ticket_status_changed: { subject: "Support Ticket Status Updated", ctaLabel: "View Support Ticket" },
  account_suspended: { subject: "Your ZAPZO Account Has Been Suspended", ctaLabel: "Contact Support" },
};

function buildTemplateContent(template: TemplateName, payload: Record<string, unknown>): TemplateContent {
  const config = TEMPLATE_CONFIG[template];
  const userName = payload.user_name as string | undefined;
  const ctaUrl = (payload.cta_url as string | undefined) || (payload.support_url as string | undefined);
  const amountStr = formatAmount(payload);
  const withdrawalMethod = payload.withdrawal_method as string | undefined;
  const reference = payload.reference as string | undefined;
  const reason = payload.reason as string | undefined;
  const taskTitle = payload.task_title as string | undefined;
  const ticketSubject = payload.ticket_subject as string | undefined;
  const ticketStatus = payload.ticket_status as string | undefined;
  const messagePreview = payload.message_preview as string | undefined;
  const giftCard = payload.gift_card as string | undefined;

  let inner = heading(config.subject);

  switch (template) {
    case "welcome": {
      inner += greeting(userName);
      inner += paragraph("Welcome to ZAPZO! Your account is ready to go.");
      inner += paragraph("You can now explore available tasks and start earning. Complete tasks, refer friends, and build your earnings all in one place.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "withdrawal_requested": {
      inner += greeting(userName);
      inner += paragraph("We've received your withdrawal request and it's now being reviewed by our team.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      inner += paragraph("You'll receive another email once your request has been processed.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "withdrawal_approved": {
      inner += greeting(userName);
      inner += paragraph("Great news! Your withdrawal request has been approved and is being processed for payment.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      if (reference) inner += infoRow("Reference", reference);
      inner += paragraph("The payment will be sent to your selected withdrawal method shortly.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "withdrawal_rejected": {
      inner += greeting(userName);
      inner += paragraph("Unfortunately, your withdrawal request could not be processed at this time.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      if (reason) {
        inner += infoRow("Reason", reason);
      }
      inner += paragraph("You can review your withdrawal history and submit a new request from your wallet.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "withdrawal_paid": {
      inner += greeting(userName);
      inner += paragraph("Your withdrawal has been paid out successfully.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      if (reference) inner += infoRow("Reference", reference);
      inner += paragraph("The funds have been sent to your selected withdrawal method. If you don't receive the payment within a few business days, please contact support.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "gift_card_fulfilled": {
      inner += greeting(userName);
      inner += paragraph("Your gift card request has been fulfilled and is ready for you.");
      if (amountStr) inner += infoRow("Value", amountStr);
      if (giftCard) inner += infoRow("Gift Card", giftCard);
      if (reference) inner += infoRow("Reference", reference);
      inner += paragraph("You can access your gift card details from your dashboard.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "task_approved": {
      inner += greeting(userName);
      inner += paragraph("Your task submission has been approved!");
      if (taskTitle) inner += infoRow("Task", taskTitle);
      if (amountStr) inner += infoRow("Reward", amountStr);
      inner += paragraph("The reward has been added to your wallet balance and is now available for withdrawal.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "task_rejected": {
      inner += greeting(userName);
      inner += paragraph("Your task submission was not approved this time.");
      if (taskTitle) inner += infoRow("Task", taskTitle);
      if (reason) {
        inner += infoRow("Reason", reason);
      }
      inner += paragraph("Please review the task requirements carefully and try again. If you believe this was an error, feel free to contact support.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "support_reply": {
      inner += greeting(userName);
      inner += paragraph("You've received a new reply from ZAPZO Support on your ticket.");
      if (ticketSubject) inner += infoRow("Ticket", ticketSubject);
      if (messagePreview) {
        inner += `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
          <tr>
            <td style="padding:14px 16px;background-color:#18181b;border-radius:8px;border-left:3px solid #3b82f6;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#d4d4d8;">${escapeHtml(messagePreview)}</p>
            </td>
          </tr>
        </table>`;
      }
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "ticket_status_changed": {
      inner += greeting(userName);
      inner += paragraph("The status of your support ticket has been updated.");
      if (ticketSubject) inner += infoRow("Ticket", ticketSubject);
      if (ticketStatus) inner += infoRow("New Status", ticketStatus);
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }

    case "account_suspended": {
      inner += greeting(userName);
      inner += paragraph("Your ZAPZO account has been suspended.");
      if (reason) {
        inner += infoRow("Reason", reason);
      }
      inner += paragraph("During the suspension, you will not be able to complete tasks, submit withdrawals, or access your account.");
      inner += paragraph("If you believe this action was taken in error, please contact our support team and we'll review your case.");
      if (ctaUrl) inner += ctaButton(ctaUrl, config.ctaLabel);
      break;
    }
  }

  return { subject: config.subject, inner };
}

function renderTemplate(template: TemplateName, payload: Record<string, unknown>): { subject: string; html: string } {
  const { subject, inner } = buildTemplateContent(template, payload);
  return { subject, html: buildWrapper(inner) };
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

    if (!isAdminRequest(req)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

