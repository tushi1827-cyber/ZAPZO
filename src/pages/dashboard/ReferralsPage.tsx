import { useEffect, useState } from 'react';
import { Copy, Check, Users, CheckCircle2, Coins, Share2, Gift } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Referral } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReferralsPage() {
  const { user, profile } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ total: 0, qualified: 0, earnings: 0 });

  const referralLink = `${window.location.origin}/register?ref=${profile?.referral_code || ''}`;

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error } = await supabase
        .from('referrals')
        .select('*, referred:profiles!referred_id(name, referral_code, created_at)')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        setError('Failed to load referrals.');
        setLoading(false);
        return;
      }
      const refs = (data as Referral[]) || [];
      setReferrals(refs);
      setStats({
        total: refs.length,
        qualified: refs.filter((r) => r.status === 'qualified').length,
        earnings: refs.filter((r) => r.status === 'qualified').reduce((s, r) => s + Number(r.reward_amount), 0),
      });
      setLoading(false);
    })();
  }, [user]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(profile?.referral_code || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  const statCards = [
    { label: 'Total Referrals', value: stats.total, icon: Users, tone: 'bg-brand-600/15 text-brand-400' },
    { label: 'Qualified Referrals', value: stats.qualified, icon: CheckCircle2, tone: 'bg-brand-600/15 text-brand-400' },
    { label: 'Referral Earnings', value: formatMoney(stats.earnings), icon: Coins, tone: 'bg-accent-400/10 text-accent-400' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Referrals</h1>
        <p className="mt-1 text-sm text-ink-400">Share your code. Earn rewards when friends complete qualifying tasks.</p>
      </div>

      {error && <div className="rounded-xl bg-danger-500/10 p-4 text-sm text-danger-400">{error}</div>}

      {/* Referral link card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-glow-purple">
          <div className="flex items-center gap-3">
            <Gift className="h-8 w-8 text-accent-400" />
            <div>
              <h2 className="text-lg font-bold">Your Referral Code</h2>
              <p className="text-sm text-white/60">Share this with friends to start earning</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <code className="rounded-xl bg-white/10 px-4 py-2.5 text-lg font-bold tracking-wider backdrop-blur">{profile?.referral_code}</code>
            <button onClick={copyCode} className="rounded-xl bg-white/10 p-2.5 transition hover:bg-white/20" aria-label="Copy code">
              {copied ? <Check className="h-5 w-5 text-accent-400" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <div className="p-6">
          <label className="label">Your referral link</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={referralLink} className="input flex-1 text-sm" />
            <Button onClick={copyLink} variant="secondary">
              {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
            </Button>
          </div>
          <div className="mt-4 rounded-xl bg-ink-800/50 p-4">
            <p className="text-sm font-semibold text-ink-50">How qualified referrals work:</p>
            <ol className="mt-2 space-y-1.5 text-xs text-ink-400">
              <li>1. Friend registers using your code</li>
              <li>2. Friend completes an eligible task</li>
              <li>3. Task submission is approved by admin</li>
              <li>4. Referral qualifies — you earn a reward!</li>
            </ol>
            <p className="mt-2 text-xs text-ink-400">Signup alone does not generate a reward. Self-referrals are blocked.</p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <Card key={s.label} className="flex items-center gap-4 p-5">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-ink-400">{s.label}</p>
              <p className="text-xl font-bold text-white">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Referral history */}
      <Card className="p-5">
        <h2 className="font-bold text-white">Referral History</h2>
        {referrals.length === 0 ? (
          <EmptyState
            icon={<Share2 className="h-10 w-10" />}
            title="No referrals yet"
            description="Share your referral link with friends to start earning referral rewards."
          />
        ) : (
          <div className="mt-4 space-y-2">
            {referrals.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between rounded-xl border border-ink-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-600/15 text-brand-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{ref.referred?.name || 'Anonymous'}</p>
                    <p className="text-xs text-ink-400">
                      {ref.status === 'pending' ? 'Awaiting qualifying task' : `Qualified ${ref.qualified_at ? new Date(ref.qualified_at).toLocaleDateString() : ''}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {ref.status === 'qualified' && <span className="text-sm font-bold text-accent-400">{formatMoney(ref.reward_amount)}</span>}
                  <StatusBadge status={ref.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
