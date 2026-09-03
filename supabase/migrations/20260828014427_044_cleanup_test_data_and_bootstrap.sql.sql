/*
# Clean up temporary test data and admin bootstrap

Removes:
1. The temp_set_admin_flag function
2. The temp admin user (admin-wallet-qa@testzapzo.com) from auth.users
3. The temp admin profile from public.profiles
4. All test wallet transactions, withdrawals, task submissions, notifications, and referrals for test users
5. The test auth users themselves

This preserves all real data and RLS policies.
*/

-- Drop temp functions
DROP FUNCTION IF EXISTS public.temp_set_admin_flag(uuid);
DROP FUNCTION IF EXISTS public.temp_create_admin_user(text, text);

-- Delete the admin test user's data
DELETE FROM public.wallet_transactions WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com'
);
DELETE FROM public.withdrawals WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com'
);
DELETE FROM public.notifications WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com'
);
DELETE FROM public.profiles WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com'
);
DELETE FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com';

-- Delete all test users created by e2e tests (emails matching pattern *@testzapzo.com)
-- but preserve the original admin user a0000000-0000-0000-0000-000000000001
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

-- Also clean up audit logs that reference deleted test withdrawals
DELETE FROM public.audit_logs 
WHERE target_type = 'withdrawal' 
  AND target_id NOT IN (SELECT id FROM public.withdrawals);
