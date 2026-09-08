import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LifeBuoy, Plus, Search, MessageCircle, Paperclip, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { SupportTicket, TicketCategory, TicketPriority } from '@/types';

const categoryLabels: Record<string, string> = {
  task_issue: 'Task Issue',
  payment_reward: 'Payment / Reward',
  withdrawal: 'Withdrawal',
  account: 'Account',
  referral: 'Referral',
  technical: 'Technical',
  other: 'Other',
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

export function SupportPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [form, setForm] = useState({
    category: 'task_issue' as TicketCategory,
    subject: '',
    message: '',
    attachment: null as File | null,
  });
  const [attachmentName, setAttachmentName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    const sanitized = search.trim().replace(/[,.()]/g, ' ').trim();
    if (sanitized) {
      query = query.or(`ticket_number.ilike.%${sanitized}%,subject.ilike.%${sanitized}%`);
    }

    const { data, error } = await query;
    if (error) setError('Failed to load tickets.');
    setTickets((data as SupportTicket[]) || []);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setCreateError('File size must be under 5MB.');
      return;
    }
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setCreateError('Only PNG, JPEG, WebP, GIF, and PDF files are allowed.');
      return;
    }
    setForm(f => ({ ...f, attachment: file }));
    setAttachmentName(file.name);
    setCreateError('');
  };

  const uploadAttachment = async (file: File): Promise<string | null> => {
    if (!profile) return null;
    const ext = file.name.split('.').pop() || 'bin';
    const filePath = `${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('support-attachments')
      .upload(filePath, file, {
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      });
    if (upErr) {
      setCreateError('Failed to upload attachment. Please try again.');
      return null;
    }
    return filePath;
  };

  const handleCreate = async () => {
    if (!form.subject.trim() || form.subject.trim().length < 3) {
      setCreateError('Subject must be at least 3 characters.');
      return;
    }
    if (!form.message.trim() || form.message.trim().length < 5) {
      setCreateError('Message must be at least 5 characters.');
      return;
    }

    setCreating(true);
    setCreateError('');

    let attachmentUrl: string | null = null;
    if (form.attachment) {
      attachmentUrl = await uploadAttachment(form.attachment);
      if (form.attachment && !attachmentUrl) {
        setCreating(false);
        return;
      }
    }

    const { data, error } = await supabase.rpc('create_support_ticket', {
      p_category: form.category,
      p_subject: form.subject.trim(),
      p_message: form.message.trim(),
      p_attachment_url: attachmentUrl,
    });

    if (error) {
      setCreateError(error.message.replace(/^ERROR:\s*/, ''));
      setCreating(false);
      return;
    }

    setCreating(false);
    setShowCreate(false);
    setForm({ category: 'task_issue', subject: '', message: '', attachment: null });
    setAttachmentName('');
    await load();

    if (data) {
      navigate(`/dashboard/support/${data}`);
    }
  };

  const resetForm = () => {
    setForm({ category: 'task_issue', subject: '', message: '', attachment: null });
    setAttachmentName('');
    setCreateError('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Help &amp; Support</h1>
          <p className="mt-1 text-sm text-ink-400">Get help with tasks, payments, withdrawals, and more</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus className="h-4 w-4" /> New Ticket
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search by ticket number or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input sm:w-40 cursor-pointer"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      <Card className="p-5">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy className="h-10 w-10" />}
            title="No support tickets"
            description="You haven't created any support tickets yet. Click 'New Ticket' to get help."
            action={<Button onClick={() => { resetForm(); setShowCreate(true); }}><Plus className="h-4 w-4" /> New Ticket</Button>}
          />
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/dashboard/support/${ticket.id}`}
                className="flex items-center gap-4 rounded-xl p-3 transition hover:bg-ink-800/50 border border-transparent hover:border-ink-200"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-brand-400">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-400">{ticket.ticket_number}</span>
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                  <p className="mt-0.5 truncate font-medium text-white">{ticket.subject}</p>
                  <p className="text-xs text-ink-400">{categoryLabels[ticket.category]} · Updated {timeAgo(ticket.updated_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Support Ticket" size="md">
        <div className="space-y-4">
          {createError && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{createError}</div>}

          <Select
            label="Category"
            value={form.category}
            onChange={(e) => setForm(f => ({ ...f, category: e.target.value as TicketCategory }))}
          >
            <option value="task_issue">Task Issue</option>
            <option value="payment_reward">Payment / Reward</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="account">Account</option>
            <option value="referral">Referral</option>
            <option value="technical">Technical</option>
            <option value="other">Other</option>
          </Select>

          <Input
            label="Subject"
            placeholder="Brief summary of your issue"
            value={form.subject}
            onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
            maxLength={200}
          />

          <Textarea
            label="Describe your issue"
            placeholder="Provide as much detail as possible..."
            value={form.message}
            onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
            rows={5}
            maxLength={2000}
          />

          <div>
            <label className="label">Attachment (Optional)</label>
            <p className="mb-1.5 text-xs text-ink-400">You can attach a screenshot if it helps explain the issue.</p>
            {attachmentName ? (
              <div className="flex items-center gap-2 rounded-xl bg-ink-800/50 p-3">
                <Paperclip className="h-4 w-4 text-brand-400" />
                <span className="flex-1 truncate text-sm text-white">{attachmentName}</span>
                <button
                  onClick={() => { setForm(f => ({ ...f, attachment: null })); setAttachmentName(''); }}
                  className="rounded-lg p-1 text-ink-400 hover:text-danger-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink-200 p-3 text-sm text-ink-400 transition hover:border-brand-600/40 hover:text-white">
                <Paperclip className="h-4 w-4" />
                <span>Click to upload (PNG, JPEG, WebP, GIF, PDF — max 5MB)</span>
                <input type="file" className="hidden" onChange={handleFileChange} accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />} Create Ticket
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
