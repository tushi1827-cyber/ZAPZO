import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, Clock, TrendingUp, Users, ClipboardList, ArrowDownToLine,
  ArrowRight, Gift, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { supabase } from '@/lib/supabase';
import { WalletTransaction, TaskSubmission, Referral } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DashboardPage() {
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
    { label: 'Available Balance', value: stats ? formatMoney(stats.availableBalance) : '—', icon: Wallet, tone: 'bg-brand-600/15 text-brand-400', glow: true },
    { label: 'Pending Rewards', value: stats ? formatMoney(stats.pendingRewards) : '—', icon: Clock, tone: 'bg-warning-500/15 text-warning-400' },
    { label: 'Total Earned', value: stats ? formatMoney(stats.totalEarned) : '—', icon: TrendingUp, tone: 'bg-accent-400/10 text-accent-400' },
    { label: 'Referral Earnings', value: stats ? formatMoney(stats.referralEarnings) : '—', icon: Users, tone: 'bg-accent-400/10 text-accent-400' },
  ];

  const statRow = [
    { label: 'Tasks Completed', value: stats?.tasksCompleted ?? 0, icon: ClipboardList },
    { label: 'Qualified Referrals', value: stats?.qualifiedReferrals ?? 0, icon: CheckCircle2 },
    { label: 'Total Withdrawals', value: stats ? formatMoney(stats.totalWithdrawals) : '—', icon: ArrowDownToLine },
  ];

  const quickActions = [
    { to: '/dashboard/tasks', label: 'Browse Tasks', icon: ClipboardList },
    { to: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
    { to: '/dashboard/referrals', label: 'Refer Friends', icon: Gift },
    { to: '/dashboard/withdraw', label: 'Withdraw', icon: ArrowDownToLine },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-400">Welcome back — here's your earnings overview.</p>
      </div>

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

      {/* Balance cards */}
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

      {/* Stat row */}
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

      {/* Quick actions */}
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

      {/* Recent activity */}
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
                    <p className="truncate text-sm font-medium text-ink-50">{tx.description}</p>
                    <p className="text-xs capitalize text-ink-400">{tx.type.replace(/_/g, ' ')}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${Number(tx.amount) >= 0 ? 'text-accent-400' : 'text-ink-400'}`}>
                    {Number(tx.amount) >= 0 ? '+' : ''}{formatMoney(tx.amount)}
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

      {/* Referrals */}
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
                  {ref.reward_amount > 0 && <span className="text-sm font-bold text-accent-400">{formatMoney(ref.reward_amount)}</span>}
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
