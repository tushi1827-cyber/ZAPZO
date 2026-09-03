import { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Activity, Ban, CheckCircle2,
  Eye, FileText, Search,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { RiskEvent, UserRiskProfile, RiskReviewStatus } from '@/types';

type FilterKey = 'all' | 'low' | 'medium' | 'high' | 'critical' | 'under_review' | 'resolved';

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'resolved', label: 'Resolved' },
];

function riskTone(score: number): 'success' | 'warning' | 'danger' | 'brand' {
  if (score >= 80) return 'danger';
  if (score >= 60) return 'warning';
  if (score >= 30) return 'warning';
  return 'success';
}

function riskLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

function eventTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AdminFraudPage() {
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [riskProfiles, setRiskProfiles] = useState<Map<string, UserRiskProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<RiskEvent | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [stats, setStats] = useState({ flagged: 0, high: 0, critical: 0, totalEvents: 0 });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [eventsRes, profilesRes] = await Promise.all([
      supabase.from('risk_events')
        .select('*, profile:profiles!user_id(name, referral_code, is_suspended), task:tasks(title)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('user_risk_profiles').select('*'),
    ]);

    const evts = (eventsRes.data as RiskEvent[]) || [];
    setEvents(evts);

    const profileMap = new Map<string, UserRiskProfile>();
    for (const rp of (profilesRes.data as UserRiskProfile[]) || []) {
      profileMap.set(rp.user_id, rp);
    }
    setRiskProfiles(profileMap);

    const flagged = Array.from(profileMap.values()).filter((p) => p.risk_score > 0).length;
    const high = Array.from(profileMap.values()).filter((p) => p.risk_score >= 60 && p.risk_score < 80).length;
    const critical = Array.from(profileMap.values()).filter((p) => p.risk_score >= 80).length;
    setStats({ flagged, high, critical, totalEvents: evts.length });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEvents = events.filter((e) => {
    const profile = riskProfiles.get(e.user_id);
    const score = profile?.risk_score ?? 0;
    const reviewStatus = profile?.review_status ?? 'none';

    if (filter === 'low' && score >= 30) return false;
    if (filter === 'medium' && (score < 30 || score >= 60)) return false;
    if (filter === 'high' && (score < 60 || score >= 80)) return false;
    if (filter === 'critical' && score < 80) return false;
    if (filter === 'under_review' && reviewStatus !== 'under_review') return false;
    if (filter === 'resolved' && reviewStatus !== 'resolved') return false;

    if (search) {
      const name = (e.profile?.name || '').toLowerCase();
      const code = (e.profile?.referral_code || '').toLowerCase();
      const desc = e.description.toLowerCase();
      const q = search.toLowerCase();
      if (!name.includes(q) && !code.includes(q) && !desc.includes(q)) return false;
    }

    return true;
  });

  const openDetail = (event: RiskEvent) => {
    setSelectedEvent(event);
    const profile = riskProfiles.get(event.user_id);
    setAdminNotes(profile?.admin_notes || '');
    setActionError('');
    setActionSuccess('');
  };

  const handleReview = async (action: 'resolve' | 'under_review') => {
    if (!selectedEvent) return;
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    const { error } = await supabase.rpc('review_risk_event', {
      p_event_id: selectedEvent.id,
      p_action: action,
      p_notes: adminNotes,
    });
    setActionLoading(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setActionSuccess(action === 'resolve' ? 'Event marked as resolved.' : 'Event marked as under review.');
    await loadData();
  };

  const handleSaveNotes = async () => {
    if (!selectedEvent) return;
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    const { error } = await supabase.rpc('update_risk_admin_notes', {
      p_user_id: selectedEvent.user_id,
      p_notes: adminNotes,
    });
    setActionLoading(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    setActionSuccess('Notes saved.');
    await loadData();
  };

  const handleSuspend = async (userId: string, suspend: boolean) => {
    setActionLoading(true);
    setActionError('');
    const { error } = suspend
      ? await supabase.rpc('suspend_user', { p_user_id: userId })
      : await supabase.rpc('activate_user', { p_user_id: userId });
    setActionLoading(false);
    if (error) {
      setActionError(suspend ? 'Failed to suspend user.' : 'Failed to activate user.');
      return;
    }
    await loadData();
    if (selectedEvent) {
      const refreshed = events.find((e) => e.id === selectedEvent.id);
      if (refreshed) setSelectedEvent(refreshed);
    }
  };

  const statCards = [
    { label: 'Flagged Users', value: stats.flagged, icon: ShieldAlert, tone: 'bg-warning-500/15 text-warning-400' },
    { label: 'High Risk', value: stats.high, icon: AlertTriangle, tone: 'bg-warning-500/15 text-warning-400' },
    { label: 'Critical Risk', value: stats.critical, icon: ShieldAlert, tone: 'bg-danger-500/15 text-danger-400' },
    { label: 'Total Events', value: stats.totalEvents, icon: Activity, tone: 'bg-brand-600/15 text-brand-400' },
  ];

  return (
    <AdminPageWrapper title="Fraud & Abuse Protection" subtitle="Monitor suspicious activity, review risk events, and protect the platform.">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filter === f.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-800 text-ink-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-10"
            placeholder="Search user or event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Events table */}
      <Card className="overflow-hidden">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-10 w-10" />}
            title="No suspicious activity detected"
            description="All clear. Risk events will appear here when flagged."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">User</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Event</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden md:table-cell">Description</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Risk Score</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((e) => {
                  const profile = riskProfiles.get(e.user_id);
                  const score = profile?.risk_score ?? 0;
                  return (
                    <tr key={e.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{e.profile?.name || 'Unknown'}</p>
                        <p className="text-xs text-ink-400 font-mono">{e.profile?.referral_code || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={e.event_type === 'referral_abuse' ? 'danger' : 'warning'}>
                          {eventTypeLabel(e.event_type)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-ink-400 max-w-xs">
                        <p className="truncate">{e.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${
                            score >= 80 ? 'text-danger-400' :
                            score >= 60 ? 'text-warning-400' :
                            score >= 30 ? 'text-warning-400' :
                            'text-success-400'
                          }`}>{score}</span>
                          <Badge tone={riskTone(score)}>{riskLabel(score)}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-ink-400">
                        {new Date(e.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDetail(e)}
                          className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white"
                          title="Review"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review modal */}
      <Modal open={!!selectedEvent} onClose={() => setSelectedEvent(null)} title="Review Risk Event" size="lg">
        {selectedEvent && (
          <div className="space-y-4">
            {/* User info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">User</p>
                <p className="font-semibold text-white">{selectedEvent.profile?.name || 'Unknown'}</p>
              </div>
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Referral Code</p>
                <p className="font-mono font-semibold text-white">{selectedEvent.profile?.referral_code || '—'}</p>
              </div>
            </div>

            {/* Event details */}
            <div className="rounded-xl border border-ink-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning-400" />
                  <span className="font-semibold text-white">{eventTypeLabel(selectedEvent.event_type)}</span>
                </div>
                <Badge tone="warning">+{selectedEvent.risk_points} risk points</Badge>
              </div>
              <p className="mt-2 text-sm text-ink-400">{selectedEvent.description}</p>
              <p className="mt-1 text-xs text-ink-400">
                {new Date(selectedEvent.created_at).toLocaleString()}
              </p>
            </div>

            {/* Risk profile */}
            {riskProfiles.get(selectedEvent.user_id) && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(() => {
                  const rp = riskProfiles.get(selectedEvent.user_id)!;
                  return [
                    { label: 'Risk Score', value: `${rp.risk_score} (${riskLabel(rp.risk_score)})` },
                    { label: 'Duplicates', value: rp.duplicate_submission_count },
                    { label: 'Rapid', value: rp.rapid_submission_count },
                    { label: 'Rejections', value: rp.excessive_rejection_count },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-ink-800/50 p-3">
                      <p className="text-xs text-ink-400">{item.label}</p>
                      <p className="font-semibold text-white">{item.value}</p>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Related task */}
            {selectedEvent.task?.title && (
              <div className="rounded-xl bg-ink-800/50 p-3">
                <p className="text-xs text-ink-400">Related Task</p>
                <p className="font-semibold text-white">{selectedEvent.task.title}</p>
              </div>
            )}

            {/* Review status */}
            {riskProfiles.get(selectedEvent.user_id) && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-400">Review Status:</span>
                <Badge tone={
                  riskProfiles.get(selectedEvent.user_id)!.review_status === 'resolved' ? 'success' :
                  riskProfiles.get(selectedEvent.user_id)!.review_status === 'under_review' ? 'warning' : 'neutral'
                }>
                  {riskProfiles.get(selectedEvent.user_id)!.review_status.replace(/_/g, ' ')}
                </Badge>
                {selectedEvent.profile?.is_suspended && <Badge tone="danger">Suspended</Badge>}
              </div>
            )}

            {/* Admin notes */}
            <div>
              <label className="text-sm font-semibold text-ink-50">Admin Notes</label>
              <Textarea
                name="adminNotes"
                placeholder="Add internal notes about this user or event..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>

            {/* Feedback */}
            {actionError && (
              <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{actionError}</div>
            )}
            {actionSuccess && (
              <div className="rounded-xl bg-success-500/10 p-3 text-sm text-success-400">{actionSuccess}</div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleReview('under_review')}
                disabled={actionLoading}
                size="sm"
                variant="secondary"
              >
                {actionLoading ? <Spinner size="sm" /> : <><FileText className="h-4 w-4" /> Mark Under Review</>}
              </Button>
              <Button
                onClick={() => handleReview('resolve')}
                disabled={actionLoading}
                size="sm"
              >
                {actionLoading ? <Spinner size="sm" /> : <><CheckCircle2 className="h-4 w-4" /> Resolve</>}
              </Button>
              <Button
                onClick={handleSaveNotes}
                disabled={actionLoading}
                size="sm"
                variant="secondary"
              >
                Save Notes
              </Button>
              {selectedEvent.profile?.is_suspended ? (
                <Button
                  onClick={() => handleSuspend(selectedEvent.user_id, false)}
                  disabled={actionLoading}
                  size="sm"
                  variant="secondary"
                >
                  <CheckCircle2 className="h-4 w-4" /> Activate User
                </Button>
              ) : (
                <Button
                  onClick={() => handleSuspend(selectedEvent.user_id, true)}
                  disabled={actionLoading}
                  size="sm"
                  variant="secondary"
                >
                  <Ban className="h-4 w-4" /> Suspend User
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AdminPageWrapper>
  );
}
