import { useState, useEffect, ReactNode } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Wallet, Users, ArrowDownToLine,
  Menu, X, LogOut, Shield, Zap, Ban, Settings as SettingsIcon, Bell, FileCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { supabase } from '@/lib/supabase';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/dashboard/tasks', label: 'Browse Tasks', icon: ClipboardList },
  { to: '/dashboard/submissions', label: 'My Submissions', icon: FileCheck },
  { to: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
  { to: '/dashboard/referrals', label: 'Referrals', icon: Users },
  { to: '/dashboard/withdraw', label: 'Withdraw', icon: ArrowDownToLine },
  { to: '/dashboard/profile', label: 'Profile', icon: SettingsIcon },
  { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
];

export function DashboardLayout() {
  const { profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isSuspended = profile?.is_suspended;

  useEffect(() => {
    if (!profile) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    };
    fetchUnread();
    const channel = supabase
      .channel('notifications-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, fetchUnread)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

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
          <Link to="/dashboard/notifications" className="relative rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}>
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Desktop top bar */}
        <div className="sticky top-0 z-20 hidden items-center justify-end border-b border-ink-200 bg-ink-950/80 px-6 py-3 backdrop-blur-lg lg:flex">
          <Link to="/dashboard/notifications" className="relative rounded-lg p-2 text-ink-400 transition hover:bg-ink-800 hover:text-white" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}>
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
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
