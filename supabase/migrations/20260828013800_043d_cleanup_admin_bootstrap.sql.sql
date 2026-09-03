/*
# Clean up and start fresh — delete corrupted admin user
*/

DELETE FROM auth.users WHERE email = 'admin-wallet-qa@testzapzo.com';
DELETE FROM public.profiles WHERE name = 'Admin Wallet QA';

-- Drop temp functions
DROP FUNCTION IF EXISTS public.temp_create_admin_user(text, text);
DROP FUNCTION IF EXISTS public.temp_set_admin_flag(text);
