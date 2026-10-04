/*
# Admin Roles & Permissions System

1. Purpose
   Replaces the single-level admin model with a multi-role permission system
   while maintaining full backward compatibility with the existing is_admin()
   function and app_metadata.is_admin=true super admin.

2. New Table
   - `admin_roles`
     - id (uuid, pk, default gen_random_uuid())
     - user_id (uuid, not null, references profiles(id) ON DELETE CASCADE)
     - role (text, not null, CHECK in super_admin/moderator/support/finance)
     - created_at (timestamptz, default now())
     - created_by (uuid, nullable, references profiles(id) ON DELETE SET NULL)
     - Unique constraint on (user_id, role)

3. Helper Functions (SECURITY DEFINER, search_path=public)
   - is_super_admin() → boolean
   - has_admin_role(p_role text) → boolean
   - has_admin_permission(p_permission text) → boolean
   - get_admin_permissions() → jsonb (array of permission strings)

4. RPC Functions (SECURITY DEFINER, search_path=public)
   - assign_admin_role(p_user_id uuid, p_role text) → uuid
   - remove_admin_role(p_user_id uuid, p_role text) → void
   - get_admin_roles_list() → jsonb

5. Security (RLS)
   - SELECT: own rows or super_admin. No direct INSERT/UPDATE/DELETE.
   - All mutations go through RPC functions that check is_super_admin().

6. Permission Matrix
   super_admin: all permissions
   moderator: users, tasks, submissions, feedback, fraud
   support: support, feedback
   finance: withdrawals, transactions

7. Backward Compatibility
   - is_admin() NOT modified. Existing app_metadata.is_admin=true stays super admin.
   - is_super_admin() checks app_metadata first, then admin_roles table.

8. Audit Logging
   - assign/remove both insert into audit_logs with actor, action, target, details.

9. Notes
   - Purely additive. No existing objects modified.
*/

-- 1. Table
CREATE TABLE IF NOT EXISTS public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin', 'moderator', 'support', 'finance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT admin_roles_user_role_key UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_admin_roles_user_id ON public.admin_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_roles_role ON public.admin_roles(role);

-- 2. RLS
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_admin_roles" ON public.admin_roles;
CREATE POLICY "select_own_admin_roles"
ON public.admin_roles FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
  )
);

-- No INSERT/UPDATE/DELETE policies — deny by default.

-- 3. Helper Functions

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  ) OR EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;

CREATE OR REPLACE FUNCTION public.has_admin_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid() AND ar.role = p_role
  );
$function$;

