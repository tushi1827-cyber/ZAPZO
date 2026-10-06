import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, ClipboardList, CheckCircle2, Coins, Share2, ArrowDownToLine,
  AlertTriangle, ArrowRight, Banknote, TrendingUp, Wallet, Headset,
  MessageSquare, ShieldAlert, ScrollText, KeyRound, RefreshCw, Clock,
  Plus, FileCheck, Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { AdminPermission } from '@/types';
import { formatCoins, formatCoinsShort } from '@/lib/format';

type DateRange = 'today' | '7d' | '30d' | 'this_month' | 'all_time';

const dateRangeLabels: Record<DateRange, string> = {
  today: 'Today',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  this_month: 'This Month',
  all_time: 'All Time',
};

interface DashboardData {
  summary: {
    total_users?: number;
    active_users?: number;
    new_users_in_range?: number;
    total_tasks?: number;
    active_tasks?: number;
    pending_submissions?: number;
    approved_in_range?: number;
    rejected_in_range?: number;
    pending_withdrawals?: number;
    pending_withdrawal_amount?: number;
    total_paid_out?: number;
    withdrawals_in_range?: number;
    total_rewards?: number;
    referral_rewards?: number;
    rewards_in_range?: number;
    total_referrals?: number;
    qualified_referrals?: number;
    referral_reward_total?: number;
    open_tickets?: number;
    new_tickets_in_range?: number;
    open_feedback?: number;
    feedback_in_range?: number;
    high_risk_events?: number;
    risk_events_in_range?: number;
  };
  timeseries: {
    user_growth?: { date: string; count: number }[];
    submission_activity?: { date: string; approved: number; rejected: number; pending: number }[];
    rewards_over_time?: { date: string; amount: number }[];
    withdrawals_over_time?: { date: string; pending: number; paid: number; rejected: number }[];
    referrals_over_time?: { date: string; registrations: number; qualified: number }[];
  };
  recent: {
    submissions?: { id: string; status: string; created_at: string; task_title: string; user_name: string }[];
    withdrawals?: { id: string; amount: number; status: string; method: string; created_at: string; user_name: string }[];
    transactions?: { id: string; type: string; amount: number; status: string; created_at: string; user_name: string }[];
    audit_logs?: { id: string; action: string; target_type: string; created_at: string; actor_name: string }[];
    feedback?: { id: string; type: string; subject: string; status: string; created_at: string; user_name: string }[];
    support?: { id: string; ticket_number: string; subject: string; status: string; priority: string; created_at: string; user_name: string }[];
  };
  permissions: string[];
  is_super_admin: boolean;
}

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

