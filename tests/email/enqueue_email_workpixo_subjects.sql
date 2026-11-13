-- Aligns enqueue_email subjects with the WorkPixo brand used in the email bodies.
-- Additive: replaces the function body only. Signature, SECURITY DEFINER, search_path,
-- dedup behaviour and grants are unchanged.

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
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

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

  v_subject := CASE p_template
    WHEN 'welcome'                THEN 'Welcome to WorkPixo'
    WHEN 'withdrawal_requested'   THEN 'Withdrawal Request Received'
    WHEN 'withdrawal_approved'    THEN 'Withdrawal Approved'
    WHEN 'withdrawal_rejected'    THEN 'Withdrawal Request Rejected'
    WHEN 'withdrawal_paid'        THEN 'Withdrawal Paid'
    WHEN 'gift_card_fulfilled'    THEN 'Your Gift Card Is Ready'
    WHEN 'task_approved'          THEN 'Task Approved'
    WHEN 'task_rejected'          THEN 'Task Submission Rejected'
    WHEN 'support_reply'          THEN 'New Reply From WorkPixo Support'
    WHEN 'ticket_status_changed'  THEN 'Support Ticket Status Updated'
    WHEN 'account_suspended'      THEN 'Your WorkPixo Account Has Been Suspended'
  END;

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

REVOKE EXECUTE ON FUNCTION public.enqueue_email(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
