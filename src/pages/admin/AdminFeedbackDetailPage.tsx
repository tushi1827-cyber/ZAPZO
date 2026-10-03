import { useState, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Lightbulb, Bug, Flag, Save } from 'lucide-react';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Feedback';
import { Textarea } from '@/components/ui/Input';
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

export function AdminFeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [feedback, setFeedback] = useState<UserFeedback | null>(null);
  const [profile, setProfile] = useState<{ name: string; referral_code: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('user_feedback').select('*').eq('id', id).maybeSingle();
    if (err || !data) {
      setError('Failed to load feedback');
      setFeedback(null);
    } else {
      const row = data as UserFeedback;
      setFeedback(row);
      setNewStatus(row.status);
      setAdminNote(row.admin_note || '');
      const { data: prof } = await supabase.from('profiles')
        .select('name, referral_code').eq('id', row.user_id).maybeSingle();
      setProfile(prof as { name: string; referral_code: string } | null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!id || !feedback) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    const { error: rpcErr } = await supabase.rpc('admin_update_feedback_status', {
      p_feedback_id: id,
      p_status: newStatus,
      p_admin_note: adminNote.trim() || null,
    });
    setSaving(false);
    if (rpcErr) {
      setSaveError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setSaveSuccess(true);
    await load();
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  if (loading) {
    return (
      <AdminPageWrapper title="Feedback Details">
        <Spinner size="lg" className="py-20" />
      </AdminPageWrapper>
    );
  }

  if (error || !feedback) {
    return (
      <AdminPageWrapper title="Feedback Details">
        <Card className="p-6">
          <p className="text-sm text-danger-400">{error || 'Feedback not found'}</p>
          <Link to="/admin/feedback" className="mt-4 inline-block text-sm text-brand-400 hover:text-brand-300">
            Back to Feedback
          </Link>
        </Card>
      </AdminPageWrapper>
    );
  }

  const Icon = typeIcons[feedback.type];
  const statuses = ['open', 'reviewing', 'resolved', 'closed'];

  return (
    <AdminPageWrapper
      title="Feedback Details"
      subtitle={`${typeLabels[feedback.type]} from ${profile?.name || 'Unknown user'}`}
      actions={
        <Link to="/admin/feedback">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Back</Button>
        </Link>
      }
    >
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600/10">
            <Icon className="h-5 w-5 text-brand-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{typeLabels[feedback.type]}</Badge>
              <Badge tone={statusTone[feedback.status] ?? 'neutral'}>{feedback.status}</Badge>
            </div>
            <p className="mt-2 font-semibold text-white">{feedback.subject || 'No subject'}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-300">{feedback.message}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-white">User Information</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-ink-400">Name</p>
            <p className="text-sm text-white">{profile?.name || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Referral Code</p>
            <p className="text-sm text-white">{profile?.referral_code || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Submitted</p>
            <p className="text-sm text-white">{new Date(feedback.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Last Updated</p>
            <p className="text-sm text-white">{new Date(feedback.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-white">Manage Feedback</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label">Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="input cursor-pointer"
            >
              {statuses.map(s => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </div>
          <Textarea
            label="Admin Note"
            name="admin_note"
            placeholder="Add an internal note about this feedback..."
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={4}
            maxLength={5000}
          />
          {saveError && (
            <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{saveError}</div>
          )}
          {saveSuccess && (
            <div className="rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">Changes saved successfully</div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || (newStatus === feedback.status && adminNote === (feedback.admin_note || ''))}>
              {saving ? <Spinner size="sm" /> : <><Save className="h-4 w-4" /> Save Changes</>}
            </Button>
          </div>
        </div>
      </Card>
    </AdminPageWrapper>
  );
}
