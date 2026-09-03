import { useEffect, useState } from 'react';
import { Search, Users, Ban, CheckCircle2, Eye, Wallet as WalletIcon, Plus, Minus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Profile, WalletTransaction, Referral } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<{ balance: number; txns: WalletTransaction[] } | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjType, setAdjType] = useState<'credit' | 'debit'>('credit');
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjError, setAdjError] = useState('');
  const [adjSuccess, setAdjSuccess] = useState('');
  const [listError, setListError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setListError('');
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) setListError('Failed to load users.');
    setUsers((data as Profile[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const resetAdjustment = () => {
    setAdjAmount('');
    setAdjDescription('');
    setAdjType('credit');
    setAdjError('');
    setAdjSuccess('');
  };

  const openDetail = async (user: Profile) => {
    setSelected(user);
    setDetailLoading(true);
    setWallet(null);
    setReferrals([]);
    resetAdjustment();
    const [balRes, txRes, refRes] = await Promise.all([
      supabase.rpc('get_user_balance'),
      supabase.from('wallet_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('referrals').select('*, referred:profiles!referred_id(name, referral_code)').or(`referrer_id.eq.${user.id},referred_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(10),
    ]);
    void balRes;
    const txns = (txRes.data as WalletTransaction[]) || [];
    const computedBalance = txns.reduce((sum, t) => {
      if (t.status === 'reversed') return sum;
      if (t.type === 'withdrawal' && t.status === 'pending') return sum;
      return sum + Number(t.amount);
    }, 0);
    setWallet({ balance: computedBalance, txns });
    setReferrals((refRes.data as Referral[]) || []);
    setDetailLoading(false);
  };

  const handleAdjustment = async () => {
    if (!selected) return;
    setAdjError('');
    setAdjSuccess('');
    const amt = parseFloat(adjAmount);
    if (isNaN(amt) || amt <= 0) {
      setAdjError('Enter a valid positive amount.');
      return;
    }
    if (adjDescription.trim().length < 3) {
      setAdjError('Description must be at least 3 characters.');
      return;
    }
    const signedAmount = adjType === 'credit' ? amt : -amt;
    setAdjLoading(true);
    const { error: rpcErr } = await supabase.rpc('manual_adjustment', {
      p_user_id: selected.id,
      p_amount: signedAmount,
      p_description: adjDescription.trim(),
    });
    setAdjLoading(false);
    if (rpcErr) {
      setAdjError(rpcErr.message);
      return;
    }
    setAdjSuccess(`Adjustment of ${formatMoney(signedAmount)} applied successfully.`);
    setAdjAmount('');
    setAdjDescription('');
    await openDetail(selected);
  };

  const handleSuspend = async (userId: string, suspend: boolean) => {
    setActionLoading(true);
    const { error } = suspend
      ? await supabase.rpc('suspend_user', { p_user_id: userId })
      : await supabase.rpc('activate_user', { p_user_id: userId });
    setActionLoading(false);
    if (error) {
      setListError(suspend ? 'Failed to suspend user.' : 'Failed to activate user.');
      return;
    }
    setListError('');
    await loadUsers();
    if (selected?.id === userId) {
      const updated = users.find((u) => u.id === userId);
      if (updated) setSelected({ ...updated, is_suspended: suspend });
    }
  };

  const filtered = users.filter((u) =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.referral_code.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <AdminPageWrapper title="User Management" subtitle="Search, view, and manage user accounts.">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input className="input pl-10" placeholder="Search by name or referral code..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {listError && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{listError}</div>}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="h-10 w-10" />} title="No users found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">Name</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden md:table-cell">Referral Code</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Joined</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{u.name || 'Unnamed'}</p>
                      {u.is_admin && <Badge tone="brand" className="mt-0.5">Admin</Badge>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-ink-400 font-mono text-xs">{u.referral_code}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-ink-400">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {u.is_suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(u)} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white" title="View">
                          <Eye className="h-4 w-4" />
                        </button>
                        {u.is_suspended ? (
                          <button onClick={() => handleSuspend(u.id, false)} disabled={actionLoading} className="rounded-lg p-2 text-brand-400 hover:bg-brand-600/10" title="Activate">
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <button onClick={() => handleSuspend(u.id, true)} disabled={actionLoading} className="rounded-lg p-2 text-danger-400 hover:bg-danger-500/10" title="Suspend">
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* User detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="User Details" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Name</p>
                <p className="font-semibold text-white">{selected.name || 'Unnamed'}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Referral Code</p>
                <p className="font-mono font-semibold text-white">{selected.referral_code}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Joined</p>
                <p className="font-semibold text-white">{new Date(selected.created_at).toLocaleDateString()}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Status</p>
                <p>{selected.is_suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}</p>
              </div>
            </div>

            {detailLoading ? (
              <Spinner size="md" />
            ) : (
              <>
                <div className="rounded-xl bg-brand-600/10 p-4">
                  <p className="text-xs text-ink-400">Wallet Balance</p>
                  <p className="text-2xl font-bold text-brand-400">{wallet ? formatMoney(wallet.balance) : '—'}</p>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-ink-50">Recent Transactions</h4>
                  {wallet && wallet.txns.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {wallet.txns.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between rounded-lg bg-ink-800/50 px-3 py-2">
                          <div>
                            <p className="text-xs font-medium text-ink-50">{tx.description}</p>
                            <p className="text-xs text-ink-400 capitalize">{tx.type.replace(/_/g, ' ')}</p>
                          </div>
                          <span className={`text-sm font-bold ${Number(tx.amount) >= 0 ? 'text-accent-400' : 'text-ink-400'}`}>
                            {Number(tx.amount) >= 0 ? '+' : ''}{formatMoney(tx.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-400">No transactions</p>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-ink-50">Referrals</h4>
                  {referrals.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {referrals.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg bg-ink-800/50 px-3 py-2">
                          <div>
                            <p className="text-xs font-medium text-ink-50">
                              {r.referred?.name || 'User'}
                            </p>
                            <p className="text-xs text-ink-400">
                              {r.referred_id === selected.id ? 'Referred by someone' : 'You referred'}
                            </p>
                          </div>
                          <Badge tone={r.status === 'qualified' ? 'success' : r.status === 'reversed' ? 'danger' : 'warning'}>
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-400">No referrals</p>
                  )}
                </div>

                {!selected.is_admin && (
                  <div className="rounded-xl border border-ink-200 p-4">
                    <div className="flex items-center gap-2">
                      <WalletIcon className="h-4 w-4 text-brand-400" />
                      <h4 className="text-sm font-semibold text-white">Manual Wallet Adjustment</h4>
                    </div>
                    {adjSuccess && (
                      <div className="mt-3 rounded-lg bg-accent-400/10 p-2.5 text-xs text-accent-400">
                        {adjSuccess}
                      </div>
                    )}
                    {adjError && (
                      <div className="mt-3 rounded-lg bg-danger-500/10 p-2.5 text-xs text-danger-400">
                        {adjError}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setAdjType('credit')}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                          adjType === 'credit'
                            ? 'bg-accent-400/15 text-accent-400 ring-1 ring-accent-400/30'
                            : 'bg-ink-800 text-ink-400 hover:text-white'
                        }`}
                      >
                        <Plus className="h-4 w-4" /> Credit
                      </button>
                      <button
                        onClick={() => setAdjType('debit')}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                          adjType === 'debit'
                            ? 'bg-danger-500/15 text-danger-400 ring-1 ring-danger-500/30'
                            : 'bg-ink-800 text-ink-400 hover:text-white'
                        }`}
                      >
                        <Minus className="h-4 w-4" /> Debit
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Amount (INR)"
                        value={adjAmount}
                        onChange={(e) => setAdjAmount(e.target.value)}
                      />
                      <Input
                        type="text"
                        placeholder="Description"
                        value={adjDescription}
                        onChange={(e) => setAdjDescription(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleAdjustment}
                      disabled={adjLoading}
                      size="sm"
                      fullWidth
                      className="mt-3"
                    >
                      {adjLoading ? <Spinner size="sm" /> : `Apply ${adjType === 'credit' ? 'Credit' : 'Debit'}`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </AdminPageWrapper>
  );
}
