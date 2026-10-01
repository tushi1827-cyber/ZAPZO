import { useState } from 'react';
import { Mail, Send, Play } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Feedback';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';

const EMAIL_TEMPLATES = [
  'welcome',
  'withdrawal_requested',
  'withdrawal_approved',
  'withdrawal_rejected',
  'withdrawal_paid',
  'gift_card_fulfilled',
  'task_approved',
  'task_rejected',
  'support_reply',
  'ticket_status_changed',
  'account_suspended',
] as const;

export function AdminEmailTestPage() {
  const [recipient, setRecipient] = useState('');
  const [template, setTemplate] = useState<string>(EMAIL_TEMPLATES[0]);
  const [payload, setPayload] = useState('{}');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [processorRunning, setProcessorRunning] = useState(false);
  const [processorStatus, setProcessorStatus] = useState<number | null>(null);
  const [processorResponse, setProcessorResponse] = useState<unknown | null>(null);
  const [processorUsed, setProcessorUsed] = useState(false);

  const handleRunProcessor = async () => {
    if (processorUsed) return;

    const confirmed = window.confirm(
      'Run the email queue processor once? This will attempt to send the pending test email.'
    );
    if (!confirmed) return;

    setProcessorRunning(true);
    setProcessorStatus(null);
    setProcessorResponse(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setProcessorStatus(0);
        setProcessorResponse({ error: 'No active session — please log in again.' });
        setProcessorRunning(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-email-queue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({}),
        },
      );

      setProcessorStatus(response.status);

      let data: unknown;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { error: `Non-JSON response (${response.status}): ${text.slice(0, 500) || '<empty body>'}` };
      }
      setProcessorResponse(data);
      setProcessorUsed(true);
    } catch (err) {
      setProcessorStatus(0);
      const errMsg = err instanceof Error ? err.message : String(err);
      setProcessorResponse({ error: `Request failed: ${errMsg}` });
    } finally {
      setProcessorRunning(false);
    }
  };

  const handleSend = async () => {
    setResult(null);

    if (!recipient.trim()) {
      setResult({ type: 'error', message: 'Recipient email is required.' });
      return;
    }

    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      setResult({ type: 'error', message: 'Payload is not valid JSON.' });
      return;
    }

    const confirmed = window.confirm('Send this test email?');
    if (!confirmed) return;

    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setResult({ type: 'error', message: 'Authentication required. Please log in again.' });
        setSending(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            to: recipient.trim(),
            template,
            payload: parsedPayload,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setResult({ type: 'error', message: data.error || `Request failed (${response.status})` });
      } else {
        setResult({ type: 'success', message: `Email sent successfully. Queue ID: ${data.id}` });
      }
    } catch (err) {
      setResult({ type: 'error', message: 'Network error — could not reach the email service.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminPageWrapper
      title="Email System Test"
      subtitle="Send a test email using any of the 11 available templates. Uses the deployed send-email Edge Function."
    >
      <Card className="p-6">
        <div className="mb-6 flex items-center gap-2">
          <Mail className="h-5 w-5 text-brand-400" />
          <h2 className="font-bold text-white">Test Email</h2>
        </div>

        <div className="space-y-5">
          <Input
            label="Recipient Email"
            type="email"
            placeholder="recipient@example.com"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />

          <div>
            <label className="label">Template</label>
            <select
              className="input cursor-pointer"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {EMAIL_TEMPLATES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <Textarea
            label="Payload (JSON)"
            rows={6}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
          />

          <div className="flex items-center gap-3">
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Spinner size="sm" /> : <><Send className="h-4 w-4" /> Send Test Email</>}
            </Button>
          </div>

          {result && (
            <div
              className={`rounded-xl p-4 text-sm ${
                result.type === 'success'
                  ? 'bg-accent-400/10 text-accent-400'
                  : 'bg-danger-500/10 text-danger-400'
              }`}
            >
              {result.message}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6 mt-6">
        <div className="mb-4 flex items-center gap-2">
          <Play className="h-5 w-5 text-brand-400" />
          <h2 className="font-bold text-white">Queue Processor — One-Shot Test</h2>
        </div>
        <p className="text-sm text-neutral-400 mb-4">
          Invokes <code className="text-neutral-300">process-email-queue</code> once using your current admin session.
          Disabled after first use to prevent double-processing.
        </p>

        <Button
          onClick={handleRunProcessor}
          disabled={processorRunning || processorUsed}
          variant="secondary"
        >
          {processorRunning
            ? <><Spinner size="sm" /> Running processor…</>
            : processorUsed
              ? 'Processor already run'
              : <><Play className="h-4 w-4" /> Run Queue Processor Once</>}
        </Button>

        {processorStatus !== null && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-neutral-400">
              HTTP status: <span className={`font-mono font-semibold ${processorStatus === 200 ? 'text-accent-400' : 'text-danger-400'}`}>{processorStatus}</span>
            </p>
            <pre className="rounded-xl bg-neutral-900 p-4 text-xs text-neutral-300 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(processorResponse, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </AdminPageWrapper>
  );
}
