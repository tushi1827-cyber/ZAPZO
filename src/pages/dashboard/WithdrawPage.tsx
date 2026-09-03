import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine, Wallet, CheckCircle2, AlertCircle, Clock,
  Building2, Smartphone, Info,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Withdrawal, Settings } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function WithdrawPage() {
  const { user, profile } = useAuth();
  const [balance, setBalance] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank_transfer'>('upi');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    const { data: bal, error: balErr } = await supabase.rpc('get_user_balance');
    setBalance(Number(bal) || 0);
    const { data: s, error: sErr } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    setSettings(s as Settings | null);
    const { data: wds, error: wErr } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (balErr || sErr || wErr) {
      setError('Failed to load withdrawal data. Please refresh the page.');
    }
    setWithdrawals((wds as Withdrawal[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const minWithdrawal = Number(settings?.min_withdrawal ?? 5);
  const hasPending = withdrawals.some((w) => w.status === 'pending' || w.status === 'processing');
  const isSuspended = profile?.is_suspended;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (amt < minWithdrawal) {
      setError(`Minimum withdrawal is ${formatMoney(minWithdrawal)}.`);
      return;
    }
    if (amt > balance) {
      setError(`Insufficient balance. Available: ${formatMoney(balance)}.`);
      return;
    }
    if (payoutDetails.trim().length < 5) {
      setError('Please provide valid payout details.');
      return;
    }
    if (isSuspended) {
      setError('Your account is suspended. Contact support.');
      return;
    }
    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc('request_withdrawal', {
      p_amount: amt,
      p_method: method,
      p_payout_details: payoutDetails.trim(),
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(`Withdrawal request for ${formatMoney(amt)} submitted! Our team will review it shortly.`);
    setAmount('');
    setPayoutDetails('');
    await loadData();
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Withdraw</h1>
        <p className="mt-1 text-sm text-ink-400">Request a payout. All withdrawals are manually reviewed.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Withdrawal form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">New Withdrawal</h2>
              <div className="text-right">
                <p className="text-xs text-ink-400">Available</p>
                <p className="text-lg font-bold text-accent-400">{formatMoney(balance)}</p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>
            )}

            {hasPending && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-warning-500/10 p-3 text-sm text-warning-400">
                <Clock className="h-4 w-4 shrink-0" />
                You have a pending or processing withdrawal. Please wait for it to complete before requesting another.
              </div>
            )}

            {success && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <Input
                label="Amount (INR)"
                type="number"
                step="0.01"
                name="amount"
                placeholder={`Min: ${formatMoney(minWithdrawal)}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={hasPending || balance < minWithdrawal}
                hint={`Minimum withdrawal: ${formatMoney(minWithdrawal)}`}
              />
              <Select
                label="Payout Method"
                name="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as 'upi' | 'bank_transfer')}
                disabled={hasPending}
              >
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
              </Select>
              <Textarea
                label="Payout Details"
                name="payout_details"
                placeholder={method === 'upi' ? 'Enter your UPI ID (e.g. name@bank)' : 'Enter bank account details (account no, IFSC, name)'}
                value={payoutDetails}
                onChange={(e) => setPayoutDetails(e.target.value)}
                disabled={hasPending}
                rows={3}
              />
              {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
              <Button type="submit" disabled={submitting || hasPending || balance < minWithdrawal || isSuspended} fullWidth>
                {submitting ? <Spinner size="sm" /> : <><ArrowDownToLine className="h-4 w-4" /> Request Withdrawal</>}
              </Button>
              {balance < minWithdrawal && (
                <p className="text-center text-xs text-ink-400">
                  Balance below minimum. <Link to="/dashboard/tasks" className="text-brand-400">Complete tasks</Link> to earn more.
                </p>
              )}
            </form>
          </Card>

          {/* Withdrawal history */}
          <Card className="p-5">
            <h2 className="font-bold text-white">Withdrawal History</h2>
            {withdrawals.length === 0 ? (
              <EmptyState icon={<Wallet className="h-10 w-10" />} title="No withdrawals yet" description="Your withdrawal requests will appear here." />
            ) : (
              <div className="mt-4 space-y-2">
                {withdrawals.map((wd) => (
                  <div key={wd.id} className="flex items-center justify-between rounded-xl border border-ink-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-800">
                        {wd.method === 'upi' ? <Smartphone className="h-5 w-5 text-ink-400" /> : <Building2 className="h-5 w-5 text-ink-400" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{formatMoney(wd.amount)}</p>
                        <p className="text-xs capitalize text-ink-400">
                          {wd.method.replace('_', ' ')} • {new Date(wd.created_at).toLocaleDateString()}
                        </p>
                        {wd.rejection_reason && <p className="mt-0.5 text-xs text-danger-400">Rejected: {wd.rejection_reason}</p>}
                      </div>
                    </div>
                    <StatusBadge status={wd.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Info sidebar */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-brand-400" />
              <h3 className="font-bold text-white">How withdrawals work</h3>
            </div>
            <ol className="mt-3 space-y-2 text-xs text-ink-400">
              <li className="flex gap-2"><span className="font-bold text-brand-400">1.</span> Request a withdrawal above the minimum amount.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">2.</span> Funds are reserved in your wallet immediately.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">3.</span> Admin reviews the request.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">4.</span> If approved, status updates to paid.</li>
              <li className="flex gap-2"><span className="font-bold text-brand-400">5.</span> If rejected, reserved funds are released back.</li>
            </ol>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-warning-400 mt-0.5" />
            <p className="text-xs text-ink-400">
              V1 uses manual admin review. No real payout API is connected. Do not pay anyone to access earning tasks.
            </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
