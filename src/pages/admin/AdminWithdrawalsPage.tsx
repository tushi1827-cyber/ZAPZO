import { useEffect, useState } from 'react';
import {
  ArrowDownToLine, CheckCircle2, XCircle, Clock, Banknote, Eye,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Withdrawal } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface WdWithUser extends Withdrawal {
  user?: { name: string; referral_code: string };
}

export function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WdWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState<WdWithUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from('withdrawals')
      .select('*, user:profiles!user_id(name, referral_code)')
      .order('created_at', { ascending: false });
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }
    const { data, error } = await query.limit(100);
    if (error) setError('Failed to load withdrawals.');
    setWithdrawals((data as WdWithUser[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filter]);

  const handleReview = async (status: 'processing' | 'approved' | 'rejected' | 'paid') => {
    if (!selected) return;
    if (status === 'rejected' && rejectReason.trim().length < 3) {
      setError('Please provide a rejection reason.');
      return;
    }
    setActionLoading(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('review_withdrawal', {
      p_withdrawal_id: selected.id,
      p_status: status,
      p_reason: status === 'rejected' ? rejectReason.trim() : null,
    });
    setActionLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(`Withdrawal ${status === 'paid' ? 'marked as paid' : status === 'rejected' ? 'rejected and funds released' : 'updated to ' + status}.`);
    setSelected(null);
    setRejectReason('');
    await load();
  };

  const filters = ['pending', 'processing', 'approved', 'rejected', 'paid', 'all'];

  return (
    <AdminPageWrapper title="Withdrawal Management" subtitle="Review and process withdrawal requests.">
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

      {error && !selected && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
      {success && !selected && <div className="rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">{success}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : withdrawals.length === 0 ? (
          <EmptyState icon={<ArrowDownToLine className="h-10 w-10" />} title="No withdrawals" description={`No ${filter} withdrawals.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">User</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Amount</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Method</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden md:table-cell">Date</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{w.user?.name || 'User'}</p>
                      <p className="text-xs font-mono text-ink-400">{w.user?.referral_code}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-white">{formatMoney(w.amount)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell capitalize text-ink-400">{w.method.replace('_', ' ')}</td>
                    <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                    <td className="px-4 py-3 hidden md:table-cell text-ink-400">{new Date(w.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setSelected(w); setRejectReason(''); setError(''); }} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white" title="Review">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Review Withdrawal" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">User</p>
                <p className="font-semibold text-white">{selected.user?.name || 'User'}</p>
                <p className="text-xs font-mono text-ink-400">{selected.user?.referral_code}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Amount</p>
                <p className="text-2xl font-bold text-brand-400">{formatMoney(selected.amount)}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Method</p>
                <p className="font-semibold capitalize text-white">{selected.method.replace('_', ' ')}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Status</p>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-ink-50">Payout Details</p>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-sm text-ink-50 break-all">{selected.payout_details}</p>
              </div>
            </div>

            {selected.status === 'rejected' && selected.rejection_reason && (
              <div className="rounded-xl bg-danger-500/10 p-3">
                <p className="text-sm text-danger-400"><strong>Rejection reason:</strong> {selected.rejection_reason}</p>
              </div>
            )}

            {selected.status === 'paid' && (
              <div className="rounded-xl bg-accent-400/10 p-3">
                <p className="text-sm text-accent-400">This withdrawal has been paid.</p>
              </div>
            )}

            {!['rejected', 'paid'].includes(selected.status) && (
              <>
                <Textarea
                  label="Rejection reason (only needed for rejection)"
                  name="reject_reason"
                  placeholder="Explain why this withdrawal is being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                />
                {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
                <div className="flex flex-wrap justify-end gap-2">
                  {selected.status === 'pending' && (
                    <Button variant="secondary" size="sm" onClick={() => handleReview('processing')} disabled={actionLoading}>
                      <Clock className="h-4 w-4" /> Mark Processing
                    </Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => handleReview('rejected')} disabled={actionLoading}>
                    {actionLoading ? <Spinner size="sm" /> : <><XCircle className="h-4 w-4" /> Reject</>}
                  </Button>
                  <Button size="sm" onClick={() => handleReview('paid')} disabled={actionLoading}>
                    {actionLoading ? <Spinner size="sm" /> : <><Banknote className="h-4 w-4" /> Mark Paid</>}
                  </Button>
                </div>
                <p className="text-xs text-ink-400">
                  Rejecting releases reserved funds back to the user's wallet. Marking paid finalizes the withdrawal.
                </p>
              </>
            )}
          </div>
        )}
      </Modal>
    </AdminPageWrapper>
  );
}
