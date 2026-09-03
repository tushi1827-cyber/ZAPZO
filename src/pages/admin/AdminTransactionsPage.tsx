import { useEffect, useState } from 'react';
import { Wallet, Search, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { WalletTransaction } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const typeLabels: Record<string, string> = {
  task_reward: 'Task Reward',
  referral_reward: 'Referral Reward',
  bonus: 'Bonus',
  adjustment: 'Adjustment',
  withdrawal: 'Withdrawal',
  withdrawal_reversal: 'Withdrawal Reversal',
};

interface TxWithUser extends WalletTransaction {
  user?: { name: string; referral_code: string };
}

export function AdminTransactionsPage() {
  const [txns, setTxns] = useState<TxWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      let query = supabase
        .from('wallet_transactions')
        .select('*, user:profiles!user_id(name, referral_code)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter);
      }
      const { data, error } = await query;
      if (error) setError('Failed to load transactions.');
      setTxns((data as TxWithUser[]) || []);
      setLoading(false);
    })();
  }, [typeFilter]);

  const filtered = txns.filter((t) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      t.description?.toLowerCase().includes(s) ||
      t.user?.name?.toLowerCase().includes(s) ||
      t.user?.referral_code?.toLowerCase().includes(s)
    );
  });

  const types = ['all', 'task_reward', 'referral_reward', 'bonus', 'adjustment', 'withdrawal', 'withdrawal_reversal'];

  return (
    <AdminPageWrapper title="Transaction Management" subtitle="View and search the complete wallet ledger.">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-10" placeholder="Search by user, code, or description..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[200px] cursor-pointer" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {types.map((t) => (
            <option key={t} value={t} className="capitalize">{t === 'all' ? 'All Types' : typeLabels[t] || t}</option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Wallet className="h-10 w-10" />} title="No transactions found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">User</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Description</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Type</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Amount</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const positive = Number(tx.amount) >= 0;
                  return (
                    <tr key={tx.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{tx.user?.name || 'Unknown'}</p>
                        <p className="text-xs font-mono text-ink-400">{tx.user?.referral_code}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-50">{tx.description}</td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{typeLabels[tx.type] || tx.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 font-bold ${positive ? 'text-accent-400' : 'text-ink-400'}`}>
                          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {positive ? '+' : ''}{formatMoney(tx.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize text-ink-400">{tx.status}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-ink-400">{new Date(tx.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminPageWrapper>
  );
}
