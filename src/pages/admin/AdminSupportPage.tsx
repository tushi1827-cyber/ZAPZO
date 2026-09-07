import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Headset, Search, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { SupportTicket } from '@/types';

const categoryLabels: Record<string, string> = {
  task_issue: 'Task Issue',
  payment_reward: 'Payment / Reward',
  withdrawal: 'Withdrawal',
  account: 'Account',
  referral: 'Referral',
  technical: 'Technical',
  other: 'Other',
};

interface TicketWithUser extends SupportTicket {
  profile?: { name: string; referral_code: string };
}

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

export function AdminSupportPage() {
  const [tickets, setTickets] = useState<TicketWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
    if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter);
    if (search.trim()) {
      query = query.or(`ticket_number.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) { setError('Failed to load tickets.'); setLoading(false); return; }

    const items = (data as SupportTicket[]) || [];
    const userIds = [...new Set(items.map(t => t.user_id))];
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

    // If search matches user names, filter
    let filtered = items.map(t => ({ ...t, profile: profileMap[t.user_id] }));
    if (search.trim()) {
      const lowerSearch = search.trim().toLowerCase();
      filtered = filtered.filter(t =>
        t.profile?.name?.toLowerCase().includes(lowerSearch) ||
        t.ticket_number.toLowerCase().includes(lowerSearch) ||
        t.subject.toLowerCase().includes(lowerSearch)
      );
    }

    setTickets(filtered);
    setLoading(false);
  }, [statusFilter, categoryFilter, priorityFilter, search]);

  useEffect(() => { load(); }, [load]);

  const statusFilters = ['all', 'open', 'in_progress', 'resolved', 'closed'];

  return (
    <AdminPageWrapper title="Support Tickets" subtitle="Manage customer support tickets.">
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              statusFilter === f
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800 text-ink-400 hover:bg-ink-300/30 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Search + category + priority */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search ticket #, subject, or user..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input sm:w-44 cursor-pointer">
          <option value="all">All Categories</option>
          <option value="task_issue">Task Issue</option>
          <option value="payment_reward">Payment / Reward</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="account">Account</option>
          <option value="referral">Referral</option>
          <option value="technical">Technical</option>
          <option value="other">Other</option>
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="input sm:w-36 cursor-pointer">
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner size="lg" className="py-20" />
        ) : tickets.length === 0 ? (
          <EmptyState icon={<Headset className="h-10 w-10" />} title="No tickets found" description="No tickets match your current filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">Ticket #</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">User</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Subject</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden lg:table-cell">Priority</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden lg:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/support/${t.id}`} className="font-mono text-brand-400 hover:text-brand-300">
                        {t.ticket_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{t.profile?.name || 'User'}</p>
                      <p className="text-xs font-mono text-ink-400">{t.profile?.referral_code}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Link to={`/admin/support/${t.id}`} className="text-white hover:text-brand-300">
                        <p className="truncate max-w-[200px]">{t.subject}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-ink-400">{categoryLabels[t.category]}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell text-ink-400">{timeAgo(t.updated_at)}</td>
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