GRANT EXECUTE ON FUNCTION public.has_admin_role(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_admin_role(text) FROM anon;

CREATE OR REPLACE FUNCTION public.has_admin_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_super boolean;
  v_user_roles text[];
  v_allowed_roles text[];
  v_has_match boolean;
begin
  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super THEN
    RETURN true;
  END IF;

  SELECT array_agg(role) INTO v_user_roles
  FROM public.admin_roles
  WHERE user_id = auth.uid();

  IF v_user_roles IS NULL THEN
    RETURN false;
  END IF;

  v_allowed_roles := CASE p_permission
    WHEN 'users' THEN ARRAY['moderator']::text[]
    WHEN 'tasks' THEN ARRAY['moderator']::text[]
    WHEN 'submissions' THEN ARRAY['moderator']::text[]
    WHEN 'feedback' THEN ARRAY['moderator', 'support']::text[]
    WHEN 'fraud' THEN ARRAY['moderator']::text[]
    WHEN 'support' THEN ARRAY['support']::text[]
    WHEN 'withdrawals' THEN ARRAY['finance']::text[]
    WHEN 'transactions' THEN ARRAY['finance']::text[]
    WHEN 'referrals' THEN ARRAY[]::text[]
    WHEN 'settings' THEN ARRAY[]::text[]
    WHEN 'audit_logs' THEN ARRAY[]::text[]
    WHEN 'homepage' THEN ARRAY[]::text[]
    WHEN 'email_test' THEN ARRAY[]::text[]
    WHEN 'roles' THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;

  SELECT EXISTS (
    SELECT 1 FROM unnest(v_user_roles) AS ur
    WHERE ur = ANY(v_allowed_roles)
  ) INTO v_has_match;

  RETURN v_has_match;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.has_admin_permission(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_admin_permission(text) FROM anon;

CREATE OR REPLACE FUNCTION public.get_admin_permissions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_super boolean;
  v_user_roles text[];
  v_permissions text[] := ARRAY[]::text[];
  r text;
  v_result jsonb;
begin
  SELECT public.is_super_admin() INTO v_is_super;

  IF v_is_super THEN
    RETURN jsonb_build_array(
      'users', 'tasks', 'submissions', 'withdrawals', 'transactions',
      'referrals', 'settings', 'audit_logs', 'fraud', 'support',
      'feedback', 'homepage', 'email_test', 'roles'
    );
  END IF;

  SELECT array_agg(role) INTO v_user_roles
  FROM public.admin_roles
  WHERE user_id = auth.uid();

  IF v_user_roles IS NULL THEN
    RETURN jsonb_build_array();
  END IF;

  FOREACH r IN ARRAY v_user_roles LOOP
    IF r = 'moderator' THEN
      v_permissions := array_append(v_permissions, 'users');
      v_permissions := array_append(v_permissions, 'tasks');
      v_permissions := array_append(v_permissions, 'submissions');
      v_permissions := array_append(v_permissions, 'feedback');
      v_permissions := array_append(v_permissions, 'fraud');
    ELSIF r = 'support' THEN
      v_permissions := array_append(v_permissions, 'support');
      v_permissions := array_append(v_permissions, 'feedback');
    ELSIF r = 'finance' THEN
      v_permissions := array_append(v_permissions, 'withdrawals');
      v_permissions := array_append(v_permissions, 'transactions');
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(DISTINCT x), jsonb_build_array())
  INTO v_result
  FROM unnest(v_permissions) AS x;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_permissions() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_permissions() FROM anon;

-- 4. RPC Functions

CREATE OR REPLACE FUNCTION public.assign_admin_role(p_user_id uuid, p_role text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_actor_id uuid := auth.uid();
  v_target_name text;
begin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can assign roles';
  END IF;

  IF p_role NOT IN ('super_admin', 'moderator', 'support', 'finance') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_user_id = v_actor_id AND p_role = 'super_admin' THEN
    RAISE EXCEPTION 'You already have super admin access';
  END IF;

  SELECT name INTO v_target_name FROM public.profiles WHERE id = p_user_id;
  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  INSERT INTO public.admin_roles (user_id, role, created_by)
  VALUES (p_user_id, p_role, v_actor_id)
  ON CONFLICT (user_id, role) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.admin_roles WHERE user_id = p_user_id AND role = p_role;
  END IF;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (
      v_actor_id,
      'admin_role_assigned',
      'admin_roles',
      v_id,
      jsonb_build_object(
        'target_user_id', p_user_id,
        'target_user_name', v_target_name,
        'role', p_role
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_admin_role(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_admin_role(uuid, text) FROM anon;

CREATE OR REPLACE FUNCTION public.remove_admin_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_target_name text;
  v_existing_id uuid;
  v_super_admin_count int;
  v_target_is_meta_admin boolean;
begin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can remove roles';
  END IF;

  IF p_role NOT IN ('super_admin', 'moderator', 'support', 'finance') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_role = 'super_admin' AND p_user_id = v_actor_id THEN
    SELECT COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
      false
    ) INTO v_target_is_meta_admin;
    IF NOT v_target_is_meta_admin THEN
      SELECT count(*) INTO v_super_admin_count
      FROM public.admin_roles
      WHERE role = 'super_admin' AND user_id != p_user_id;
      IF v_super_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last super admin role';
      END IF;
    END IF;
  END IF;

  SELECT name INTO v_target_name FROM public.profiles WHERE id = p_user_id;

  SELECT id INTO v_existing_id FROM public.admin_roles WHERE user_id = p_user_id AND role = p_role;
  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'Role assignment not found';
  END IF;

  DELETE FROM public.admin_roles WHERE user_id = p_user_id AND role = p_role;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (
      v_actor_id,
      'admin_role_removed',
      'admin_roles',
      v_existing_id,
      jsonb_build_object(
        'target_user_id', p_user_id,
        'target_user_name', v_target_name,
        'role', p_role
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_admin_role(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_admin_role(uuid, text) FROM anon;

CREATE OR REPLACE FUNCTION public.get_admin_roles_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can view the full role list';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ar.id,
    'user_id', ar.user_id,
    'role', ar.role,
    'created_at', ar.created_at,
    'created_by', ar.created_by,
    'user_name', p.name,
    'user_referral_code', p.referral_code,
    'assigner_name', p2.name
  ) ORDER BY ar.created_at DESC), jsonb_build_array())
  INTO v_result
  FROM public.admin_roles ar
  LEFT JOIN public.profiles p ON p.id = ar.user_id
  LEFT JOIN public.profiles p2 ON p2.id = ar.created_by;

  RETURN v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_roles_list() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_roles_list() FROM anon;
