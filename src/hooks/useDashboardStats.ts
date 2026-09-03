import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { DashboardStats } from '@/types';

export function useDashboardStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data: balance, error: balErr } = await supabase.rpc('get_user_balance');
      if (balErr) throw balErr;

      const { data: txns } = await supabase
        .from('wallet_transactions')
        .select('type, amount, status')
        .eq('user_id', user.id);

      const completed = (txns || []).filter((t) => t.status === 'completed');
      const totalEarned = completed
        .filter((t) => ['task_reward', 'referral_reward', 'bonus'].includes(t.type))
        .reduce((s, t) => s + Number(t.amount), 0);
      const referralEarnings = completed
        .filter((t) => t.type === 'referral_reward')
        .reduce((s, t) => s + Number(t.amount), 0);
      const pendingRewards = (txns || [])
        .filter((t) => t.status === 'pending' && t.type === 'withdrawal')
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

      const { count: tasksCompleted } = await supabase
        .from('task_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'approved');

      const { count: qualifiedReferrals } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', user.id)
        .eq('status', 'qualified');

      const { data: wdTxns } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'withdrawal')
        .eq('status', 'completed');

      const totalWithdrawals = (wdTxns || []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

      setStats({
        availableBalance: Number(balance) || 0,
        pendingRewards,
        totalEarned,
        referralEarnings,
        tasksCompleted: tasksCompleted || 0,
        qualifiedReferrals: qualifiedReferrals || 0,
        totalWithdrawals,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { stats, loading, error, refetch: fetch };
}
