import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Wallet, Clock, TrendingUp, Users, ClipboardList, ArrowDownToLine,
  ArrowRight, Gift, CheckCircle2, AlertCircle,
  User as UserIcon, Mail, Calendar, Zap, Shield, Ban,
  Save, Lock, Copy, Check, SlidersHorizontal, LayoutDashboard,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { supabase } from '@/lib/supabase';
import { WalletTransaction, TaskSubmission, Referral } from '@/types';
import { formatCoins, formatSignedCoins } from '@/lib/format';

type AccountTab = 'overview' | 'profile' | 'settings';

const TABS: { id: AccountTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'profile', label: 'Personal Profile', icon: UserIcon },
  { id: 'settings', label: 'Account Settings', icon: SlidersHorizontal },
];

function OverviewSection() {
  const { user, profile } = useAuth();
  const { stats, loading, error } = useDashboardStats();
  const [txns, setTxns] = useState<WalletTransaction[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [activityError, setActivityError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setActivityError('');
      const [tx, sub, ref] = await Promise.all([
        supabase.from('wallet_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('task_submissions').select('*, task:tasks(title)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('referrals').select('*, referred:profiles!referred_id(name, referral_code, created_at)').eq('referrer_id', user.id).order('created_at', { ascending: false }).limit(5),
      ]);
      if (tx.error || sub.error || ref.error) {
        setActivityError('Failed to load recent activity. Some sections may be incomplete.');
      }
      setTxns((tx.data as WalletTransaction[]) || []);
      setSubmissions((sub.data as TaskSubmission[]) || []);
      setReferrals((ref.data as Referral[]) || []);
    })();
  }, [user]);

  if (loading && !stats) return <Spinner size="lg" className="py-20" />;

  const statCards = [
    { label: 'Available Balance', value: stats ? formatCoins(stats.availableBalance) : '—', icon: Wallet, tone: 'bg-brand-600/15 text-brand-400', glow: true },
    { label: 'Pending Rewards', value: stats ? formatCoins(stats.pendingRewards) : '—', icon: Clock, tone: 'bg-warning-500/15 text-warning-400' },
    { label: 'Total Earned', value: stats ? formatCoins(stats.totalEarned) : '—', icon: TrendingUp, tone: 'bg-accent-400/10 text-accent-400' },
    { label: 'Referral Earnings', value: stats ? formatCoins(stats.referralEarnings) : '—', icon: Users, tone: 'bg-accent-400/10 text-accent-400' },
  ];

  const statRow = [
    { label: 'Tasks Completed', value: stats?.tasksCompleted ?? 0, icon: ClipboardList },
    { label: 'Qualified Referrals', value: stats?.qualifiedReferrals ?? 0, icon: CheckCircle2 },
    { label: 'Total Withdrawals', value: stats ? formatCoins(stats.totalWithdrawals) : '—', icon: ArrowDownToLine },
  ];

  const quickActions = [
    { to: '/dashboard/tasks', label: 'Browse Tasks', icon: ClipboardList },
    { to: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
    { to: '/dashboard/referrals', label: 'Refer Friends', icon: Gift },
    { to: '/dashboard/withdraw', label: 'Withdraw', icon: ArrowDownToLine },
  ];

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">{error}</div>}
      {activityError && !error && <div className="rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">{activityError}</div>}

      {profile?.is_suspended && (
        <div className="flex items-center gap-3 rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Your account is suspended.</p>
            <p className="text-xs">You can browse tasks and view your wallet, but cannot submit new tasks or request withdrawals. Contact support if you believe this is an error.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} accent={card.glow} className={`p-5 ${card.glow ? 'shadow-glow-purple' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-ink-400">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-white">{card.value}</p>
              </div>
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${card.tone}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statRow.map((s) => (
          <Card key={s.label} className="flex items-center gap-4 p-5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800 text-ink-400">
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-400">{s.label}</p>
              <p className="text-xl font-bold text-white">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map((action) => (
          <Link key={action.to} to={action.to} className="card group flex flex-col items-center gap-2 p-5 transition hover:border-brand-600/40 hover:-translate-y-0.5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/15 text-brand-400 transition group-hover:bg-brand-600 group-hover:text-white">
              <action.icon className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-ink-400">{action.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">Recent Transactions</h2>
            <Link to="/dashboard/wallet" className="text-xs font-medium text-brand-400 hover:text-brand-300">View all <ArrowRight className="inline h-3 w-3" /></Link>
          </div>
          {txns.length === 0 ? (
            <EmptyState title="No transactions yet" description="Complete a task to earn your first reward." />
          ) : (
            <div className="mt-4 space-y-2">
              {txns.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-50">
                      {tx.type === 'withdrawal'
                        ? (tx.status as string) === 'completed' || (tx.status as string) === 'paid'
                          ? 'Withdrawal Success'
                          : (tx.status as string) === 'reversed'
                            ? 'Withdrawal Reversed'
                            : 'Withdrawal Request'
                        : tx.description}
                    </p>
                    <p className="text-xs capitalize text-ink-400">{tx.type.replace(/_/g, ' ')}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${Number(tx.amount) >= 0 ? 'text-accent-400' : 'text-danger-400'}`}>
                    {formatSignedCoins(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">Recent Tasks</h2>
            <Link to="/dashboard/tasks" className="text-xs font-medium text-brand-400 hover:text-brand-300">Browse <ArrowRight className="inline h-3 w-3" /></Link>
          </div>
          {submissions.length === 0 ? (
            <EmptyState title="No submissions yet" description="Browse available tasks to get started." action={<Button to="/dashboard/tasks" size="sm">Browse Tasks</Button>} />
          ) : (
            <div className="mt-4 space-y-2">
              {submissions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                  <p className="truncate text-sm font-medium text-ink-50">{sub.task?.title || 'Task'}</p>
                  <StatusBadge status={sub.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white">Recent Referrals</h2>
          <Link to="/dashboard/referrals" className="text-xs font-medium text-brand-400 hover:text-brand-300">View all <ArrowRight className="inline h-3 w-3" /></Link>
        </div>
        {referrals.length === 0 ? (
          <EmptyState title="No referrals yet" description="Share your referral code to start earning referral rewards." action={<Button to="/dashboard/referrals" size="sm">Get your link</Button>} />
        ) : (
          <div className="mt-4 space-y-2">
            {referrals.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                <div>
                  <p className="text-sm font-medium text-ink-50">{ref.referred?.name || 'User'}</p>
                  <p className="text-xs text-ink-400">{ref.referred?.referral_code}</p>
                </div>
                <div className="flex items-center gap-3">
                  {ref.reward_amount > 0 && <span className="text-sm font-bold text-accent-400">{formatCoins(ref.reward_amount)}</span>}
                  <StatusBadge status={ref.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProfileSection() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile) setName(profile.name);
  }, [profile]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setNameSuccess(false);
    if (name.trim().length < 2) {
      setNameError('Name must be at least 2 characters.');
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim() })
      .eq('id', user!.id);
    setSavingName(false);
    if (error) {
      setNameError(error.message);
      return;
    }
    await refreshProfile();
    setNameSuccess(true);
    setTimeout(() => setNameSuccess(false), 3000);
  };

  const copyReferralCode = async () => {
    try {
      await navigator.clipboard.writeText(profile?.referral_code || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  if (!profile) return <Spinner size="lg" className="py-20" />;

  const accountInfo = [
    { icon: Mail, label: 'Email', value: user?.email || '—' },
    { icon: Zap, label: 'Referral Code', value: profile.referral_code, mono: true, copyable: true },
    { icon: Calendar, label: 'Member Since', value: new Date(profile.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) },
    { icon: Shield, label: 'Role', value: profile.is_admin ? 'Administrator' : 'Member' },
  ];

  return (
    <div className="space-y-6">
      {profile.is_suspended && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">
          <Ban className="h-4 w-4 shrink-0" />
          Your account is suspended. Some actions may be restricted.
        </div>
      )}

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-600/15 text-brand-400">
            <UserIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-white">{profile.name || 'Unnamed'}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={profile.is_suspended ? 'danger' : 'success'}>
                {profile.is_suspended ? 'Suspended' : 'Active'}
              </Badge>
              {profile.is_admin && <Badge tone="brand">Admin</Badge>}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {accountInfo.map((item) => (
            <div key={item.label} className="rounded-xl bg-ink-800/50 p-4">
              <div className="flex items-center gap-2">
                <item.icon className="h-4 w-4 text-ink-400" />
                <p className="text-xs text-ink-400">{item.label}</p>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className={`truncate font-semibold text-white ${item.mono ? 'font-mono' : ''}`}>
                  {item.value}
                </p>
                {item.copyable && (
                  <button
                    onClick={copyReferralCode}
                    className="shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-white"
                    title="Copy code"
                  >
                    {copied ? <Check className="h-4 w-4 text-accent-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-white">Display Name</h2>
        <p className="mt-1 text-sm text-ink-400">This is the name shown on your profile and to administrators.</p>
        <form onSubmit={handleSaveName} className="mt-4 space-y-4">
          <Input
            label="Name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your display name"
            error={nameError || undefined}
          />
          {nameSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Name updated successfully!
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={savingName || name.trim() === profile.name}>
              {savingName ? <Spinner size="sm" /> : <><Save className="h-4 w-4" /> Save Name</>}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SettingsSection() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPasswordSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-brand-400" />
          <h2 className="font-bold text-white">Change Password</h2>
        </div>
        <p className="mt-1 text-sm text-ink-400">Choose a strong password of at least 6 characters.</p>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <Input
            label="New Password"
            type="password"
            name="new_password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            autoComplete="new-password"
          />
          <Input
            label="Confirm New Password"
            type="password"
            name="confirm_password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            error={passwordError || undefined}
          />
          {passwordSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Password changed successfully!
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <AlertCircle className="h-3.5 w-3.5" />
              You'll stay logged in on this device.
            </p>
            <Button type="submit" disabled={savingPassword || !newPassword || !confirmPassword}>
              {savingPassword ? <Spinner size="sm" /> : <><Lock className="h-4 w-4" /> Update Password</>}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-white">Account Information</h2>
        <p className="mt-1 text-sm text-ink-400">Your registered email and account identifiers.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-ink-800/50 p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-ink-400" />
              <p className="text-xs text-ink-400">Email</p>
            </div>
            <p className="mt-1.5 truncate font-semibold text-white">{user?.email || '—'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function MyAccountPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as AccountTab | null;

  const activeTab: AccountTab = useMemo(() => {
    if (tabParam === 'overview' || tabParam === 'profile' || tabParam === 'settings') return tabParam;
    return 'overview';
  }, [tabParam]);

  const setTab = (tab: AccountTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">My Account</h1>
        <p className="mt-1 text-sm text-ink-400">Manage your earnings, profile and security in one place.</p>
      </div>

      {/* Tab navigation */}
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-ink-800/60 p-1 sm:min-w-0">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-600 text-white shadow-glow-purple'
                    : 'text-ink-400 hover:bg-ink-800 hover:text-white'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.id === 'overview' ? 'Overview' : tab.id === 'profile' ? 'Profile' : 'Settings'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'overview' && <OverviewSection />}
      {activeTab === 'profile' && <ProfileSection />}
      {activeTab === 'settings' && <SettingsSection />}

      {profile && activeTab === 'overview' && (
        <p className="text-center text-xs text-ink-400">
          Need to update your details?{' '}
          <button onClick={() => setTab('profile')} className="font-medium text-brand-400 hover:text-brand-300">Edit your profile</button>
        </p>
      )}
    </div>
  );
}
