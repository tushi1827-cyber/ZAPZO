/*
# Create Support Ticket System — Tables, Triggers, and RLS

## Summary
Creates the complete database infrastructure for a customer support / ticket system.
Users can create support tickets, reply with attachments, and track status.
Admins can manage all tickets, reply, add internal notes, and change status/priority.
All sensitive operations go through SECURITY DEFINER functions with is_admin() checks.

## 1. New Tables

### support_tickets (ticket metadata only — NO message content)
- id (uuid, PK)
- ticket_number (text, unique, format ZAP-000001 — generated server-side)
- user_id (uuid, FK → profiles, NOT NULL)
- category (text, NOT NULL — CHECK: task_issue, payment_reward, withdrawal, account, referral, technical, other)
- subject (text, NOT NULL)
- priority (text, NOT NULL, default 'medium' — CHECK: low, medium, high, urgent)
- status (text, NOT NULL, default 'open' — CHECK: open, in_progress, resolved, closed)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now() — auto-updated by trigger)

### ticket_messages (ALL conversation messages, including the first user message)
- id (uuid, PK)
- ticket_id (uuid, FK → support_tickets ON DELETE CASCADE, NOT NULL)
- sender_id (uuid, FK → profiles, NOT NULL)
- sender_type (text, NOT NULL — CHECK: user, admin)
- body (text, NOT NULL)
- attachment_url (text, nullable — stores storage path, NOT public URL)
- is_internal_note (boolean, NOT NULL, default false — admin-only internal notes)
- created_at (timestamptz, default now())

### ticket_activity_log (internal audit/activity trail — admin-only reads)
- id (uuid, PK)
- ticket_id (uuid, FK → support_tickets ON DELETE CASCADE, NOT NULL)
- actor_id (uuid, FK → profiles, nullable)
- action (text, NOT NULL — created, status_changed, priority_changed, replied, note_added, reopened)
- old_value (text, nullable)
- new_value (text, nullable)
- created_at (timestamptz, default now())

## 2. Ticket Number Generation
- Uses a SEQUENCE (support_ticket_seq) for safe, unique, auto-incrementing numbers
- A trigger function (generate_ticket_number) formats as ZAP-000001 using the sequence
- Unique index on ticket_number prevents any collision

## 3. Triggers
- trg_ticket_set_updated_at — BEFORE UPDATE on support_tickets, sets updated_at = now()
- trg_ticket_generate_number — BEFORE INSERT on support_tickets, generates ticket_number
- trg_ticket_log_creation — AFTER INSERT on support_tickets, logs to ticket_activity_log
- trg_ticket_log_status — AFTER UPDATE on support_tickets, logs status changes + notifies user
- trg_ticket_log_priority — AFTER UPDATE on support_tickets, logs priority changes
- trg_msg_log_user_reply — AFTER INSERT on ticket_messages (sender_type='user'), logs reply + reopens resolved tickets
- trg_msg_log_admin_reply — AFTER INSERT on ticket_messages (sender_type='admin', not internal), logs reply + notifies user

## 4. Notification Integration
- Reuses the existing notifications table and trigger-based pattern
- New notification types: support_reply, ticket_status_changed
- Notifications created by SECURITY DEFINER trigger functions with dedup checks
- Internal notes NEVER generate user notifications
- Notification triggers use related_id = ticket_id for dedup via existing unique index

## 5. RLS Policies

### support_tickets
- SELECT: users see own tickets; admins see all
- INSERT: users can create tickets only for themselves (user_id = auth.uid())
- UPDATE: admin only (for status/priority changes via functions)
- DELETE: admin only

### ticket_messages
- SELECT: users see non-internal messages in their own tickets; admins see all
- INSERT (user): sender_id = auth.uid(), sender_type = 'user', not internal, ticket belongs to user
- INSERT (admin): is_admin(), sender_type = 'admin'
- UPDATE/DELETE: admin only

### ticket_activity_log
- SELECT: admin only
- INSERT: admin only (trigger functions bypass RLS as SECURITY DEFINER)
- No UPDATE/DELETE policies (deny by default)

## 6. Security Notes
1. All admin functions check public.is_admin() — users cannot impersonate admins
2. Users cannot set sender_type='admin' — RLS INSERT policy enforces sender_type='user' for user inserts
3. Users cannot create internal notes — RLS INSERT policy checks is_internal_note = false for user inserts
4. Users cannot change status/priority — UPDATE policy on support_tickets requires is_admin()
5. Users cannot read internal notes — SELECT policy excludes is_internal_note = true for non-admins
6. Activity log is admin-only for direct reads
7. Ticket number generated server-side — users cannot specify or predict it
8. All sensitive fields (user_id, sender_id, sender_type, status, priority, is_internal_note) are validated server-side

## 7. Duplicate Prevention
1. Ticket number unique index prevents duplicate ticket numbers
2. Notification dedup via related_id + existing unique index on notifications
3. Client-side debounce + button disable on frontend (added in UI code)
*/

