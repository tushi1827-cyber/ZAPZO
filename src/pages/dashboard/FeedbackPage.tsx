import { useState, useCallback, useEffect } from 'react';
import { MessageSquare, Lightbulb, Bug, Flag, Send, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { UserFeedback, FeedbackType } from '@/types';

const typeIcons: Record<FeedbackType, typeof MessageSquare> = {
  feedback: MessageSquare,
  suggestion: Lightbulb,
  bug: Bug,
  report: Flag,
};

const typeLabels: Record<FeedbackType, string> = {
  feedback: 'Feedback',
  suggestion: 'Suggestion',
  bug: 'Bug Report',
  report: 'Issue Report',
};

const statusTone: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  open: 'info',
  reviewing: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export function FeedbackPage() {
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'feedback' as FeedbackType,
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase.from('user_feedback').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data, error: err } = await query;
    if (err) {
      setError('Failed to load feedback');
    } else {
      setFeedback((data as UserFeedback[]) || []);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    setFormError('');
    if (form.message.trim().length < 5) {
      setFormError('Message must be at least 5 characters');
      return;
    }
    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc('submit_user_feedback', {
      p_type: form.type,
      p_subject: form.subject.trim(),
      p_message: form.message.trim(),
    });
    setSubmitting(false);
    if (rpcErr) {
      setFormError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setSuccess('Your feedback has been submitted successfully');
    setShowForm(false);
    setForm({ type: 'feedback', subject: '', message: '' });
    await load();
    setTimeout(() => setSuccess(''), 5000);
  };

  const statusFilters = ['all', 'open', 'reviewing', 'resolved', 'closed'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Feedback & Reports</h1>
          <p className="mt-1 text-sm text-ink-400">Submit feedback, suggestions, bug reports, or issue reports.</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Send className="h-4 w-4" /> New Submission
        </Button>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              statusFilter === s
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800/50 text-ink-400 hover:bg-ink-800 hover:text-ink-50'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner size="lg" className="py-20" />
      ) : feedback.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<MessageSquare className="h-10 w-10" />}
            title="No feedback yet"
            description="Submit feedback, suggestions, or report issues using the button above."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {feedback.map((item) => {
            const Icon = typeIcons[item.type];
            return (
              <Card key={item.id} className="p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600/10">
                    <Icon className="h-5 w-5 text-brand-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{typeLabels[item.type]}</Badge>
                      <Badge tone={statusTone[item.status] ?? 'neutral'}>{item.status}</Badge>
                      <span className="text-xs text-ink-400">{timeAgo(item.created_at)}</span>
                    </div>
                    <p className="mt-2 font-semibold text-white">
                      {item.subject || 'No subject'}
                    </p>
                    <p className="mt-1 text-sm text-ink-400 line-clamp-3">{item.message}</p>
                    {item.admin_note && (
                      <div className="mt-3 rounded-lg border border-brand-600/20 bg-brand-600/5 p-3">
                        <p className="text-xs font-semibold text-brand-400">Admin Note</p>
                        <p className="mt-1 text-sm text-ink-300">{item.admin_note}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Submit Feedback" size="md">
        <div className="space-y-4">
          <Select
            label="Type"
            name="type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as FeedbackType })}
          >
            <option value="feedback">Feedback</option>
            <option value="suggestion">Suggestion</option>
            <option value="bug">Bug Report</option>
            <option value="report">Issue Report</option>
          </Select>
          <Input
            label="Subject (optional)"
            name="subject"
            placeholder="Brief summary of your feedback"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            maxLength={200}
          />
          <Textarea
            label="Message"
            name="message"
            placeholder="Describe your feedback, suggestion, or issue in detail"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={5}
            maxLength={5000}
            hint={`${form.message.length}/5000 characters`}
          />
          {formError && (
            <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{formError}</div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : <><Send className="h-4 w-4" /> Submit</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
