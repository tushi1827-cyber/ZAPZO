import { useState, ReactNode } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  Shield, Users, ClipboardList, FileCheck, ArrowDownToLine, Share2,
  Wallet, Settings as SettingsIcon, LayoutDashboard, Menu, X, LogOut, ScrollText,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/tasks', label: 'Tasks', icon: ClipboardList },
  { to: '/admin/submissions', label: 'Submissions', icon: FileCheck },
  { to: '/admin/withdrawals', label: 'Withdrawals', icon: ArrowDownToLine },
  { to: '/admin/referrals', label: 'Referrals', icon: Share2 },
  { to: '/admin/transactions', label: 'Transactions', icon: Wallet },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/admin/fraud', label: 'Fraud & Abuse', icon: ShieldAlert },
];

export function AdminLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white shadow-glow-purple">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="font-extrabold tracking-tight text-white">Admin Panel</p>
            <p className="text-xs text-ink-400">ZAPZO Management</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
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
        <div className="my-3 h-px bg-ink-200" />
        <Link
          to="/dashboard"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-400 transition hover:bg-ink-800 hover:text-white"
        >
          <LayoutDashboard className="h-5 w-5" />
          User Dashboard
        </Link>
      </nav>
      <div className="border-t border-ink-200 p-4">
        <p className="truncate text-sm font-semibold text-white">{profile?.name || 'Admin'}</p>
        <p className="truncate text-xs text-ink-400">{profile?.referral_code}</p>
        <button onClick={handleSignOut} aria-label="Sign out" className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-danger-400 transition hover:bg-danger-500/10">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-200 bg-ink-900 lg:block">
        <NavContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-ink-900 animate-slide-up">
            <NavContent />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-200 bg-ink-950/80 px-4 py-3 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white lg:hidden" aria-label="Open menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/" className="lg:hidden"><Logo size="sm" /></Link>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="text-sm font-medium text-ink-400 transition hover:text-white">
              User View
            </Link>
          </div>
        </div>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AdminPageWrapper({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