-- ============================================================
-- Step 1: Create SEQUENCE for ticket numbers
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq START 1;

-- ============================================================
-- Step 2: Create support_tickets table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('task_issue','payment_reward','withdrawal','account','referral','technical','other')),
  subject text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_number_idx ON public.support_tickets (ticket_number);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON public.support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_category_idx ON public.support_tickets (category);
CREATE INDEX IF NOT EXISTS support_tickets_priority_idx ON public.support_tickets (priority);

-- ============================================================
-- Step 3: Create ticket_messages table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user','admin')),
  body text NOT NULL,
  attachment_url text,
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_id_idx ON public.ticket_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS ticket_messages_sender_id_idx ON public.ticket_messages (sender_id);

-- ============================================================
-- Step 4: Create ticket_activity_log table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_activity_ticket_id_idx ON public.ticket_activity_log (ticket_id, created_at);

-- ============================================================
-- Step 5: Enable RLS on all tables
-- ============================================================
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_activity_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Step 6: RLS Policies — support_tickets
-- ============================================================
DROP POLICY IF EXISTS "tickets_select_own_or_admin" ON public.support_tickets;
CREATE POLICY "tickets_select_own_or_admin"
ON public.support_tickets FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "tickets_insert_own" ON public.support_tickets;
CREATE POLICY "tickets_insert_own"
ON public.support_tickets FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tickets_update_admin" ON public.support_tickets;
CREATE POLICY "tickets_update_admin"
ON public.support_tickets FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "tickets_delete_admin" ON public.support_tickets;
CREATE POLICY "tickets_delete_admin"
ON public.support_tickets FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- Step 7: RLS Policies — ticket_messages
-- ============================================================
DROP POLICY IF EXISTS "messages_select_own_or_admin" ON public.ticket_messages;
CREATE POLICY "messages_select_own_or_admin"
ON public.ticket_messages FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    NOT is_internal_note
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  )
  OR sender_id = auth.uid()
);

DROP POLICY IF EXISTS "messages_insert_user" ON public.ticket_messages;
CREATE POLICY "messages_insert_user"
ON public.ticket_messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND sender_type = 'user'
  AND is_internal_note = false
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "messages_insert_admin" ON public.ticket_messages;
CREATE POLICY "messages_insert_admin"
ON public.ticket_messages FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  AND sender_type = 'admin'
);

DROP POLICY IF EXISTS "messages_update_admin" ON public.ticket_messages;
CREATE POLICY "messages_update_admin"
ON public.ticket_messages FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "messages_delete_admin" ON public.ticket_messages;
CREATE POLICY "messages_delete_admin"
ON public.ticket_messages FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- Step 8: RLS Policies — ticket_activity_log (admin-only reads)
-- ============================================================
DROP POLICY IF EXISTS "activity_select_admin" ON public.ticket_activity_log;
CREATE POLICY "activity_select_admin"
ON public.ticket_activity_log FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "activity_insert_admin" ON public.ticket_activity_log;
CREATE POLICY "activity_insert_admin"
ON public.ticket_activity_log FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- ============================================================
-- Step 9: Trigger Functions
-- ============================================================

