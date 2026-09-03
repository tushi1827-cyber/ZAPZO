import { useEffect, useState } from 'react';
import { Share2, Users, CheckCircle2, Coins, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface AdminReferral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: string;
  qualified_at: string | null;
  reward_amount: number;
  created_at: string;
  referrer?: { name: string; referral_code: string };
  referred?: { name: string; referral_code: string };
}

export function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<AdminReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      let query = supabase
        .from('referrals')
        .select('*, referrer:profiles!referrer_id(name, referral_code), referred:profiles!referred_id(name, referral_code)')
        .order('created_at', { ascending: false });
      if (filter !== 'all') {
        query = query.eq('status', filter);
      }
      const { data, error } = await query.limit(100);
      if (error) setError('Failed to load referrals.');
      setReferrals((data as AdminReferral[]) || []);
      setLoading(false);
    })();
  }, [filter]);

  const filters = ['all', 'pending', 'qualified', 'reversed'];
  const totalReferrals = referrals.length;
  const qualified = referrals.filter((r) => r.status === 'qualified').length;
  const totalRewards = referrals.filter((r) => r.status === 'qualified').reduce((s, r) => s + Number(r.reward_amount), 0);
  const suspicious = referrals.filter((r) => r.status === 'reversed').length;

  const statCards = [
    { label: 'Total Referrals', value: totalReferrals, icon: Users, tone: 'bg-brand-600/15 text-brand-400' },
    { label: 'Qualified', value: qualified, icon: CheckCircle2, tone: 'bg-success-500/15 text-success-400' },
    { label: 'Rewards Paid', value: formatMoney(totalRewards), icon: Coins, tone: 'bg-accent-400/10 text-accent-400' },
    { label: 'Reversed', value: suspicious, icon: AlertTriangle, tone: 'bg-danger-500/15 text-danger-400' },
  ];

  return (
    <AdminPageWrapper title="Referral Management" subtitle="View referral relationships and rewards.">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="p-5">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-xs text-ink-400">{s.label}</p>
            <p className="text-xl font-bold text-white">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              filter === f
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800 text-ink-400 hover:bg-ink-300/30 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : referrals.length === 0 ? (
          <EmptyState icon={<Share2 className="h-10 w-10" />} title="No referrals" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">Referrer</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Referred</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Reward</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{r.referrer?.name || 'Unknown'}</p>
                      <p className="text-xs font-mono text-ink-400">{r.referrer?.referral_code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{r.referred?.name || 'Unknown'}</p>
                      <p className="text-xs font-mono text-ink-400">{r.referred?.referral_code}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-accent-400">
                      {r.status === 'qualified' ? formatMoney(r.reward_amount) : '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-ink-400">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminPageWrapper>
  );
}
