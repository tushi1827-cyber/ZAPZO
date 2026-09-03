import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, CheckCircle2, XCircle, Banknote, Clock, Gift, Wallet,
  CheckCheck, Trash2, ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { Notification } from '@/types';

const typeIcon: Record<string, typeof Bell> = {
  submission_approved: CheckCircle2,
  submission_rejected: XCircle,
  withdrawal_paid: Banknote,
  withdrawal_rejected: XCircle,
  withdrawal_processing: Clock,
  referral_qualified: Gift,
  wallet_adjustment: Wallet,
};

const typeTone: Record<string, 'success' | 'danger' | 'warning' | 'brand' | 'info'> = {
  submission_approved: 'success',
  submission_rejected: 'danger',
  withdrawal_paid: 'success',
  withdrawal_rejected: 'danger',
  withdrawal_processing: 'warning',
  referral_qualified: 'brand',
  wallet_adjustment: 'info',
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

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const isBusy = busyId !== null || markingAll;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setError('Failed to load notifications.');
    setNotifications((data as Notification[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = async () => {
    if (isBusy) return;
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    setMarkingAll(true);
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unread.map((n) => n.id));
    setMarkingAll(false);
    if (error) { setError('Failed to mark notifications as read.'); return; }
    await load();
  };

  const markRead = async (id: string) => {
    if (isBusy) return;
    setBusyId(id);
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setBusyId(null);
    if (error) { setError('Failed to update notification.'); return; }
    await load();
  };

  const deleteNotification = async (id: string) => {
    if (isBusy) return;
    setBusyId(id);
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    setBusyId(null);
    if (error) { setError('Failed to delete notification.'); return; }
    await load();
  };

  const filtered = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-ink-400">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'You are all caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllRead} variant="secondary" size="sm" disabled={isBusy}>
            {markingAll ? <Spinner size="sm" /> : <CheckCheck className="h-4 w-4" />} Mark all read
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              filter === f
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800 text-ink-400 hover:bg-ink-300/30 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      <Card className="p-5">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-10 w-10" />}
            title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description={filter === 'unread' ? 'You have read all your notifications.' : 'Notifications about your submissions, withdrawals, and referrals will appear here.'}
          />
        ) : (
          <div className="space-y-1">
            {filtered.map((n) => {
              const Icon = typeIcon[n.type] || Bell;
              const tone = typeTone[n.type] || 'neutral';
              const toneBg: Record<string, string> = {
                success: 'bg-accent-400/10 text-accent-400',
                danger: 'bg-danger-500/10 text-danger-400',
                warning: 'bg-warning-500/15 text-warning-400',
                brand: 'bg-brand-600/15 text-brand-400',
                info: 'bg-brand-600/10 text-brand-400',
              };
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 rounded-xl p-3 transition hover:bg-ink-800/50 ${!n.is_read ? 'bg-brand-600/5' : ''}`}
                >
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneBg[tone] || 'bg-ink-800 text-ink-400'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{n.title}</p>
                      {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                    </div>
                    {n.body && <p className="mt-0.5 text-sm text-ink-400">{n.body}</p>}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-ink-400">{timeAgo(n.created_at)}</span>
                      <Badge tone={tone} className="capitalize">{n.type.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {n.link && (
                      <Link
                        to={n.link}
                        onClick={() => !n.is_read && markRead(n.id)}
                        className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-white"
                        title="Open"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                    {!n.is_read && (
                      <button
                        onClick={() => markRead(n.id)}
                        disabled={isBusy}
                        className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Mark read"
                      >
                        {busyId === n.id ? <Spinner size="sm" /> : <CheckCheck className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      disabled={isBusy}
                      className="rounded-lg p-2 text-ink-400 transition hover:bg-danger-500/10 hover:text-danger-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Delete"
                    >
                      {busyId === n.id ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