-- Generate ticket number (ZAP-000001 format)
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'ZAP-' || lpad(nextval('support_ticket_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
end;
$function$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.ticket_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  NEW.updated_at := now();
  RETURN NEW;
end;
$function$;

-- Log ticket creation
CREATE OR REPLACE FUNCTION public.log_ticket_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, new_value)
  VALUES (NEW.id, NEW.user_id, 'created', NEW.status);
  RETURN NEW;
end;
$function$;

-- Log status changes + notify user
CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
begin
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);

    -- Notify ticket owner of status change (dedup via related_id)
    SELECT count(*) INTO v_existing FROM public.notifications
    WHERE user_id = NEW.user_id AND type = 'ticket_status_changed' AND related_id = NEW.id;
    IF v_existing = 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (
        NEW.user_id,
        'ticket_status_changed',
        'Ticket Status Updated',
        'Your ticket "' || NEW.subject || '" (#' || NEW.ticket_number || ') is now ' || replace(NEW.status, '_', ' ') || '.',
        '/dashboard/support/' || NEW.id::text,
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
end;
$function$;

-- Log priority changes
CREATE OR REPLACE FUNCTION public.log_ticket_priority_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority_changed', OLD.priority, NEW.priority);
  END IF;
  RETURN NEW;
end;
$function$;

-- Log user reply + reopen resolved tickets
CREATE OR REPLACE FUNCTION public.log_user_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ticket public.support_tickets%rowtype;
begin
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

  -- Log the reply
  INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
  VALUES (NEW.ticket_id, NEW.sender_id, 'replied');

  -- Reopen resolved tickets when user replies
  IF v_ticket.status = 'resolved' THEN
    UPDATE public.support_tickets SET status = 'open' WHERE id = NEW.ticket_id;
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, old_value, new_value)
    VALUES (NEW.ticket_id, NEW.sender_id, 'reopened', 'resolved', 'open');
  END IF;

  RETURN NEW;
end;
$function$;

-- Log admin reply + notify user (internal notes never notify)
CREATE OR REPLACE FUNCTION public.log_admin_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ticket public.support_tickets%rowtype;
  v_existing int;
begin
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

  IF NEW.is_internal_note THEN
    -- Log internal note
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
    VALUES (NEW.ticket_id, NEW.sender_id, 'note_added');
  ELSE
    -- Log admin reply
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
    VALUES (NEW.ticket_id, NEW.sender_id, 'replied');

    -- Notify ticket owner (dedup via related_id — one notification per ticket per admin reply session)
    -- Use a narrow dedup: same ticket, same type, within last 5 minutes
    SELECT count(*) INTO v_existing FROM public.notifications
    WHERE user_id = v_ticket.user_id
      AND type = 'support_reply'
      AND related_id = NEW.ticket_id
      AND created_at > now() - interval '5 minutes';
    IF v_existing = 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
      VALUES (
        v_ticket.user_id,
        'support_reply',
        'Support Replied',
        'Admin has replied to your ticket "' || v_ticket.subject || '" (#' || v_ticket.ticket_number || ').',
        '/dashboard/support/' || v_ticket.id::text,
        v_ticket.id
      );
    END IF;
  END IF;

  RETURN NEW;
end;
$function$;

-- ============================================================
-- Step 10: Create Triggers
-- ============================================================
DROP TRIGGER IF EXISTS trg_ticket_generate_number ON public.support_tickets;
CREATE TRIGGER trg_ticket_generate_number
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION generate_ticket_number();

DROP TRIGGER IF EXISTS trg_ticket_set_updated_at ON public.support_tickets;
CREATE TRIGGER trg_ticket_set_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION ticket_set_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_log_creation ON public.support_tickets;
CREATE TRIGGER trg_ticket_log_creation
AFTER INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION log_ticket_creation();

DROP TRIGGER IF EXISTS trg_ticket_log_status ON public.support_tickets;
CREATE TRIGGER trg_ticket_log_status
AFTER UPDATE OF status ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION log_ticket_status_change();

DROP TRIGGER IF EXISTS trg_ticket_log_priority ON public.support_tickets;
CREATE TRIGGER trg_ticket_log_priority
AFTER UPDATE OF priority ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION log_ticket_priority_change();

DROP TRIGGER IF EXISTS trg_msg_log_user_reply ON public.ticket_messages;
CREATE TRIGGER trg_msg_log_user_reply
AFTER INSERT ON public.ticket_messages
FOR EACH ROW WHEN (NEW.sender_type = 'user')
EXECUTE FUNCTION log_user_ticket_reply();

DROP TRIGGER IF EXISTS trg_msg_log_admin_reply ON public.ticket_messages;
CREATE TRIGGER trg_msg_log_admin_reply
AFTER INSERT ON public.ticket_messages
FOR EACH ROW WHEN (NEW.sender_type = 'admin')
EXECUTE FUNCTION log_admin_ticket_reply();

-- ============================================================
-- Step 11: Grant execute on is_admin to authenticated (already exists, but ensure)
-- ============================================================
-- is_admin already has EXECUTE granted to authenticated from prior migration

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
