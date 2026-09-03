import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, ClipboardList, CheckCircle2, Coins, Share2, ArrowDownToLine,
  AlertTriangle, ArrowRight, Banknote, TrendingUp, Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTasks: number;
  completedTasks: number;
  totalRewards: number;
  referralRewards: number;
  pendingWithdrawals: number;
  pendingSubmissions: number;
  pendingWithdrawalAmount: number;
  paidWithdrawalAmount: number;
  totalUserBalances: number;
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentSubs, setRecentSubs] = useState<any[]>([]);
  const [recentWds, setRecentWds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      const [
        users, activeUsersQ, tasks, subs,
        txns, refTxns,
        pendingWds, pendingSubs,
        pendingWdAmounts, paidWdAmounts,
        recentS, recentW,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_suspended', false),
        supabase.from('tasks').select('id', { count: 'exact', head: true }),
        supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('wallet_transactions').select('amount').in('type', ['task_reward', 'bonus']),
        supabase.from('wallet_transactions').select('amount').eq('type', 'referral_reward'),
        supabase.from('withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('withdrawals').select('amount').eq('status', 'pending'),
        supabase.from('withdrawals').select('amount').eq('status', 'paid'),
        supabase.from('task_submissions').select('id, status, created_at, task:tasks(title), user:profiles!user_id(name)').order('created_at', { ascending: false }).limit(5),
        supabase.from('withdrawals').select('id, amount, status, created_at, user:profiles!user_id(name)').order('created_at', { ascending: false }).limit(5),
      ]);
      if (users.error || tasks.error || txns.error) {
        setError('Failed to load dashboard statistics. Some data may be incomplete.');
      }

      const totalRewards = (txns.data || []).reduce((s, t: any) => s + Number(t.amount), 0);
      const referralRewards = (refTxns.data || []).reduce((s, t: any) => s + Number(t.amount), 0);
      const pendingWithdrawalAmount = (pendingWdAmounts.data || []).reduce((s: number, w: any) => s + Number(w.amount), 0);
      const paidWithdrawalAmount = (paidWdAmounts.data || []).reduce((s: number, w: any) => s + Number(w.amount), 0);

      setStats({
        totalUsers: users.count || 0,
        activeUsers: activeUsersQ.count || 0,
        totalTasks: tasks.count || 0,
        completedTasks: subs.count || 0,
        totalRewards,
        referralRewards,
        pendingWithdrawals: pendingWds.count || 0,
        pendingSubmissions: pendingSubs.count || 0,
        pendingWithdrawalAmount,
        paidWithdrawalAmount,
        totalUserBalances: totalRewards + referralRewards - paidWithdrawalAmount - pendingWithdrawalAmount,
      });
      setRecentSubs(recentS.data || []);
      setRecentWds(recentW.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Spinner size="lg" className="py-20" />;

  const statCards = [
    { label: 'Total Users', value: stats!.totalUsers, icon: Users, tone: 'bg-brand-600/15 text-brand-400' },
    { label: 'Active Users', value: stats!.activeUsers, icon: Users, tone: 'bg-success-500/15 text-success-400' },
    { label: 'Total Tasks', value: stats!.totalTasks, icon: ClipboardList, tone: 'bg-brand-600/15 text-brand-400' },
    { label: 'Completed Tasks', value: stats!.completedTasks, icon: CheckCircle2, tone: 'bg-success-500/15 text-success-400' },
    { label: 'Total Rewards', value: formatMoney(stats!.totalRewards), icon: Coins, tone: 'bg-accent-400/10 text-accent-400' },
    { label: 'Referral Rewards', value: formatMoney(stats!.referralRewards), icon: Share2, tone: 'bg-accent-400/10 text-accent-400' },
    { label: 'Pending Withdrawals', value: stats!.pendingWithdrawals, icon: ArrowDownToLine, tone: 'bg-warning-500/15 text-warning-400' },
  ];

  const financialCards = [
    { label: 'Pending Payout', value: formatMoney(stats!.pendingWithdrawalAmount), icon: ArrowDownToLine, tone: 'bg-warning-500/15 text-warning-400', hint: 'Awaiting admin review' },
    { label: 'Total Paid Out', value: formatMoney(stats!.paidWithdrawalAmount), icon: Banknote, tone: 'bg-success-500/15 text-success-400', hint: 'Completed withdrawals' },
    { label: 'User Wallet Balances', value: formatMoney(stats!.totalUserBalances), icon: Wallet, tone: 'bg-brand-600/15 text-brand-400', hint: 'Funds held in user wallets' },
    { label: 'Total Rewards Issued', value: formatMoney(stats!.totalRewards + stats!.referralRewards), icon: TrendingUp, tone: 'bg-accent-400/10 text-accent-400', hint: 'Task + referral rewards' },
  ];

  return (
    <AdminPageWrapper title="Admin Dashboard" subtitle="Platform overview and quick actions.">
      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      {/* Quick action alerts */}
      <div className="grid gap-4 sm:grid-cols-2">
        {stats!.pendingSubmissions > 0 && (
          <Card accent className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning-400" />
              <div>
                <p className="font-semibold text-white">{stats!.pendingSubmissions} pending submissions</p>
                <p className="text-xs text-ink-400">Awaiting review</p>
              </div>
            </div>
            <Button to="/admin/submissions" size="sm" variant="secondary">Review <ArrowRight className="h-4 w-4" /></Button>
          </Card>
        )}
        {stats!.pendingWithdrawals > 0 && (
          <Card accent className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <ArrowDownToLine className="h-5 w-5 text-warning-400" />
              <div>
                <p className="font-semibold text-white">{stats!.pendingWithdrawals} pending withdrawals</p>
                <p className="text-xs text-ink-400">{formatMoney(stats!.pendingWithdrawalAmount)} awaiting review</p>
              </div>
            </div>
            <Button to="/admin/withdrawals" size="sm" variant="secondary">Review <ArrowRight className="h-4 w-4" /></Button>
          </Card>
        )}
      </div>

      {/* Financial overview */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Financial Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {financialCards.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-ink-400">{s.label}</p>
                  <p className="mt-1 text-xl font-bold text-white">{s.value}</p>
                  <p className="mt-1 text-xs text-ink-400">{s.hint}</p>
                </div>
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.tone}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Platform Stats</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-ink-400">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold text-white">{s.value}</p>
                </div>
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.tone}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">Recent Submissions</h2>
            <Link to="/admin/submissions" className="text-xs font-medium text-brand-400">View all</Link>
          </div>
          {recentSubs.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No submissions yet</p>
          ) : (
            <div className="mt-4 space-y-2">
              {recentSubs.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-50">{s.task?.title || 'Task'}</p>
                    <p className="text-xs text-ink-400">{s.user?.name || 'User'}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">Recent Withdrawals</h2>
            <Link to="/admin/withdrawals" className="text-xs font-medium text-brand-400">View all</Link>
          </div>
          {recentWds.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">No withdrawals yet</p>
          ) : (
            <div className="mt-4 space-y-2">
              {recentWds.map((w: any) => (
                <div key={w.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-50">{formatMoney(w.amount)}</p>
                    <p className="text-xs text-ink-400">{w.user?.name || 'User'}</p>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminPageWrapper>
  );
}
