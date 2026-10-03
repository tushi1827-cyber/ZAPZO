import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, MessageSquare, Lightbulb, Bug, Flag } from 'lucide-react';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { supabase } from '@/lib/supabase';
import { UserFeedback, FeedbackType } from '@/types';

const typeIcons: Record<FeedbackType, typeof MessageSquare> = {
  feedback: MessageSquare,
  suggestion: Lightbulb,
  bug: Bug,
  report: Flag,
};

const typeLabels: Record<FeedbackType, string> = {
  feedback: 'Feedback',
  suggestion: 'Suggestion',
  bug: 'Bug Report',
  report: 'Issue Report',
};

const statusTone: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  open: 'info',
  reviewing: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

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

export function AdminFeedbackPage() {
  const [items, setItems] = useState<UserFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase.from('user_feedback').select('*')
      .order('created_at', { ascending: false }).limit(200);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (typeFilter !== 'all') query = query.eq('type', typeFilter);
    const { data, error: err } = await query;
    if (err) {
      setError('Failed to load feedback');
      setItems([]);
    } else {
      const rows = (data as UserFeedback[]) || [];
      const userIds = [...new Set(rows.map(r => r.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles')
          .select('id, name, referral_code').in('id', userIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p]));
        rows.forEach(r => { r.profile = profileMap.get(r.user_id) as UserFeedback['profile']; });
      }
      let filtered = rows;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = rows.filter(r =>
          (r.subject || '').toLowerCase().includes(q) ||
          r.message.toLowerCase().includes(q) ||
          r.profile?.name?.toLowerCase().includes(q) ||
          r.profile?.referral_code?.toLowerCase().includes(q)
        );
      }
      setItems(filtered);
    }
    setLoading(false);
  }, [statusFilter, typeFilter, search]);

  useEffect(() => { load(); }, [load]);

  const statusFilters = ['all', 'open', 'reviewing', 'resolved', 'closed'];
  const typeFilters: Array<'all' | FeedbackType> = ['all', 'feedback', 'suggestion', 'bug', 'report'];

  const columns = [
    {
      key: 'type', header: 'Type',
      render: (row: UserFeedback) => {
        const Icon = typeIcons[row.type];
        return (
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-brand-400" />
            <span className="hidden sm:inline">{typeLabels[row.type]}</span>
          </span>
        );
      },
    },
    {
      key: 'subject', header: 'Subject',
      render: (row: UserFeedback) => (
        <Link to={`/admin/feedback/${row.id}`} className="font-medium text-white transition hover:text-brand-400">
          {row.subject || 'No subject'}
        </Link>
      ),
    },
    {
      key: 'user', header: 'User', hideOnMobile: true,
      render: (row: UserFeedback) => (
        <span className="text-ink-400">{row.profile?.name || row.user_id.slice(0, 8)}</span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (row: UserFeedback) => <Badge tone={statusTone[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'created_at', header: 'Created', hideOnMobile: true,
      render: (row: UserFeedback) => <span className="text-ink-400">{timeAgo(row.created_at)}</span>,
    },
  ];

  return (
    <AdminPageWrapper title="Feedback & Reports" subtitle="Review and manage user feedback, suggestions, bug reports, and issue reports.">
      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search subject, message, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input cursor-pointer"
          >
            {typeFilters.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : typeLabels[t as FeedbackType]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              statusFilter === s
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800/50 text-ink-400 hover:bg-ink-800 hover:text-ink-50'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner size="lg" className="py-20" />
      ) : items.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<MessageSquare className="h-10 w-10" />}
            title="No feedback found"
            description="User feedback, suggestions, and reports will appear here."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table columns={columns} data={items} emptyMessage="No feedback found" />
        </Card>
      )}
    </AdminPageWrapper>
  );
}
