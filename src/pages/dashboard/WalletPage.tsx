import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
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

const typeTone: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  task_reward: 'success',
  referral_reward: 'success',
  bonus: 'success',
  adjustment: 'info',
  withdrawal: 'warning',
  withdrawal_reversal: 'info',
};

export function WalletPage() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError('');
      const { data: bal, error: balErr } = await supabase.rpc('get_user_balance');
      setBalance(Number(bal) || 0);
      const { data, error: txErr } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (balErr || txErr) {
        setError('Failed to load wallet data. Please try again.');
      }
      setTxns((data as WalletTransaction[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const filtered = filter === 'all' ? txns : txns.filter((t) => t.type === filter);
  const totalIn = txns.filter((t) => Number(t.amount) > 0 && t.status === 'completed').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = txns.filter((t) => Number(t.amount) < 0 && t.status === 'completed').reduce((s, t) => s + Number(t.amount), 0);

  if (loading) return <Spinner size="lg" className="py-20" />;

  const types = ['all', ...Array.from(new Set(txns.map((t) => t.type)))];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet</h1>
          <p className="mt-1 text-sm text-ink-400">Your complete transaction ledger.</p>
        </div>
        <Button to="/dashboard/withdraw" size="sm">
          <ArrowDownToLine className="h-4 w-4" /> Withdraw
        </Button>
      </div>

      {/* Balance + summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card accent className="bg-gradient-to-br from-brand-600/20 via-ink-900 to-ink-900 p-6 shadow-glow-purple">
          <Wallet className="h-6 w-6 text-brand-400" />
          <p className="mt-3 text-sm text-ink-400">Available Balance</p>
          <p className="mt-1 text-3xl font-bold text-white">{formatMoney(balance)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-400/10 text-accent-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-400">Total Credited</p>
              <p className="text-xl font-bold text-accent-400">{formatMoney(totalIn)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-warning-500/15 text-warning-400">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-400">Total Debited</p>
              <p className="text-xl font-bold text-ink-50">{formatMoney(Math.abs(totalOut))}</p>
            </div>
          </div>
        </Card>
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              filter === t
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800 text-ink-400 hover:bg-ink-300/30 hover:text-white'
            }`}
          >
            {t === 'all' ? 'All' : typeLabels[t] || t}
          </button>
        ))}
      </div>

      {/* Transactions */}
      <Card className="p-5">
        {filtered.length === 0 ? (
          <EmptyState icon={<Wallet className="h-10 w-10" />} title="No transactions yet" description="Complete a task to start earning." />
        ) : (
          <div className="space-y-1">
            {filtered.map((tx) => {
              const positive = Number(tx.amount) >= 0;
              return (
                <div key={tx.id} className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-ink-800/50">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${positive ? 'bg-accent-400/10 text-accent-400' : 'bg-warning-500/15 text-warning-400'}`}>
                      {positive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{tx.description}</p>
                      <div className="flex items-center gap-2">
                        <Badge tone={typeTone[tx.type] || 'neutral'}>{typeLabels[tx.type] || tx.type}</Badge>
                        <span className="text-xs text-ink-400">{new Date(tx.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${positive ? 'text-accent-400' : 'text-ink-50'}`}>
                      {positive ? '+' : ''}{formatMoney(tx.amount)}
                    </p>
                    <span className="text-xs capitalize text-ink-400">{tx.status}</span>
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
