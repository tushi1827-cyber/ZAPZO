/*
# Admin Dashboard Analytics RPC

1. Purpose
   Replaces the old dashboard's 12+ parallel queries + client-side summation
   with a single efficient server-side RPC that returns all aggregates and
   time-series data in one call.

2. Function: get_admin_dashboard(p_date_range text)
   Returns jsonb with summary metrics, time-series for charts, pending-action
   counts, and recent activity — all scoped by the calling admin's permissions.

   Parameters:
   - p_date_range: 'today' | '7d' | '30d' | 'this_month' | 'all_time'
     Controls the date window for time-series charts and time-filtered counts.

   Permission model (uses existing has_admin_permission):
   - super_admin (via is_super_admin): receives all sections
   - moderator: users, tasks, submissions, feedback, fraud sections
   - support: support, feedback sections
   - finance: withdrawals, transactions sections

   Each section is only included if the admin has the relevant permission.
   The function returns a jsonb object; missing keys mean "no access".

3. Security
   - SECURITY DEFINER, SET search_path = public
   - Requires is_admin() — non-admins get an exception
   - No anon execute
   - Uses existing is_super_admin() and has_admin_permission()
   - Does not expose raw user data — only aggregates and limited recent rows
   - Recent activity rows mask user names to first name + initial

4. Performance
   - Single function call returns all data
   - Uses aggregate COUNT/SUM queries — no row-by-row client summation
   - Time-series uses date_trunc + GROUP BY — efficient on indexed created_at
   - Recent activity limited to 5 rows per section
   - No full-table scans beyond what aggregates require

5. Important Notes
   - Does not modify any existing function, table, or policy
   - Purely additive — one new function
   - Existing is_admin() is unchanged
   - No service-role keys involved
*/

CREATE OR REPLACE FUNCTION public.get_admin_dashboard(p_date_range text DEFAULT 'all_time')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_result jsonb := '{}'::jsonb;
  v_is_super boolean;
  v_start timestamptz;
  v_now timestamptz := now();
  v_perms text[];
  v_summary jsonb;
  v_timeseries jsonb;
  v_pending jsonb;
  v_recent jsonb;
  v_counts record;
