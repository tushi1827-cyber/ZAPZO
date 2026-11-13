export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const EMAIL_SENDER = "WorkPixo <noreply@workpixo.com>";

export type SendOutcome =
  | { kind: "sent" }
  | { kind: "retry"; message: string }
  | { kind: "permanent"; message: string }
  | { kind: "config"; message: string };

type SendParams = {
  apiKey: string;
  idempotencyKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function classifyResendStatus(status: number, providerMessage?: string): SendOutcome {
  const detail = providerMessage || `Resend API error: ${status}`;
  if (status >= 200 && status < 300) return { kind: "sent" };
  if (status === 401 || status === 403) {
    return { kind: "config", message: `Resend rejected the API key (${status}): ${detail}` };
  }
  if (status === 408 || status === 429 || status >= 500) return { kind: "retry", message: detail };
  return { kind: "permanent", message: detail };
}

export async function sendViaResend(params: SendParams, fetchImpl: FetchLike = fetch): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": params.idempotencyKey,
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { kind: "retry", message: `Network error (outcome unknown): ${message}` };
  }

  if (response.ok) return { kind: "sent" };

  let providerMessage: string | undefined;
  try {
    const data = await response.json();
    providerMessage = typeof data?.message === "string" ? data.message : undefined;
  } catch {
    providerMessage = undefined;
  }
  return classifyResendStatus(response.status, providerMessage);
}
