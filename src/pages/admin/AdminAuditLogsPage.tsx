import { useEffect, useState } from 'react';
import { ScrollText, Search, Eye, User as UserIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { AuditLog } from '@/types';

const actionTone: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand'> = {
  task_approval: 'success',
  task_rejection: 'danger',
  withdrawal_review: 'warning',
  referral_qualified: 'brand',
  manual_adjustment: 'info',
  user_suspended: 'danger',
  user_activated: 'success',
  admin_bootstrap: 'neutral',
};

const actionLabels: Record<string, string> = {
  task_approval: 'Task Approved',
  task_rejection: 'Task Rejected',
  withdrawal_review: 'Withdrawal Reviewed',
  referral_qualified: 'Referral Qualified',
  manual_adjustment: 'Manual Adjustment',
  user_suspended: 'User Suspended',
  user_activated: 'User Activated',
  admin_bootstrap: 'Admin Bootstrap',
};

interface AuditWithActor extends AuditLog {
  actor?: { name: string; referral_code: string } | null;
}

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditWithActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [selected, setSelected] = useState<AuditWithActor | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      let query = supabase
        .from('audit_logs')
        .select('*, actor:profiles!actor_id(name, referral_code)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }
      const { data, error } = await query;
      if (error) setError('Failed to load audit logs.');
      setLogs((data as AuditWithActor[]) || []);
      setLoading(false);
    })();
  }, [actionFilter]);

  const filtered = logs.filter((log) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(s) ||
      log.target_type?.toLowerCase().includes(s) ||
      log.actor?.name?.toLowerCase().includes(s) ||
      log.actor?.referral_code?.toLowerCase().includes(s)
    );
  });

  const knownActions = Object.keys(actionLabels);
  const filterActions = ['all', ...knownActions];

  return (
    <AdminPageWrapper title="Audit Logs" subtitle="Complete trail of all admin actions on the platform.">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-10"
            placeholder="Search by action, target, or admin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input max-w-[200px] cursor-pointer"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          {filterActions.map((a) => (
            <option key={a} value={a}>
              {a === 'all' ? 'All Actions' : actionLabels[a] || a}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-10 w-10" />}
            title="No audit logs found"
            description="Admin actions will appear here as they occur."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">Action</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden md:table-cell">Admin</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Target</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Date</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <Badge tone={actionTone[log.action] || 'neutral'}>
                        {actionLabels[log.action] || log.action.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {log.actor ? (
                        <div>
                          <p className="font-medium text-white">{log.actor.name || 'Unknown'}</p>
                          <p className="text-xs font-mono text-ink-400">{log.actor.referral_code}</p>
                        </div>
                      ) : (
                        <span className="text-ink-400">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell capitalize text-ink-400">
                      {log.target_type || '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {new Date(log.created_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(log)}
                        className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white"
                        title="View details"
                      >
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

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Audit Log Detail" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Action</p>
                <div className="mt-1">
                  <Badge tone={actionTone[selected.action] || 'neutral'}>
                    {actionLabels[selected.action] || selected.action.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Date & Time</p>
                <p className="font-semibold text-white">
                  {new Date(selected.created_at).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Admin</p>
                {selected.actor ? (
                  <>
                    <p className="font-semibold text-white">{selected.actor.name || 'Unknown'}</p>
                    <p className="text-xs font-mono text-ink-400">{selected.actor.referral_code}</p>
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 font-semibold text-ink-400">
                    <UserIcon className="h-4 w-4" /> System
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Target</p>
                <p className="font-semibold capitalize text-white">{selected.target_type || '—'}</p>
                {selected.target_id && (
                  <p className="mt-0.5 break-all font-mono text-xs text-ink-400">{selected.target_id}</p>
                )}
              </div>
            </div>

            {selected.details && (
              <div>
                <p className="mb-1 text-sm font-semibold text-ink-50">Details</p>
                <div className="rounded-xl bg-ink-800/50 p-4">
                  <pre className="whitespace-pre-wrap break-all text-xs text-ink-50">
                    {JSON.stringify(selected.details, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AdminPageWrapper>
  );
}
