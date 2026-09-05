import { useEffect, useState } from 'react';
import { FileCheck, CheckCircle2, XCircle, Eye, Zap } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { TaskSubmission } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface SubWithRelations extends Omit<TaskSubmission, 'task'> {
  task?: { title: string; reward: number; category: string };
  user?: { name: string; referral_code: string };
}

export function AdminSubmissionsPage() {
  const [subs, setSubs] = useState<SubWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState<SubWithRelations | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSubs = async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('task_submissions')
      .select('*, task:tasks(title, reward, category)')
      .order('created_at', { ascending: false });
    if (filter !== 'all') {
      query = query.eq('status', filter);
    }
    const { data, error } = await query.limit(100);
    if (error) {
      setError('Failed to load submissions.');
      setSubs([]);
      setLoading(false);
      return;
    }
    const submissions = (data as SubWithRelations[]) || [];
    const userIds = [...new Set(submissions.map((s) => s.user_id).filter(Boolean))];
    const profileMap: Record<string, { name: string; referral_code: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, referral_code')
        .in('id', userIds);
      for (const p of profiles || []) {
        profileMap[p.id] = { name: p.name, referral_code: p.referral_code };
      }
    }
    setSubs(submissions.map((s) => ({ ...s, user: profileMap[s.user_id] })));
    setLoading(false);
  };

  useEffect(() => {
    loadSubs();
  }, [filter]);

  const handleApprove = async (subId: string) => {
    setActionLoading(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('approve_task_submission', { p_submission_id: subId });
    setActionLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess('Submission approved and reward credited.');
    setSelected(null);
    await loadSubs();
  };

  const handleReject = async () => {
    if (!selected) return;
    if (rejectReason.trim().length < 3) {
      setError('Please provide a rejection reason.');
      return;
    }
    setActionLoading(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('reject_task_submission', {
      p_submission_id: selected.id,
      p_reason: rejectReason.trim(),
    });
    setActionLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSelected(null);
    setRejectReason('');
    await loadSubs();
  };

  const filters = ['pending', 'approved', 'rejected', 'all'];

  return (
    <AdminPageWrapper title="Submission Management" subtitle="Review and approve or reject task submissions.">
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
        ) : subs.length === 0 ? (
          <EmptyState icon={<FileCheck className="h-10 w-10" />} title="No submissions" description={`No ${filter} submissions to display.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">Task</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden md:table-cell">User</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Reward</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Submitted</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{s.task?.title || 'Task'}</p>
                      <Badge tone="neutral" className="mt-0.5 capitalize">{s.task?.category}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-ink-50">{s.user?.name || 'User'}</p>
                      <p className="text-xs text-ink-400 font-mono">{s.user?.referral_code}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-accent-400">
                      {s.status === 'approved' ? formatMoney(s.reward_amount) : formatMoney(s.task?.reward ?? 0)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-ink-400">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {s.is_auto_verified && (
                          <span className="flex items-center gap-0.5 rounded-md bg-brand-600/20 px-1.5 py-0.5 text-xs text-brand-400" title="Auto-verified">
                            <Zap className="h-3 w-3" />
                          </span>
                        )}
                        <button onClick={() => { setSelected(s); setRejectReason(''); setError(''); }} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white" title="Review">
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Review Submission" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Task</p>
                <p className="font-semibold text-white">{selected.task?.title}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">User</p>
                <p className="font-semibold text-white">{selected.user?.name || 'User'}</p>
                <p className="text-xs font-mono text-ink-400">{selected.user?.referral_code}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Reward</p>
                <p className="font-bold text-accent-400">{formatMoney(selected.task?.reward ?? 0)}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Status</p>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-ink-50">Proof Submitted</p>
              <div className="rounded-xl bg-ink-800/50 p-4">
                <p className="whitespace-pre-wrap text-sm text-ink-50">{selected.proof_text}</p>
              </div>
            </div>

            {selected.proof_image_url && (
              <div>
                <p className="mb-1 text-sm font-semibold text-ink-50">Screenshot</p>
                <AdminProofImage path={selected.proof_image_url} />
              </div>
            )}

            {selected.status === 'rejected' && selected.rejection_reason && (
              <div className="rounded-xl bg-danger-500/10 p-3">
                <p className="text-sm text-danger-400"><strong>Rejection reason:</strong> {selected.rejection_reason}</p>
                {selected.is_auto_verified && selected.auto_verification_result && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
                    <Zap className="h-3 w-3" /> Auto-verification result: {selected.auto_verification_result.reason}
                  </p>
                )}
              </div>
            )}

            {selected.status === 'approved' && (
              <div className="rounded-xl bg-accent-400/10 p-3">
                <p className="text-sm text-accent-400">This submission was approved. Reward: {formatMoney(selected.reward_amount)}</p>
                {selected.is_auto_verified && selected.auto_verification_result && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
                    <Zap className="h-3 w-3" /> Auto-verification result: {selected.auto_verification_result.reason}
                  </p>
                )}
              </div>
            )}

            {selected.is_auto_verified && selected.status === 'pending' && (
              <div className="rounded-xl bg-brand-600/10 p-3">
                <p className="flex items-center gap-1.5 text-sm text-brand-400">
                  <Zap className="h-4 w-4" /> This submission was processed by automatic verification.
                </p>
              </div>
            )}

            {selected.status === 'pending' && (
              <>
                <div>
                  <Textarea
                    label="Rejection reason (only needed for rejection)"
                    name="reject_reason"
                    placeholder="Explain why this submission is being rejected..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                  />
                </div>
                {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
                <div className="flex justify-end gap-2">
                  <Button variant="danger" onClick={handleReject} disabled={actionLoading}>
                    {actionLoading ? <Spinner size="sm" /> : <><XCircle className="h-4 w-4" /> Reject</>}
                  </Button>
                  <Button onClick={() => handleApprove(selected.id)} disabled={actionLoading}>
                    {actionLoading ? <Spinner size="sm" /> : <><CheckCircle2 className="h-4 w-4" /> Approve & Credit Reward</>}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </AdminPageWrapper>
  );
}

function AdminProofImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    (async () => {
      const { data, error } = await supabase.storage.from('task-proofs').createSignedUrl(path, 3600);
      if (revoked) return;
      if (error || !data?.signedUrl) {
        setError(true);
        setLoading(false);
        return;
      }
      setUrl(data.signedUrl);
      setLoading(false);
    })();
    return () => { revoked = true; };
  }, [path]);

  if (loading) return <div className="rounded-xl bg-ink-800/50 p-4"><Spinner size="sm" /></div>;
  if (error || !url) return <p className="rounded-xl bg-ink-800/50 p-4 text-xs text-ink-400">Image unavailable</p>;
  return (
    <img
      src={url}
      alt="Proof screenshot"
      className="max-h-80 rounded-xl border border-ink-200 object-contain"
    />
  );
}
