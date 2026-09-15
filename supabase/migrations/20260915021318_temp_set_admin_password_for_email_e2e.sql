-- Save original password hash, then set a temporary known password for E2E email test
CREATE TABLE IF NOT EXISTS public._temp_admin_pw_backup (
  id int primary key default 1,
  original_hash text,
  created_at timestamptz default now()
);

ALTER TABLE public._temp_admin_pw_backup ENABLE ROW LEVEL SECURITY;

INSERT INTO public._temp_admin_pw_backup (id, original_hash)
SELECT 1, encrypted_password FROM auth.users WHERE id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO UPDATE SET original_hash = excluded.original_hash;

-- Set temporary known password
UPDATE auth.users
SET encrypted_password = crypt('ZapzoE2ETest!2026#Tmp', gen_salt('bf')),
    updated_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000000001';
