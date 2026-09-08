import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Send, Paperclip, X, Download, Headset, Lock,
  StickyNote, Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { SupportTicket, TicketMessage, TicketActivityLog } from '@/types';

const categoryLabels: Record<string, string> = {
  task_issue: 'Task Issue',
  payment_reward: 'Payment / Reward',
  withdrawal: 'Withdrawal',
  account: 'Account',
  referral: 'Referral',
  technical: 'Technical',
  other: 'Other',
};

const statusOptions = ['open', 'in_progress', 'resolved', 'closed'];
const priorityOptions = ['low', 'medium', 'high', 'urgent'];

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

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    created: 'Ticket created',
    status_changed: 'Status changed',
    priority_changed: 'Priority changed',
    replied: 'Reply sent',
    note_added: 'Internal note added',
    reopened: 'Ticket reopened',
  };
  return map[action] || action;
}

export function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [userProfile, setUserProfile] = useState<{ name: string; referral_code: string } | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [activity, setActivity] = useState<TicketActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentName, setAttachmentName] = useState('');
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [urlLoading, setUrlLoading] = useState<Set<string>>(new Set());
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [priorityUpdating, setPriorityUpdating] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadTicket = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) { setError('Failed to load ticket.'); return; }
    if (!data) { setError('Ticket not found.'); return; }
    setTicket(data as SupportTicket);

    // Load user profile
    if (data) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, referral_code')
        .eq('id', data.user_id)
        .maybeSingle();
      setUserProfile(profile);
    }
  }, [id]);

  const loadMessages = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    if (error) { setError('Failed to load messages.'); return; }
    setMessages((data as TicketMessage[]) || []);
  }, [id]);

  const loadActivity = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('ticket_activity_log')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    if (error) return;
    setActivity((data as TicketActivityLog[]) || []);
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadTicket(), loadMessages(), loadActivity()]);
      setLoading(false);
    })();
  }, [loadTicket, loadMessages, loadActivity]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`admin-ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` }, () => {
        loadMessages();
        loadActivity();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` }, () => {
        loadTicket();
        loadActivity();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, loadMessages, loadTicket, loadActivity]);

  const getSignedUrl = async (path: string) => {
    if (signedUrls[path] || urlLoading.has(path)) return;
    setUrlLoading(prev => new Set(prev).add(path));
    const { data } = await supabase.storage.from('support-attachments').createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
    }
    setUrlLoading(prev => { const next = new Set(prev); next.delete(path); return next; });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('File size must be under 5MB.'); return; }
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) { setError('Only PNG, JPEG, WebP, GIF, and PDF files are allowed.'); return; }
    setAttachment(file);
    setAttachmentName(file.name);
    setError('');
  };

  const uploadAttachment = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'bin';
    const userId = ticket?.user_id || '';
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('support-attachments').upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
    });
    if (upErr) { setError('Failed to upload attachment. Please try again.'); return null; }
    return filePath;
  };

  const handleSend = async () => {
    if (!reply.trim() || !id) return;
    setSending(true);
    setError('');

    let attachmentUrl: string | null = null;
    if (attachment) {
      attachmentUrl = await uploadAttachment(attachment);
      if (attachment && !attachmentUrl) { setSending(false); return; }
    }

    const { error: rpcError } = await supabase.rpc('admin_reply_to_ticket', {
      p_ticket_id: id,
      p_message: reply.trim(),
      p_attachment_url: attachmentUrl,
      p_is_internal: isInternal,
    });

    if (rpcError) {
      setError(rpcError.message.replace(/^ERROR:\s*/, ''));
      setSending(false);
      return;
    }

    setReply('');
    setAttachment(null);
    setAttachmentName('');
    setIsInternal(false);
    setSending(false);
    await Promise.all([loadMessages(), loadActivity()]);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id || !ticket || ticket.status === newStatus) return;
    setStatusUpdating(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('admin_update_ticket_status', {
      p_ticket_id: id,
      p_status: newStatus,
    });
    setStatusUpdating(false);
    if (rpcError) { setError(rpcError.message.replace(/^ERROR:\s*/, '')); return; }
    await Promise.all([loadTicket(), loadActivity()]);
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!id || !ticket || ticket.priority === newPriority) return;
    setPriorityUpdating(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('admin_update_ticket_priority', {
      p_ticket_id: id,
      p_priority: newPriority,
    });
    setPriorityUpdating(false);
    if (rpcError) { setError(rpcError.message.replace(/^ERROR:\s*/, '')); return; }
    await Promise.all([loadTicket(), loadActivity()]);
  };

  if (loading) {
    return (
      <AdminPageWrapper title="Ticket Details">
        <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
      </AdminPageWrapper>
    );
  }

  if (!ticket) {
    return (
      <AdminPageWrapper title="Ticket Details">
        <Link to="/admin/support" className="flex items-center gap-2 text-sm text-ink-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Support Tickets
        </Link>
        <Card className="p-8 mt-4">
          <EmptyState icon={<Headset className="h-10 w-10" />} title="Ticket not found" />
        </Card>
      </AdminPageWrapper>
    );
  }

  return (
    <AdminPageWrapper title={`Ticket ${ticket.ticket_number}`} subtitle={ticket.subject}>
      <Link to="/admin/support" className="flex items-center gap-2 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Support Tickets
      </Link>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      {/* Ticket info bar */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-ink-400">User</p>
            <p className="font-semibold text-white">{userProfile?.name || 'User'}</p>
            <p className="text-xs font-mono text-ink-400">{userProfile?.referral_code}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Category</p>
            <p className="font-semibold text-white">{categoryLabels[ticket.category]}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Created</p>
            <p className="font-semibold text-white">{new Date(ticket.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400">Last Updated</p>
            <p className="font-semibold text-white">{timeAgo(ticket.updated_at)}</p>
          </div>
        </div>

        {/* Status + Priority controls */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-ink-200 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">Status:</span>
            <div className="relative">
              <select
                value={ticket.status}
                onChange={e => handleStatusChange(e.target.value)}
                disabled={statusUpdating}
                className="input cursor-pointer py-1.5 text-sm pr-8"
              >
                {statusOptions.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              {statusUpdating && <Spinner size="sm" />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">Priority:</span>
            <div className="relative">
              <select
                value={ticket.priority}
                onChange={e => handlePriorityChange(e.target.value)}
                disabled={priorityUpdating}
                className="input cursor-pointer py-1.5 text-sm pr-8"
              >
                {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {priorityUpdating && <Spinner size="sm" />}
            </div>
          </div>
          <div className="ml-auto">
            <StatusBadge status={ticket.status} />
            <span className="ml-2"><PriorityBadge priority={ticket.priority} /></span>
          </div>
        </div>
      </Card>

      {/* Conversation */}
      <Card className="flex flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: '55vh' }}>
          {messages.length === 0 ? (
            <EmptyState icon={<Headset className="h-8 w-8" />} title="No messages" />
          ) : (
            messages.map(msg => {
              const isUser = msg.sender_type === 'user';
              const isNote = msg.is_internal_note;
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-start' : isNote ? 'justify-center' : 'justify-end'}`}>
                  <div className={`max-w-[80%] ${isNote ? 'w-full max-w-full' : ''}`}>
                    {isNote ? (
                      <div className="rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-warning-400">
                          <Lock className="h-3.5 w-3.5" /> Internal Note
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-50">{msg.body}</p>
                        {msg.attachment_url && (
                          <div className="mt-2">
                            {signedUrls[msg.attachment_url] ? (
                              <a href={signedUrls[msg.attachment_url]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-black/30">
                                <Download className="h-3.5 w-3.5" /> View Attachment
                              </a>
                            ) : (
                              <button onClick={() => getSignedUrl(msg.attachment_url!)} disabled={urlLoading.has(msg.attachment_url)} className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-black/30 disabled:opacity-50">
                                {urlLoading.has(msg.attachment_url) ? <Spinner size="sm" /> : <Paperclip className="h-3.5 w-3.5" />} Load Attachment
                              </button>
                            )}
                          </div>
                        )}
                        <p className="mt-1 text-xs text-ink-400">Admin · {timeAgo(msg.created_at)}</p>
                      </div>
                    ) : (
                      <div className={`rounded-2xl px-4 py-3 ${isUser ? 'bg-ink-800 text-white' : 'bg-brand-600 text-white'}`}>
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.body}</p>
                        {msg.attachment_url && (
                          <div className="mt-2">
                            {signedUrls[msg.attachment_url] ? (
                              <a href={signedUrls[msg.attachment_url]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-black/30">
                                <Download className="h-3.5 w-3.5" /> View Attachment
                              </a>
                            ) : (
                              <button onClick={() => getSignedUrl(msg.attachment_url!)} disabled={urlLoading.has(msg.attachment_url)} className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-black/30 disabled:opacity-50">
                                {urlLoading.has(msg.attachment_url) ? <Spinner size="sm" /> : <Paperclip className="h-3.5 w-3.5" />} Load Attachment
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {!isNote && (
                      <p className={`mt-1 text-xs text-ink-400 ${isUser ? 'text-left' : 'text-right'}`}>
                        {isUser ? userProfile?.name || 'User' : 'Admin'} · {timeAgo(msg.created_at)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply box */}
        <div className="border-t border-ink-200 p-4">
          {attachmentName && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-ink-800/50 px-3 py-2">
              <Paperclip className="h-4 w-4 text-brand-400" />
              <span className="flex-1 truncate text-sm text-white">{attachmentName}</span>
              <button onClick={() => { setAttachment(null); setAttachmentName(''); }} className="text-ink-400 hover:text-danger-400">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label className="cursor-pointer rounded-xl bg-ink-800 p-2.5 text-ink-400 transition hover:bg-ink-300/30 hover:text-white">
              <Paperclip className="h-5 w-5" />
              <input type="file" className="hidden" onChange={handleFileChange} accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
            </label>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder={isInternal ? "Type internal note (user won't see this)..." : "Type your reply..."}
              rows={2}
              className="input flex-1 resize-none"
              disabled={sending}
            />
            <Button onClick={handleSend} disabled={sending || !reply.trim()} variant={isInternal ? 'secondary' : 'primary'}>
              {sending ? <Spinner size="sm" /> : isInternal ? <StickyNote className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-400">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={e => setIsInternal(e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <Lock className="h-3.5 w-3.5" /> Internal note (hidden from user)
            </label>
          </div>
        </div>
      </Card>

      {/* Activity log toggle */}
      <div>
        <button
          onClick={() => setShowActivity(!showActivity)}
          className="flex items-center gap-2 text-sm font-medium text-ink-400 transition hover:text-white"
        >
          <Activity className="h-4 w-4" />
          {showActivity ? 'Hide' : 'Show'} Activity History ({activity.length})
        </button>
        {showActivity && (
          <Card className="mt-3 p-4">
            {activity.length === 0 ? (
              <p className="text-sm text-ink-400">No activity recorded.</p>
            ) : (
              <div className="space-y-2">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                    <div>
                      <p className="text-white">{actionLabel(a.action)}</p>
                      {a.old_value && a.new_value && (
                        <p className="text-xs text-ink-400">{a.old_value.replace('_', ' ')} → {a.new_value.replace('_', ' ')}</p>
                      )}
                      <p className="text-xs text-ink-400">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </AdminPageWrapper>
  );
}
