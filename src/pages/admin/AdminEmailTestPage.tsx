import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
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
    </AdminPageWrapper>
  );
}
