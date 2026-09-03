import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Search, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { TaskSubmission } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FilterType = 'all' | 'pending' | 'approved' | 'rejected';

export function MySubmissionsPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error } = await supabase
        .from('task_submissions')
        .select('*, task:tasks(id, title, category, reward)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        setError('Failed to load submissions.');
        setLoading(false);
        return;
      }
      setSubmissions(data as TaskSubmission[]);
      setLoading(false);
    })();
  }, [user]);

  const filtered = submissions.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search && !(s.task?.title || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: submissions.length,
    pending: submissions.filter((s) => s.status === 'pending').length,
    approved: submissions.filter((s) => s.status === 'approved').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
  };

  const filterTabs: { key: FilterType; label: string; icon: typeof Clock; tone: string }[] = [
    { key: 'all', label: 'All', icon: ClipboardList, tone: 'text-ink-400' },
    { key: 'pending', label: 'Pending', icon: Clock, tone: 'text-warning-400' },
    { key: 'approved', label: 'Approved', icon: CheckCircle2, tone: 'text-accent-400' },
    { key: 'rejected', label: 'Rejected', icon: XCircle, tone: 'text-danger-400' },
  ];

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Submissions</h1>
          <p className="mt-1 text-sm text-ink-400">Track the status of every task you've submitted.</p>
        </div>
        <Button to="/dashboard/tasks" size="sm">
          <ClipboardList className="h-4 w-4" /> Browse Tasks
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {filterTabs.map((tab) => (
          <Card key={tab.key} className="p-4">
            <div className="flex items-center gap-2">
              <tab.icon className={`h-4 w-4 ${tab.tone}`} />
              <p className="text-xs text-ink-400">{tab.label}</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{counts[tab.key]}</p>
          </Card>
        ))}
      </div>

      {/* Search + filter tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                filter === tab.key
                  ? 'bg-brand-600 text-white shadow-glow-purple'
                  : 'bg-ink-800 text-ink-400 hover:bg-ink-300/30 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search by task name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}

      {/* Submission list */}
      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title={submissions.length === 0 ? "No submissions yet" : "No matching submissions"}
            description={submissions.length === 0 ? "Browse available tasks and submit proof to start earning." : "Try a different filter or search term."}
            action={submissions.length === 0 ? <Button to="/dashboard/tasks" size="sm">Browse Tasks</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => (
            <Card key={sub.id} className="p-5" hover>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-white">{sub.task?.title || 'Task'}</h3>
                    <StatusBadge status={sub.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
                    <span className="capitalize">{sub.task?.category || 'other'}</span>
                    <span>{new Date(sub.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {sub.status === 'approved' && sub.reward_amount > 0 && (
                      <span className="font-semibold text-accent-400">{formatMoney(sub.reward_amount)} earned</span>
                    )}
                  </div>
                  {sub.status === 'rejected' && sub.rejection_reason && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-danger-500/10 p-2.5 text-xs text-danger-400">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>{sub.rejection_reason}</span>
                    </div>
                  )}
                  {sub.status === 'pending' && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-warning-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Under review — our team will verify shortly.</span>
                    </div>
                  )}
                </div>
                <Link
                  to={`/dashboard/tasks/${sub.task_id}`}
                  className="shrink-0 rounded-xl border border-ink-200 px-3 py-2 text-sm font-medium text-ink-400 transition hover:border-brand-600/40 hover:text-white"
                >
                  View <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
