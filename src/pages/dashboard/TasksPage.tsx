import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Search, Coins, AlertCircle, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Task, TaskSubmission } from '@/types';

const categories = ['all', 'social', 'survey', 'website', 'app', 'learning', 'other'] as const;

export function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, TaskSubmission>>({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [taskImageUrls, setTaskImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false });
      if (error) {
        setError('Failed to load tasks. Please try again.');
        setLoading(false);
        return;
      }
      const taskList = (data as Task[]) || [];
      setTasks(taskList);

      // Build image URLs for tasks that have images
      const urls: Record<string, string> = {};
      taskList.forEach((t) => {
        if (t.task_image_url) {
          urls[t.id] = supabase.storage.from('task-images').getPublicUrl(t.task_image_url).data.publicUrl;
        }
      });
      setTaskImageUrls(urls);

      const { data: subs } = await supabase
        .from('task_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const subMap: Record<string, TaskSubmission> = {};
      (subs as TaskSubmission[] || []).forEach((s) => {
        // Keep the most recent submission per task (ordered desc)
        if (!subMap[s.task_id]) subMap[s.task_id] = s;
      });
      setSubmissions(subMap);
      setLoading(false);
    })();
  }, [user]);

  const filtered = tasks.filter((t) => {
    if (category !== 'all' && t.category !== category) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Browse Tasks</h1>
        <p className="mt-1 text-sm text-ink-400">Complete verified tasks to earn rewards. Rewards are credited after admin approval.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              category === cat
                ? 'bg-brand-600 text-white shadow-glow-purple'
                : 'bg-ink-800 text-ink-400 hover:bg-ink-300/30 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">{error}</div>
      )}

      {loading ? (
        <Spinner size="lg" className="py-20" />
      ) : filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="No tasks available"
            description="New tasks are added regularly. Check back soon!"
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((task) => {
            const sub = submissions[task.id];
            const isFull = task.approved_count >= task.max_completions;
            const imageUrl = taskImageUrls[task.id];
            const validTaskLink = task.task_link && /^https?:\/\//.test(task.task_link) ? task.task_link : null;
            return (
              <Card key={task.id} hover className="flex flex-col p-5">
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={task.title}
                    className="mb-3 h-32 w-full rounded-xl object-cover"
                  />
                )}
                <div className="flex items-start justify-between gap-2">
                  <Badge tone="brand" className="capitalize">{task.category}</Badge>
                  {sub && (
                    <Badge tone={sub.status === 'approved' ? 'success' : sub.status === 'rejected' ? 'danger' : 'warning'}>
                      {sub.status}
                    </Badge>
                  )}
                </div>
                <h3 className="mt-3 font-bold text-white">{task.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-ink-400">{task.description}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-ink-400">
                  <span className="flex items-center gap-1"><Coins className="h-4 w-4 text-accent-400" /> ₹{Number(task.reward).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-ink-400" /> {task.approved_count}/{task.max_completions} approved</span>
                  {task.status === 'paused' && <span className="flex items-center gap-1 text-warning-400"><AlertCircle className="h-3.5 w-3.5" /> paused</span>}
                </div>
                {validTaskLink && (
                  <a
                    href={validTaskLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Task Link
                  </a>
                )}
                <div className="mt-4 pt-4 border-t border-ink-200">
                  {sub && sub.status === 'pending' ? (
                    <Link to={`/dashboard/tasks/${task.id}`} className="block w-full">
                      <button className="btn-secondary w-full text-sm">View Submission</button>
                    </Link>
                  ) : sub && sub.status === 'approved' ? (
                    <Link to={`/dashboard/tasks/${task.id}`} className="block w-full">
                      <button className="btn-secondary w-full text-sm">Approved — View Details</button>
                    </Link>
                  ) : sub && sub.status === 'rejected' && !isFull && task.status === 'active' ? (
                    <Link to={`/dashboard/tasks/${task.id}`} className="block w-full">
                      <button className="btn-primary w-full text-sm">Submit Again</button>
                    </Link>
                  ) : isFull || task.status !== 'active' ? (
                    <button disabled className="btn-secondary w-full text-sm opacity-50 cursor-not-allowed">
                      {isFull ? 'Task Full' : 'Task Paused'}
                    </button>
                  ) : (
                    <Link to={`/dashboard/tasks/${task.id}`} className="block w-full">
                      <button className="btn-primary w-full text-sm">Start Task</button>
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
