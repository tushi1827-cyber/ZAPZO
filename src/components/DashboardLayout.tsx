import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Wallet, Users, ArrowDownToLine,
  Menu, X, LogOut, Shield, Zap, Ban, Settings as SettingsIcon, Bell, FileCheck,
  CheckCircle2, XCircle, Banknote, Clock, Gift, Send, Sparkles,
  CheckCheck, ExternalLink, LifeBuoy, MessageCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/notificationsApi';
import { Notification } from '@/types';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/dashboard/tasks', label: 'Browse Tasks', icon: ClipboardList },
  { to: '/dashboard/submissions', label: 'My Submissions', icon: FileCheck },
  { to: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
  { to: '/dashboard/referrals', label: 'Referrals', icon: Users },
  { to: '/dashboard/withdraw', label: 'Withdraw', icon: ArrowDownToLine },
  { to: '/dashboard/profile', label: 'Profile', icon: SettingsIcon },
  { to: '/dashboard/support', label: 'Help & Support', icon: LifeBuoy },
  { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
];

const typeIcon: Record<string, typeof Bell> = {
  task_submitted: Send,
  task_approved: CheckCircle2,
  task_rejected: XCircle,
  submission_approved: CheckCircle2,
  submission_rejected: XCircle,
  reward_received: Sparkles,
  withdrawal_requested: ArrowDownToLine,
  withdrawal_processing: Clock,
  withdrawal_paid: Banknote,
  withdrawal_rejected: XCircle,
  gift_card_fulfilled: Gift,
  referral_reward: Users,
  referral_qualified: Users,
  wallet_adjustment: Wallet,
  support_reply: MessageCircle,
  ticket_status_changed: LifeBuoy,
  success: CheckCircle2,
  danger: XCircle,
};

const toneBg: Record<string, string> = {
  success: 'bg-accent-400/10 text-accent-400',
  danger: 'bg-danger-500/10 text-danger-400',
  warning: 'bg-warning-500/15 text-warning-400',
  brand: 'bg-brand-600/15 text-brand-400',
  info: 'bg-brand-600/10 text-brand-400',
};

const typeTone: Record<string, string> = {
  task_submitted: 'info',
  task_approved: 'success',
  task_rejected: 'danger',
  submission_approved: 'success',
  submission_rejected: 'danger',
  reward_received: 'success',
  withdrawal_requested: 'info',
  withdrawal_processing: 'warning',
  withdrawal_paid: 'success',
  withdrawal_rejected: 'danger',
  gift_card_fulfilled: 'brand',
  referral_reward: 'brand',
  referral_qualified: 'brand',
  wallet_adjustment: 'info',
  support_reply: 'brand',
  ticket_status_changed: 'info',
  success: 'success',
  danger: 'danger',
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

function NotificationBell({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(8);
      setNotifications(data);
    } catch {
      setNotifications([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(() => {
      fetchUnread();
      if (open) fetchRecent();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread, fetchRecent, open]);

  useEffect(() => {
    if (open) fetchRecent();
  }, [open, fetchRecent]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
    } catch {
      setMarkingAll(false);
      return;
    }
    setMarkingAll(false);
    await fetchRecent();
    await fetchUnread();
  };

  const markRead = async (id: string) => {
    try {
      await markNotificationRead(id);
    } catch {
      return;
    }
    await fetchRecent();
    await fetchUnread();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-white"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-ink-200 bg-ink-900 shadow-2xl z-50 animate-slide-up">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <p className="font-semibold text-white">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-1 text-xs font-medium text-brand-400 transition hover:text-brand-300 disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-ink-400" />
                <p className="text-sm text-ink-400">No notifications yet</p>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((n) => {
                  const Icon = typeIcon[n.type] || Bell;
                  const tone = typeTone[n.type] || 'info';
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-3 py-2.5 transition hover:bg-ink-800/50 ${!n.is_read ? 'bg-brand-600/5' : ''}`}
                    >
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${toneBg[tone] || 'bg-ink-800 text-ink-400'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-white">{n.title}</p>
                          {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                        </div>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{n.body}</p>}
                        <p className="mt-0.5 text-[11px] text-ink-400">{timeAgo(n.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {n.link && (
                          <Link
                            to={n.link}
                            onClick={() => { if (!n.is_read) markRead(n.id); setOpen(false); }}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-white"
                            title="Open"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        {!n.is_read && (
                          <button
                            onClick={() => markRead(n.id)}
                            className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-white"
                            title="Mark read"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-ink-200 px-4 py-2.5">
            <Link
              to="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-sm font-medium text-brand-400 transition hover:text-brand-300"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardLayout() {
  const { profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isSuspended = profile?.is_suspended;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <Logo size="sm" />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-brand-600 text-white shadow-glow-purple'
                  : 'text-ink-400 hover:bg-ink-800 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <>
            <div className="my-3 h-px bg-ink-200" />
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-accent-400 transition hover:bg-accent-400/10"
            >
              <Shield className="h-5 w-5" />
              Admin Panel
            </Link>
          </>
        )}
      </nav>
      <div className="border-t border-ink-200 p-4">
        <Link to="/dashboard/profile" className="flex items-center gap-3 rounded-xl bg-ink-800/50 p-3 transition hover:bg-ink-800">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600/15 text-brand-400">
            <Zap className="h-4 w-4" fill="currentColor" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.name || 'User'}</p>
            <p className="truncate text-xs text-ink-400">{profile?.referral_code}</p>
          </div>
        </Link>
        <button onClick={handleSignOut} aria-label="Sign out" className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-danger-400 transition hover:bg-danger-500/10">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-200 bg-ink-900 lg:block">
        <NavContent />
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-ink-900 animate-slide-up">
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-200 bg-ink-950/80 px-4 py-3 backdrop-blur-lg lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo size="sm" />
          {profile && <NotificationBell profileId={profile.id} />}
        </div>

        {/* Desktop top bar */}
        <div className="sticky top-0 z-20 hidden items-center justify-end border-b border-ink-200 bg-ink-950/80 px-6 py-3 backdrop-blur-lg lg:flex">
          {profile && <NotificationBell profileId={profile.id} />}
        </div>

        {isSuspended && (
          <div className="flex items-center gap-2 border-b border-danger-500/30 bg-danger-500/10 px-4 py-2.5 text-sm text-danger-400">
            <Ban className="h-4 w-4 shrink-0" />
            Your account is suspended. Some actions may be restricted. Contact support if you believe this is an error.
          </div>
        )}

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
