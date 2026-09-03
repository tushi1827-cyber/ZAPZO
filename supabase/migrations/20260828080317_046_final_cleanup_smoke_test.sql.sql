/*
# Final cleanup: remove all smoke test data and temp functions

1. Drop temp_set_admin_flag function
2. Delete all test users' data (wallet_transactions, withdrawals, task_submissions, notifications, referrals, audit_logs, profiles)
3. Delete test auth users
4. Clean up orphaned audit logs
*/

-- Drop temp function
DROP FUNCTION IF EXISTS public.temp_set_admin_flag(uuid);

-- Delete test data for all @testzapzo.com users (except the original admin)
DO $$
DECLARE
  v_uid uuid;
BEGIN
  FOR v_uid IN
    SELECT id FROM auth.users 
    WHERE email LIKE '%@testzapzo.com'
    AND id <> 'a0000000-0000-0000-0000-000000000001'
  LOOP
    DELETE FROM public.wallet_transactions WHERE user_id = v_uid;
    DELETE FROM public.withdrawals WHERE user_id = v_uid;
    DELETE FROM public.task_submissions WHERE user_id = v_uid;
    DELETE FROM public.notifications WHERE user_id = v_uid;
    DELETE FROM public.referrals WHERE referrer_id = v_uid OR referred_id = v_uid;
    DELETE FROM public.audit_logs WHERE actor_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uid;
    DELETE FROM auth.users WHERE id = v_uid;
  END LOOP;
END $$;

-- Clean up orphaned audit logs (referencing deleted withdrawals)
DELETE FROM public.audit_logs 
WHERE target_type = 'withdrawal' 
  AND target_id NOT IN (SELECT id FROM public.withdrawals);
