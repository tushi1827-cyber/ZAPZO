import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, X, Download, LifeBuoy } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { SupportTicket, TicketMessage } from '@/types';

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

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentName, setAttachmentName] = useState('');
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [urlLoading, setUrlLoading] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadTicket(), loadMessages()]);
      setLoading(false);
    })();
  }, [loadTicket, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` }, () => {
        loadMessages();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` }, () => {
        loadTicket();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, loadMessages, loadTicket]);

  const getSignedUrl = async (path: string) => {
    if (signedUrls[path] || urlLoading.has(path)) return;
    setUrlLoading(prev => new Set(prev).add(path));
    const { data } = await supabase.storage
      .from('support-attachments')
      .createSignedUrl(path, 3600);
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
    if (!profile) return null;
    const ext = file.name.split('.').pop() || 'bin';
    const filePath = `${profile.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('support-attachments').upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
    });
    if (upErr) { setError('Failed to upload attachment. Please try again.'); return null; }
    return filePath;
  };

  const handleSend = async () => {
    if (!reply.trim() || !id) return;
    if (ticket?.status === 'closed') { setError('This ticket is closed. Please create a new ticket.'); return; }

    setSending(true);
    setError('');

    let attachmentUrl: string | null = null;
    if (attachment) {
      attachmentUrl = await uploadAttachment(attachment);
      if (attachment && !attachmentUrl) { setSending(false); return; }
    }

    const { error: rpcError } = await supabase.rpc('reply_to_ticket', {
      p_ticket_id: id,
      p_message: reply.trim(),
      p_attachment_url: attachmentUrl,
    });

    if (rpcError) {
      setError(rpcError.message.replace(/^ERROR:\s*/, ''));
      setSending(false);
      return;
    }

    setReply('');
    setAttachment(null);
    setAttachmentName('');
    setSending(false);
    await loadMessages();
    await loadTicket();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="space-y-6">
        <Link to="/dashboard/support" className="flex items-center gap-2 text-sm text-ink-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Support
        </Link>
        <Card className="p-8">
          <EmptyState icon={<LifeBuoy className="h-10 w-10" />} title="Ticket not found" description="This ticket may have been deleted or you don't have access to it." />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in max-w-4xl">
      <Link to="/dashboard/support" className="flex items-center gap-2 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Support
      </Link>

      {/* Ticket header */}
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-ink-400">{ticket.ticket_number}</span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <h1 className="mt-2 text-xl font-bold text-white">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-ink-400">
              {categoryLabels[ticket.category]} · Created {new Date(ticket.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            </p>
          </div>
        </div>
      </Card>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      {/* Conversation */}
      <Card className="flex flex-col p-0" >
        <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: '60vh' }}>
          {messages.length === 0 ? (
            <EmptyState icon={<LifeBuoy className="h-8 w-8" />} title="No messages yet" description="Start the conversation by sending a message below." />
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender_type === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isUser ? 'order-2' : ''}`}>
                    <div className={`rounded-2xl px-4 py-3 ${isUser ? 'bg-brand-600 text-white' : 'bg-ink-800 text-white'}`}>
                      <p className="whitespace-pre-wrap break-words text-sm">{msg.body}</p>
                      {msg.attachment_url && (
                        <div className="mt-2">
                          {signedUrls[msg.attachment_url] ? (
                            <a href={signedUrls[msg.attachment_url]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-black/30">
                              <Download className="h-3.5 w-3.5" /> View Attachment
                            </a>
                          ) : (
                            <button
                              onClick={() => getSignedUrl(msg.attachment_url!)}
                              disabled={urlLoading.has(msg.attachment_url)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-black/30 disabled:opacity-50"
                            >
                              {urlLoading.has(msg.attachment_url) ? <Spinner size="sm" /> : <Paperclip className="h-3.5 w-3.5" />} Load Attachment
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className={`mt-1 text-xs text-ink-400 ${isUser ? 'text-right' : 'text-left'}`}>
                      {isUser ? 'You' : 'Support'} · {timeAgo(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply box */}
        {ticket.status !== 'closed' ? (
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
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your reply..."
                rows={2}
                className="input flex-1 resize-none"
                disabled={sending}
              />
              <Button onClick={handleSend} disabled={sending || !reply.trim()}>
                {sending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-ink-200 p-5 text-center">
            <p className="text-sm text-ink-400">This ticket is closed. <Link to="/dashboard/support" className="text-brand-400 hover:text-brand-300">Create a new ticket</Link> if you need further assistance.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
