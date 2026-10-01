/*
# Email Queue Infrastructure: enqueue_email helper function

## Purpose
Adds a reusable server-side helper that any existing SECURITY DEFINER
trigger or RPC can call to enqueue a transactional email.  The helper
resolves the recipient's email address from auth.users (which the browser
cannot access), validates the template name, resolves the subject line
to match the send-email Edge Function exactly, and inserts a pending row
into email_queue.

## Design
- SECURITY DEFINER + search_path = public so trigger functions can call it
  regardless of the caller's role.
- No EXECUTE grant to anon or authenticated — only the owner (superuser)
  and other SECURITY DEFINER functions (which bypass RLS) can invoke it.
  This prevents any authenticated user from directly enqueuing arbitrary
  emails via the PostgREST API.
- dedup_key + partial unique index prevents duplicate emails for the same
  business event.  The helper uses INSERT ... ON CONFLICT targeting only
  the partial dedup index, so unrelated unique violations propagate.
- Does NOT send email — only enqueues.  The send-email Edge Function (or
  a future queue-drainer) reads pending rows and delivers them via Resend.

## New objects
- Column:      public.email_queue.dedup_key text (nullable)
- Index:       idx_email_queue_dedup (UNIQUE, partial WHERE dedup_key IS NOT NULL)
- Function:    public.enqueue_email(uuid, text, jsonb, text) RETURNS uuid
*/

-- ============================================================
-- 1. Add dedup_key column to email_queue (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'email_queue'
      AND column_name  = 'dedup_key'
  ) THEN
    ALTER TABLE public.email_queue ADD COLUMN dedup_key text;
  END IF;
END $$;

-- ============================================================
-- 2. Unique partial index on dedup_key (idempotent)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedup
  ON public.email_queue (dedup_key)
  WHERE dedup_key IS NOT NULL;

-- ============================================================
-- 3. enqueue_email helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_email(
  p_user_id   uuid,
  p_template  text,
  p_payload   jsonb  DEFAULT '{}'::jsonb,
  p_dedup_key text   DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email       text;
  v_subject     text;
  v_queue_id    uuid;
  v_valid       boolean := false;
BEGIN
  -- Resolve recipient email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- Validate template name against the 11 known templates
  v_valid := p_template IN (
    'welcome',
    'withdrawal_requested',
    'withdrawal_approved',
    'withdrawal_rejected',
    'withdrawal_paid',
    'gift_card_fulfilled',
    'task_approved',
    'task_rejected',
    'support_reply',
    'ticket_status_changed',
    'account_suspended'
  );
  IF NOT v_valid THEN
    RETURN NULL;
  END IF;

  -- Resolve subject to match the send-email Edge Function exactly
  v_subject := CASE p_template
    WHEN 'welcome'                THEN 'Welcome to ZAPZO'
    WHEN 'withdrawal_requested'   THEN 'Withdrawal Request Received'
    WHEN 'withdrawal_approved'    THEN 'Withdrawal Approved'
    WHEN 'withdrawal_rejected'    THEN 'Withdrawal Request Rejected'
    WHEN 'withdrawal_paid'        THEN 'Withdrawal Paid'
    WHEN 'gift_card_fulfilled'    THEN 'Your Gift Card Is Ready'
    WHEN 'task_approved'          THEN 'Task Approved'
    WHEN 'task_rejected'          THEN 'Task Submission Rejected'
    WHEN 'support_reply'          THEN 'New Reply From ZAPZO Support'
    WHEN 'ticket_status_changed'  THEN 'Support Ticket Status Updated'
    WHEN 'account_suspended'      THEN 'Your ZAPZO Account Has Been Suspended'
  END;

  -- Enqueue with dedup protection.
  --
  -- ON CONFLICT targets ONLY the partial unique index idx_email_queue_dedup
  -- (dedup_key WHERE dedup_key IS NOT NULL).  This means:
  --   - When p_dedup_key is NULL: the partial index predicate does not
  --     match, ON CONFLICT is inert, and the row inserts normally.
  --   - When p_dedup_key collides with an existing row: DO NOTHING fires,
  --     RETURNING yields no rows, v_queue_id stays NULL (caller sees skip).
  --   - Any OTHER unique violation on email_queue propagates as a real
  --     error — it is NOT silently swallowed.
  INSERT INTO public.email_queue (
    recipient_email,
    template_name,
    subject,
    payload,
    status,
    dedup_key
  ) VALUES (
    v_email,
    p_template,
    v_subject,
    p_payload,
    'pending',
    p_dedup_key
  )
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;

-- ============================================================
-- 4. Revoke all direct access to enqueue_email
-- ============================================================
-- SECURITY DEFINER functions are callable by anyone with EXECUTE.
-- Revoke from anon and authenticated so only the database owner
-- (and other SECURITY DEFINER functions calling it internally)
-- can invoke it.  Trigger functions run as the table owner and
-- bypass this restriction, which is the intended usage.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(uuid, text, jsonb, text) FROM anon, authenticated;

-- ============================================================
-- 5. Force PostgREST schema cache reload
-- ============================================================
NOTIFY pgrst, 'reload schema';