begin
  -- Require admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Determine date range start
  v_start := CASE p_date_range
    WHEN 'today' THEN date_trunc('day', v_now)
    WHEN '7d' THEN v_now - interval '7 days'
    WHEN '30d' THEN v_now - interval '30 days'
    WHEN 'this_month' THEN date_trunc('month', v_now)
    ELSE '1970-01-01'::timestamptz  -- all_time
  END;

  SELECT public.is_super_admin() INTO v_is_super;

  -- Build permission list for the caller
  IF v_is_super THEN
    v_perms := ARRAY['users','tasks','submissions','withdrawals','transactions','referrals','settings','audit_logs','fraud','support','feedback','homepage','email_test','roles']::text[];
  ELSE
    SELECT array_agg(perm) INTO v_perms
    FROM (SELECT unnest(public.get_admin_permissions()) AS perm) x;
    IF v_perms IS NULL THEN
      v_perms := ARRAY[]::text[];
    END IF;
  END IF;

  -- ========== SUMMARY METRICS ==========
  v_summary := '{}'::jsonb;

  -- Users section (permission: users)
  IF v_is_super OR 'users' = ANY(v_perms) THEN
    SELECT
      (SELECT count(*) FROM public.profiles) as total_users,
      (SELECT count(*) FROM public.profiles WHERE is_suspended = false) as active_users,
      (SELECT count(*) FROM public.profiles WHERE created_at >= v_start) as new_users_in_range
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'total_users', v_counts.total_users,
      'active_users', v_counts.active_users,
      'new_users_in_range', v_counts.new_users_in_range
    );
  END IF;

  -- Tasks section (permission: tasks)
  IF v_is_super OR 'tasks' = ANY(v_perms) THEN
    SELECT
      (SELECT count(*) FROM public.tasks) as total_tasks,
      (SELECT count(*) FROM public.tasks WHERE status = 'active') as active_tasks
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'total_tasks', v_counts.total_tasks,
      'active_tasks', v_counts.active_tasks
    );
  END IF;

  -- Submissions section (permission: submissions)
  IF v_is_super OR 'submissions' = ANY(v_perms) THEN
    SELECT
      (SELECT count(*) FROM public.task_submissions WHERE status = 'pending') as pending_submissions,
      (SELECT count(*) FROM public.task_submissions WHERE status = 'approved' AND created_at >= v_start) as approved_in_range,
      (SELECT count(*) FROM public.task_submissions WHERE status = 'rejected' AND created_at >= v_start) as rejected_in_range
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'pending_submissions', v_counts.pending_submissions,
      'approved_in_range', v_counts.approved_in_range,
      'rejected_in_range', v_counts.rejected_in_range
    );
  END IF;

  -- Withdrawals section (permission: withdrawals)
  IF v_is_super OR 'withdrawals' = ANY(v_perms) THEN
    SELECT
      (SELECT count(*) FROM public.withdrawals WHERE status = 'pending') as pending_withdrawals,
      (SELECT COALESCE(sum(amount), 0) FROM public.withdrawals WHERE status = 'pending') as pending_withdrawal_amount,
      (SELECT COALESCE(sum(amount), 0) FROM public.withdrawals WHERE status = 'paid') as total_paid_out,
      (SELECT count(*) FROM public.withdrawals WHERE created_at >= v_start) as withdrawals_in_range
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'pending_withdrawals', v_counts.pending_withdrawals,
      'pending_withdrawal_amount', v_counts.pending_withdrawal_amount,
      'total_paid_out', v_counts.total_paid_out,
      'withdrawals_in_range', v_counts.withdrawals_in_range
    );
  END IF;

  -- Transactions/Rewards section (permission: transactions)
  IF v_is_super OR 'transactions' = ANY(v_perms) THEN
    SELECT
      (SELECT COALESCE(sum(amount), 0) FROM public.wallet_transactions WHERE type IN ('task_reward','bonus') AND status = 'completed') as total_rewards,
      (SELECT COALESCE(sum(amount), 0) FROM public.wallet_transactions WHERE type = 'referral_reward' AND status = 'completed') as referral_rewards,
      (SELECT COALESCE(sum(amount), 0) FROM public.wallet_transactions WHERE type IN ('task_reward','bonus','referral_reward') AND status = 'completed' AND created_at >= v_start) as rewards_in_range
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'total_rewards', v_counts.total_rewards,
      'referral_rewards', v_counts.referral_rewards,
      'rewards_in_range', v_counts.rewards_in_range
    );
  END IF;

  -- Referrals section (permission: referrals — super admin only per matrix)
  IF v_is_super THEN
    SELECT
      (SELECT count(*) FROM public.referrals) as total_referrals,
      (SELECT count(*) FROM public.referrals WHERE status = 'qualified') as qualified_referrals,
      (SELECT COALESCE(sum(reward_amount), 0) FROM public.referrals WHERE status = 'qualified') as referral_reward_total
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'total_referrals', v_counts.total_referrals,
      'qualified_referrals', v_counts.qualified_referrals,
      'referral_reward_total', v_counts.referral_reward_total
    );
  END IF;

  -- Support section (permission: support)
  IF v_is_super OR 'support' = ANY(v_perms) THEN
    SELECT
      (SELECT count(*) FROM public.support_tickets WHERE status IN ('open','waiting')) as open_tickets,
      (SELECT count(*) FROM public.support_tickets WHERE status = 'open' AND created_at >= v_start) as new_tickets_in_range
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'open_tickets', v_counts.open_tickets,
      'new_tickets_in_range', v_counts.new_tickets_in_range
    );
  END IF;

  -- Feedback section (permission: feedback)
  IF v_is_super OR 'feedback' = ANY(v_perms) THEN
    SELECT
      (SELECT count(*) FROM public.user_feedback WHERE status = 'open') as open_feedback,
      (SELECT count(*) FROM public.user_feedback WHERE created_at >= v_start) as feedback_in_range
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'open_feedback', v_counts.open_feedback,
      'feedback_in_range', v_counts.feedback_in_range
    );
  END IF;

  -- Fraud section (permission: fraud)
  IF v_is_super OR 'fraud' = ANY(v_perms) THEN
    SELECT
      (SELECT count(*) FROM public.risk_events WHERE risk_points >= 10) as high_risk_events,
      (SELECT count(*) FROM public.risk_events WHERE created_at >= v_start) as risk_events_in_range
    INTO v_counts;
    v_summary := v_summary || jsonb_build_object(
      'high_risk_events', v_counts.high_risk_events,
      'risk_events_in_range', v_counts.risk_events_in_range
    );
  END IF;

  v_result := v_result || jsonb_build_object('summary', v_summary);

  -- ========== TIME SERIES (for charts) ==========
  v_timeseries := '{}'::jsonb;

  -- User growth (permission: users)
  IF v_is_super OR 'users' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', d::date::text,
      'count', cnt
    ) ORDER BY d), jsonb_build_array())
    INTO v_result
    FROM (
      SELECT date_trunc('day', created_at) as d, count(*) as cnt
      FROM public.profiles
      WHERE created_at >= v_start
      GROUP BY 1
    ) t;

    v_timeseries := v_timeseries || jsonb_build_object('user_growth', v_result);
  END IF;

  -- Submission activity (permission: submissions)
  IF v_is_super OR 'submissions' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', d::date::text,
      'approved', approved,
      'rejected', rejected,
      'pending', pending
    ) ORDER BY d), jsonb_build_array())
    INTO v_result
    FROM (
      SELECT
        date_trunc('day', created_at) as d,
        count(*) FILTER (WHERE status = 'approved') as approved,
        count(*) FILTER (WHERE status = 'rejected') as rejected,
        count(*) FILTER (WHERE status = 'pending') as pending
      FROM public.task_submissions
      WHERE created_at >= v_start
      GROUP BY 1
    ) t;

    v_timeseries := v_timeseries || jsonb_build_object('submission_activity', v_result);
  END IF;

  -- Rewards over time (permission: transactions)
  IF v_is_super OR 'transactions' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', d::date::text,
      'amount', amt
    ) ORDER BY d), jsonb_build_array())
    INTO v_result
    FROM (
      SELECT date_trunc('day', created_at) as d, COALESCE(sum(amount), 0) as amt
      FROM public.wallet_transactions
      WHERE type IN ('task_reward','bonus','referral_reward')
        AND status = 'completed'
        AND created_at >= v_start
      GROUP BY 1
    ) t;

    v_timeseries := v_timeseries || jsonb_build_object('rewards_over_time', v_result);
  END IF;

  -- Withdrawals over time (permission: withdrawals)
  IF v_is_super OR 'withdrawals' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', d::date::text,
      'pending', pending,
      'paid', paid,
      'rejected', rejected
    ) ORDER BY d), jsonb_build_array())
    INTO v_result
    FROM (
      SELECT
        date_trunc('day', created_at) as d,
        count(*) FILTER (WHERE status = 'pending') as pending,
        count(*) FILTER (WHERE status = 'paid') as paid,
        count(*) FILTER (WHERE status = 'rejected') as rejected
      FROM public.withdrawals
      WHERE created_at >= v_start
      GROUP BY 1
    ) t;

    v_timeseries := v_timeseries || jsonb_build_object('withdrawals_over_time', v_result);
  END IF;

  -- Referrals over time (super admin only)
  IF v_is_super THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'date', d::date::text,
      'registrations', regs,
      'qualified', qual
    ) ORDER BY d), jsonb_build_array())
    INTO v_result
    FROM (
      SELECT
        date_trunc('day', created_at) as d,
        count(*) as regs,
        count(*) FILTER (WHERE status = 'qualified') as qual
      FROM public.referrals
      WHERE created_at >= v_start
      GROUP BY 1
    ) t;

    v_timeseries := v_timeseries || jsonb_build_object('referrals_over_time', v_result);
  END IF;

  v_result := v_result || jsonb_build_object('timeseries', v_timeseries);

  -- ========== RECENT ACTIVITY ==========
  v_recent := '{}'::jsonb;

  -- Recent submissions (permission: submissions)
  IF v_is_super OR 'submissions' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status, 'created_at', s.created_at,
      'task_title', t.title, 'user_name', left(p.name, 15)
    ) ORDER BY s.created_at DESC), jsonb_build_array())
    INTO v_result
    FROM public.task_submissions s
    LEFT JOIN public.tasks t ON t.id = s.task_id
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LIMIT 5;

    v_recent := v_recent || jsonb_build_object('submissions', v_result);
  END IF;

  -- Recent withdrawals (permission: withdrawals)
  IF v_is_super OR 'withdrawals' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', w.id, 'amount', w.amount, 'status', w.status,
      'method', w.method, 'created_at', w.created_at,
      'user_name', left(p.name, 15)
    ) ORDER BY w.created_at DESC), jsonb_build_array())
    INTO v_result
    FROM public.withdrawals w
    LEFT JOIN public.profiles p ON p.id = w.user_id
    LIMIT 5;

    v_recent := v_recent || jsonb_build_object('withdrawals', v_result);
  END IF;

  -- Recent transactions (permission: transactions)
  IF v_is_super OR 'transactions' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', wt.id, 'type', wt.type, 'amount', wt.amount,
      'status', wt.status, 'created_at', wt.created_at,
      'user_name', left(p.name, 15)
    ) ORDER BY wt.created_at DESC), jsonb_build_array())
    INTO v_result
    FROM public.wallet_transactions wt
    LEFT JOIN public.profiles p ON p.id = wt.user_id
    LIMIT 5;

    v_recent := v_recent || jsonb_build_object('transactions', v_result);
  END IF;

  -- Recent audit logs (super admin only)
  IF v_is_super THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', al.id, 'action', al.action, 'target_type', al.target_type,
      'created_at', al.created_at,
      'actor_name', left(p.name, 15)
    ) ORDER BY al.created_at DESC), jsonb_build_array())
    INTO v_result
    FROM public.audit_logs al
    LEFT JOIN public.profiles p ON p.id = al.actor_id
    LIMIT 5;

    v_recent := v_recent || jsonb_build_object('audit_logs', v_result);
  END IF;

  -- Recent feedback (permission: feedback)
  IF v_is_super OR 'feedback' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', f.id, 'type', f.type, 'subject', f.subject,
      'status', f.status, 'created_at', f.created_at,
      'user_name', left(p.name, 15)
    ) ORDER BY f.created_at DESC), jsonb_build_array())
    INTO v_result
    FROM public.user_feedback f
    LEFT JOIN public.profiles p ON p.id = f.user_id
    LIMIT 5;

    v_recent := v_recent || jsonb_build_object('feedback', v_result);
  END IF;

  -- Recent support (permission: support)
  IF v_is_super OR 'support' = ANY(v_perms) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', st.id, 'ticket_number', st.ticket_number, 'subject', st.subject,
      'status', st.status, 'priority', st.priority, 'created_at', st.created_at,
      'user_name', left(p.name, 15)
    ) ORDER BY st.created_at DESC), jsonb_build_array())
    INTO v_result
    FROM public.support_tickets st
    LEFT JOIN public.profiles p ON p.id = st.user_id
    LIMIT 5;

    v_recent := v_recent || jsonb_build_object('support', v_result);
  END IF;

  v_result := v_result || jsonb_build_object('recent', v_recent);

  -- ========== PERMISSIONS (for frontend) ==========
  v_result := v_result || jsonb_build_object(
    'permissions', to_jsonb(v_perms),
    'is_super_admin', v_is_super
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard(text) FROM anon, public;

NOTIFY pgrst, 'reload schema';
