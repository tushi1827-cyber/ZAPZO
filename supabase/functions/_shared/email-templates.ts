export const EMAIL_TEMPLATES = [
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

export type TemplateName = (typeof EMAIL_TEMPLATES)[number];

export function isTemplateName(value: string): value is TemplateName {
  return (EMAIL_TEMPLATES as readonly string[]).includes(value);
}

const siteName = "WorkPixo";

const TEMPLATE_CONFIG: Record<TemplateName, { subject: string; ctaLabel: string }> = {
  welcome: { subject: "Welcome to WorkPixo", ctaLabel: "Explore Tasks" },
  withdrawal_requested: { subject: "Withdrawal Request Received", ctaLabel: "View Withdrawal" },
  withdrawal_approved: { subject: "Withdrawal Approved", ctaLabel: "View Wallet" },
  withdrawal_rejected: { subject: "Withdrawal Request Rejected", ctaLabel: "View Wallet" },
  withdrawal_paid: { subject: "Withdrawal Paid", ctaLabel: "View Wallet" },
  gift_card_fulfilled: { subject: "Your Gift Card Is Ready", ctaLabel: "View Gift Card" },
  task_approved: { subject: "Task Approved", ctaLabel: "View Wallet" },
  task_rejected: { subject: "Task Submission Rejected", ctaLabel: "View Tasks" },
  support_reply: { subject: "New Reply From WorkPixo Support", ctaLabel: "View Support Ticket" },
  ticket_status_changed: { subject: "Support Ticket Status Updated", ctaLabel: "View Support Ticket" },
  account_suspended: { subject: "Your WorkPixo Account Has Been Suspended", ctaLabel: "Contact Support" },
};

export function templateSubject(template: TemplateName): string {
  return TEMPLATE_CONFIG[template].subject;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function text(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function formatAmount(payload: Record<string, unknown>): string | undefined {
  const amount = payload.amount;
  if (typeof amount !== "number" && typeof amount !== "string") return undefined;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Coins`;
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

function heading(value: string): string {
  return `<h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#fafafa;">${escapeHtml(value)}</h2>`;
}

function paragraph(value: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">${escapeHtml(value)}</p>`;
}

function greeting(userName: string | undefined): string {
  return paragraph(userName ? `Hi ${userName},` : "Hello,");
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
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

function buildBody(template: TemplateName, payload: Record<string, unknown>, ctaUrl: string | undefined, ctaLabel: string): string {
  const userName = text(payload, "user_name");
  const amountStr = formatAmount(payload);
  const withdrawalMethod = text(payload, "withdrawal_method");
  const reference = text(payload, "reference");
  const reason = text(payload, "reason");
  const taskTitle = text(payload, "task_title");
  const ticketSubject = text(payload, "ticket_subject");
  const ticketStatus = text(payload, "ticket_status");
  const messagePreview = text(payload, "message_preview");
  const giftCard = text(payload, "gift_card");

  const cta = ctaUrl ? ctaButton(ctaUrl, ctaLabel) : "";
  let inner = "";

  switch (template) {
    case "welcome":
      inner += greeting(userName);
      inner += paragraph("Welcome to WorkPixo! Your account is ready to go.");
      inner += paragraph("You can now explore available tasks and start earning. Complete tasks, refer friends, and build your earnings all in one place.");
      break;
    case "withdrawal_requested":
      inner += greeting(userName);
      inner += paragraph("We've received your withdrawal request and it's now being reviewed by our team.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      inner += paragraph("You'll receive another email once your request has been processed.");
      break;
    case "withdrawal_approved":
      inner += greeting(userName);
      inner += paragraph("Great news! Your withdrawal request has been approved and is being processed for payment.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      if (reference) inner += infoRow("Reference", reference);
      inner += paragraph("The payment will be sent to your selected withdrawal method shortly.");
      break;
    case "withdrawal_rejected":
      inner += greeting(userName);
      inner += paragraph("Unfortunately, your withdrawal request could not be processed at this time.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      if (reason) inner += infoRow("Reason", reason);
      inner += paragraph("You can review your withdrawal history and submit a new request from your wallet.");
      break;
    case "withdrawal_paid":
      inner += greeting(userName);
      inner += paragraph("Your withdrawal has been paid out successfully.");
      if (amountStr) inner += infoRow("Amount", amountStr);
      if (withdrawalMethod) inner += infoRow("Method", withdrawalMethod);
      if (reference) inner += infoRow("Reference", reference);
      inner += paragraph("The funds have been sent to your selected withdrawal method. If you don't receive the payment within a few business days, please contact support.");
      break;
    case "gift_card_fulfilled":
      inner += greeting(userName);
      inner += paragraph("Your gift card request has been fulfilled and is ready for you.");
      if (amountStr) inner += infoRow("Value", amountStr);
      if (giftCard) inner += infoRow("Gift Card", giftCard);
      if (reference) inner += infoRow("Reference", reference);
      inner += paragraph("You can access your gift card details from your dashboard.");
      break;
    case "task_approved":
      inner += greeting(userName);
      inner += paragraph("Your task submission has been approved!");
      if (taskTitle) inner += infoRow("Task", taskTitle);
      if (amountStr) inner += infoRow("Reward", amountStr);
      inner += paragraph("The reward has been added to your wallet balance and is now available for withdrawal.");
      break;
    case "task_rejected":
      inner += greeting(userName);
      inner += paragraph("Your task submission was not approved this time.");
      if (taskTitle) inner += infoRow("Task", taskTitle);
      if (reason) inner += infoRow("Reason", reason);
      inner += paragraph("Please review the task requirements carefully and try again. If you believe this was an error, feel free to contact support.");
      break;
    case "support_reply":
      inner += greeting(userName);
      inner += paragraph("You've received a new reply from WorkPixo Support on your ticket.");
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
      break;
    case "ticket_status_changed":
      inner += greeting(userName);
      inner += paragraph("The status of your support ticket has been updated.");
      if (ticketSubject) inner += infoRow("Ticket", ticketSubject);
      if (ticketStatus) inner += infoRow("New Status", ticketStatus);
      break;
    case "account_suspended":
      inner += greeting(userName);
      inner += paragraph("Your WorkPixo account has been suspended.");
      if (reason) inner += infoRow("Reason", reason);
      inner += paragraph("During the suspension, you will not be able to complete tasks, submit withdrawals, or access your account.");
      inner += paragraph("If you believe this action was taken in error, please contact our support team and we'll review your case.");
      break;
  }

  return inner + cta;
}

export function renderEmail(
  template: string,
  payload: Record<string, unknown>,
  fallbackSubject: string,
): { subject: string; html: string } {
  const config = isTemplateName(template) ? TEMPLATE_CONFIG[template] : undefined;
  const subject = config?.subject ?? fallbackSubject;
  const ctaUrl = safeHref(text(payload, "cta_url")) ?? safeHref(text(payload, "support_url"));
  const inner = heading(subject) + (config ? buildBody(template as TemplateName, payload, ctaUrl, config.ctaLabel) : paragraph(fallbackSubject));
  return { subject, html: buildWrapper(inner) };
}