// Lightweight inline SVG sparkline / bar chart — no external dependency
function MiniBarChart({ data, colorClass, height = 60 }: { data: { date: string; value: number }[]; colorClass: string; height?: number }) {
  if (!data || data.length === 0) return <div className="flex h-[60px] items-center justify-center text-xs text-ink-400">No data for this period</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const barWidth = 100 / data.length;
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${colorClass} transition-all`}
          style={{
            height: `${Math.max((d.value / max) * 100, 2)}%`,
            minWidth: `${barWidth}%`,
          }}
          title={`${d.date}: ${d.value}`}
        />
      ))}
    </div>
  );
}

function StackedBarChart({ data, height = 80 }: { data: { date: string; approved: number; rejected: number; pending: number }[]; height?: number }) {
  if (!data || data.length === 0) return <div className="flex h-[80px] items-center justify-center text-xs text-ink-400">No data for this period</div>;
  const max = Math.max(...data.map(d => d.approved + d.rejected + d.pending), 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((d, i) => {
        const total = d.approved + d.rejected + d.pending;
        const totalPct = (total / max) * 100;
        const approvedPct = total > 0 ? (d.approved / total) * totalPct : 0;
        const rejectedPct = total > 0 ? (d.rejected / total) * totalPct : 0;
        const pendingPct = total > 0 ? (d.pending / total) * totalPct : 0;
        return (
          <div key={i} className="flex flex-1 flex-col-reverse rounded-sm overflow-hidden" style={{ minWidth: `${100 / data.length}%` }} title={`${d.date}: ${d.approved}A ${d.rejected}R ${d.pending}P`}>
            {approvedPct > 0 && <div style={{ height: `${approvedPct}%` }} className="bg-accent-400/60" />}
            {pendingPct > 0 && <div style={{ height: `${pendingPct}%` }} className="bg-warning-500/50" />}
            {rejectedPct > 0 && <div style={{ height: `${rejectedPct}%` }} className="bg-danger-500/50" />}
            {totalPct < 2 && <div style={{ height: '2%' }} className="bg-ink-700" />}
          </div>
        );
      })}
    </div>
  );
}

function ChartCard({ title, children, legend }: { title: string; children: React.ReactNode; legend?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      {children}
      {legend && <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-400">{legend}</div>}
    </Card>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: typeof Users;
  tone: string;
  sub?: string;
}

function MetricCard({ label, value, icon: Icon, tone, sub }: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-white truncate">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function AdminDashboardPage() {
  const { isSuperAdmin, hasPermission } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('all_time');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: result, error: rpcErr } = await supabase.rpc('get_admin_dashboard', {
      p_date_range: dateRange,
    });
    if (rpcErr) {
      setError('Failed to load dashboard data. Please try refreshing.');
      setData(null);
    } else {
      setData(result as DashboardData);
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const perms = data?.permissions || [];
  const canSee = (p: AdminPermission) => isSuperAdmin || perms.includes(p);

  // Pending action items
  const pendingItems: { label: string; count: number; link: string; icon: typeof AlertTriangle; tone: string; show: boolean }[] = [
    { label: 'Pending Submissions', count: data?.summary.pending_submissions || 0, link: '/admin/submissions', icon: FileCheck, tone: 'text-warning-400', show: canSee('submissions') && (data?.summary.pending_submissions || 0) > 0 },
    { label: 'Pending Withdrawals', count: data?.summary.pending_withdrawals || 0, link: '/admin/withdrawals', icon: ArrowDownToLine, tone: 'text-warning-400', show: canSee('withdrawals') && (data?.summary.pending_withdrawals || 0) > 0 },
    { label: 'Open Support Tickets', count: data?.summary.open_tickets || 0, link: '/admin/support', icon: Headset, tone: 'text-brand-400', show: canSee('support') && (data?.summary.open_tickets || 0) > 0 },
    { label: 'New Feedback/Reports', count: data?.summary.open_feedback || 0, link: '/admin/feedback', icon: MessageSquare, tone: 'text-brand-400', show: canSee('feedback') && (data?.summary.open_feedback || 0) > 0 },
    { label: 'High-Risk Alerts', count: data?.summary.high_risk_events || 0, link: '/admin/fraud', icon: ShieldAlert, tone: 'text-danger-400', show: canSee('fraud') && (data?.summary.high_risk_events || 0) > 0 },
  ];

  // Quick actions
  const quickActions: { label: string; link: string; icon: typeof Plus; show: boolean }[] = [
    { label: 'Create Task', link: '/admin/tasks', icon: Plus, show: canSee('tasks') },
    { label: 'Review Submissions', link: '/admin/submissions', icon: FileCheck, show: canSee('submissions') },
    { label: 'Review Withdrawals', link: '/admin/withdrawals', icon: ArrowDownToLine, show: canSee('withdrawals') },
    { label: 'View Transactions', link: '/admin/transactions', icon: Activity, show: canSee('transactions') },
    { label: 'View Feedback', link: '/admin/feedback', icon: MessageSquare, show: canSee('feedback') },
    { label: 'View Support', link: '/admin/support', icon: Headset, show: canSee('support') },
    { label: 'View Audit Logs', link: '/admin/audit-logs', icon: ScrollText, show: isSuperAdmin },
    { label: 'Manage Roles', link: '/admin/roles', icon: KeyRound, show: isSuperAdmin },
  ];

  return (
    <AdminPageWrapper
      title="Admin Dashboard"
      subtitle="Platform overview, analytics, and quick actions."
      actions={
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="hidden text-xs text-ink-400 sm:inline">
              <Clock className="mr-1 inline h-3 w-3" />
              {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button onClick={load} variant="secondary" size="sm" disabled={loading}>
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      }
    >
      {/* Date range filter */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(dateRangeLabels) as DateRange[]).map(r => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              dateRange === r
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800 text-ink-400 hover:bg-ink-300/30 hover:text-white'
            }`}
          >
            {dateRangeLabels[r]}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">
          <span>{error}</span>
          <Button onClick={load} variant="secondary" size="sm">Retry</Button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Spinner size="lg" />
          <p className="mt-3 text-sm text-ink-400">Loading dashboard data...</p>
        </div>
      ) : data ? (
        <>
          {/* Needs Attention */}
          {pendingItems.filter(p => p.show).length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-400">
                <AlertTriangle className="h-4 w-4 text-warning-400" />
                Needs Attention
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {pendingItems.filter(p => p.show).map(item => (
                  <Link key={item.label} to={item.link}>
                    <Card className="flex cursor-pointer items-center gap-3 p-4 transition hover:border-brand-500/50">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-800">
                        <item.icon className={`h-5 w-5 ${item.tone}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xl font-bold text-white">{item.count}</p>
                        <p className="truncate text-xs text-ink-400">{item.label}</p>
                      </div>
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink-400" />
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Summary metrics */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Platform Overview</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {canSee('users') && (
                <MetricCard label="Total Users" value={data.summary.total_users || 0} icon={Users} tone="bg-brand-600/15 text-brand-400" sub={`${data.summary.active_users || 0} active`} />
              )}
              {canSee('users') && (
                <MetricCard label="New Users" value={data.summary.new_users_in_range || 0} icon={TrendingUp} tone="bg-accent-400/10 text-accent-400" sub={dateRangeLabels[dateRange]} />
              )}
              {canSee('tasks') && (
                <MetricCard label="Total Tasks" value={data.summary.total_tasks || 0} icon={ClipboardList} tone="bg-brand-600/15 text-brand-400" sub={`${data.summary.active_tasks || 0} active`} />
              )}
              {canSee('submissions') && (
                <MetricCard label="Pending Submissions" value={data.summary.pending_submissions || 0} icon={FileCheck} tone="bg-warning-500/15 text-warning-400" sub="Awaiting review" />
              )}
              {canSee('withdrawals') && (
                <MetricCard label="Pending Withdrawals" value={data.summary.pending_withdrawals || 0} icon={ArrowDownToLine} tone="bg-warning-500/15 text-warning-400" sub={formatCoinsShort(data.summary.pending_withdrawal_amount || 0)} />
              )}
              {canSee('transactions') && (
                <MetricCard label="Total Rewards" value={formatCoinsShort(data.summary.total_rewards || 0)} icon={Coins} tone="bg-accent-400/10 text-accent-400" sub="Distributed" />
              )}
              {canSee('transactions') && (
                <MetricCard label="Referral Rewards" value={formatCoinsShort(data.summary.referral_rewards || 0)} icon={Share2} tone="bg-accent-400/10 text-accent-400" sub="Distributed" />
              )}
              {canSee('withdrawals') && (
                <MetricCard label="Total Paid Out" value={formatCoinsShort(data.summary.total_paid_out || 0)} icon={Banknote} tone="bg-success-500/15 text-success-400" sub="Completed withdrawals" />
              )}
              {canSee('support') && (
                <MetricCard label="Open Tickets" value={data.summary.open_tickets || 0} icon={Headset} tone="bg-brand-600/15 text-brand-400" sub="Needs response" />
              )}
              {canSee('feedback') && (
                <MetricCard label="Open Feedback" value={data.summary.open_feedback || 0} icon={MessageSquare} tone="bg-brand-600/15 text-brand-400" sub="New reports" />
              )}
              {canSee('fraud') && (
                <MetricCard label="High-Risk Events" value={data.summary.high_risk_events || 0} icon={ShieldAlert} tone="bg-danger-500/10 text-danger-400" sub="Risk score >= 10" />
              )}
              {isSuperAdmin && (
                <MetricCard label="Qualified Referrals" value={data.summary.qualified_referrals || 0} icon={Share2} tone="bg-brand-600/15 text-brand-400" sub={`of ${data.summary.total_referrals || 0} total`} />
              )}
            </div>
          </div>

          {/* Charts */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Analytics · {dateRangeLabels[dateRange]}</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {canSee('users') && (
                <ChartCard title="User Growth">
                  <MiniBarChart data={(data.timeseries.user_growth || []).map(d => ({ date: d.date, value: d.count }))} colorClass="bg-brand-500/60" />
                </ChartCard>
              )}
              {canSee('submissions') && (
                <ChartCard
                  title="Submission Activity"
                  legend={
                    <>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-400/60" />Approved</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning-500/50" />Pending</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger-500/50" />Rejected</span>
                    </>
                  }
                >
                  <StackedBarChart data={data.timeseries.submission_activity || []} />
                </ChartCard>
              )}
              {canSee('transactions') && (
                <ChartCard title="Rewards Distributed">
                  <MiniBarChart data={(data.timeseries.rewards_over_time || []).map(d => ({ date: d.date, value: Number(d.amount) }))} colorClass="bg-accent-400/60" />
                </ChartCard>
              )}
              {canSee('withdrawals') && (
                <ChartCard title="Withdrawal Requests">
                  <MiniBarChart data={(data.timeseries.withdrawals_over_time || []).map(d => ({ date: d.date, value: d.pending + d.paid + d.rejected }))} colorClass="bg-warning-500/50" />
                </ChartCard>
              )}
              {isSuperAdmin && (
                <ChartCard title="Referral Activity">
                  <MiniBarChart data={(data.timeseries.referrals_over_time || []).map(d => ({ date: d.date, value: d.registrations }))} colorClass="bg-brand-500/60" />
                </ChartCard>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Quick Actions</h2>
            <div className="flex flex-wrap gap-2">
              {quickActions.filter(a => a.show).map(action => (
                <Link
                  key={action.label}
                  to={action.link}
                  className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-800/50 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-500/50 hover:bg-ink-800"
                >
                  <action.icon className="h-4 w-4 text-brand-400" />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">Recent Activity</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Recent Submissions */}
              {canSee('submissions') && data.recent.submissions && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">Recent Submissions</h3>
                    <Link to="/admin/submissions" className="text-xs font-medium text-brand-400">View all</Link>
                  </div>
                  {data.recent.submissions.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-400">No submissions yet</p>
                  ) : (
                    <div className="mt-3 space-y-1">
                      {data.recent.submissions.map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-50">{s.task_title || 'Task'}</p>
                            <p className="text-xs text-ink-400">{s.user_name} · {timeAgo(s.created_at)}</p>
                          </div>
                          <StatusBadge status={s.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Recent Withdrawals */}
              {canSee('withdrawals') && data.recent.withdrawals && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">Recent Withdrawals</h3>
                    <Link to="/admin/withdrawals" className="text-xs font-medium text-brand-400">View all</Link>
                  </div>
                  {data.recent.withdrawals.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-400">No withdrawals yet</p>
                  ) : (
                    <div className="mt-3 space-y-1">
                      {data.recent.withdrawals.map(w => (
                        <div key={w.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink-50">{formatCoins(Number(w.amount))}</p>
                            <p className="text-xs text-ink-400">{w.user_name} · {w.method} · {timeAgo(w.created_at)}</p>
                          </div>
                          <StatusBadge status={w.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Recent Transactions */}
              {canSee('transactions') && data.recent.transactions && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">Recent Transactions</h3>
                    <Link to="/admin/transactions" className="text-xs font-medium text-brand-400">View all</Link>
                  </div>
                  {data.recent.transactions.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-400">No transactions yet</p>
                  ) : (
                    <div className="mt-3 space-y-1">
                      {data.recent.transactions.map(t => (
                        <div key={t.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink-50">{formatCoins(Number(t.amount))}</p>
                            <p className="text-xs text-ink-400 capitalize">{t.type.replace(/_/g, ' ')} · {t.user_name}</p>
                          </div>
                          <StatusBadge status={t.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Recent Audit Logs */}
              {isSuperAdmin && data.recent.audit_logs && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">Recent Audit Events</h3>
                    <Link to="/admin/audit-logs" className="text-xs font-medium text-brand-400">View all</Link>
                  </div>
                  {data.recent.audit_logs.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-400">No audit events yet</p>
                  ) : (
                    <div className="mt-3 space-y-1">
                      {data.recent.audit_logs.map(a => (
                        <div key={a.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-50">{a.action.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-ink-400">{a.actor_name || 'System'} · {timeAgo(a.created_at)}</p>
                          </div>
                          {a.target_type && <span className="text-xs text-ink-400">{a.target_type}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Recent Feedback */}
              {canSee('feedback') && data.recent.feedback && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">Recent Feedback</h3>
                    <Link to="/admin/feedback" className="text-xs font-medium text-brand-400">View all</Link>
                  </div>
                  {data.recent.feedback.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-400">No feedback yet</p>
                  ) : (
                    <div className="mt-3 space-y-1">
                      {data.recent.feedback.map(f => (
                        <div key={f.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-50">{f.subject || 'No subject'}</p>
                            <p className="text-xs text-ink-400 capitalize">{f.type} · {f.user_name}</p>
                          </div>
                          <StatusBadge status={f.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Recent Support */}
              {canSee('support') && data.recent.support && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white">Recent Support Tickets</h3>
                    <Link to="/admin/support" className="text-xs font-medium text-brand-400">View all</Link>
                  </div>
                  {data.recent.support.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-400">No tickets yet</p>
                  ) : (
                    <div className="mt-3 space-y-1">
                      {data.recent.support.map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-800/50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-50">{s.subject}</p>
                            <p className="text-xs text-ink-400">{s.ticket_number} · {s.user_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              s.priority === 'high' ? 'bg-danger-500/15 text-danger-400' :
                              s.priority === 'medium' ? 'bg-warning-500/15 text-warning-400' :
                              'bg-ink-700 text-ink-400'
                            }`}>{s.priority}</span>
                            <StatusBadge status={s.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        </>
      ) : !loading ? (
        <Card className="p-8">
          <EmptyState
            icon={<AlertTriangle className="h-10 w-10" />}
            title="No dashboard data available"
            description="Could not load analytics data. Try refreshing."
          />
        </Card>
      ) : null}
    </AdminPageWrapper>
  );
}
