-- Add automatic acknowledgement message to create_support_ticket()
-- When a new ticket is created, insert a system-generated "Support" message
-- so the user sees an immediate acknowledgement in the conversation.
--
-- Design decisions:
-- - sender_type = 'admin' so the message appears on the "Support" side in the UI
-- - sender_id = v_user_id (the ticket creator's UUID) since there is no dedicated system account;
--   SECURITY DEFINER bypasses RLS so the insert succeeds regardless of the
--   messages_insert_admin policy (which requires is_admin()).
-- - is_internal_note = false so the user can see it
-- - The trg_msg_log_admin_reply trigger will fire and log 'replied' in the activity log,
--   which is correct — this is a system reply, not a human admin falsely claiming to have replied.
-- - Atomic: if the acknowledgement insert fails, the entire function (ticket + user message +
--   acknowledgement) rolls back, leaving no broken ticket.
-- - Only fires on new ticket creation, never on replies.
-- - Existing tickets are not backfilled.

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category text,
  p_subject text,
  p_message text,
  p_attachment_url text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ticket_id uuid;
  v_recent_count int;
begin
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_category NOT IN ('task_issue','payment_reward','withdrawal','account','referral','technical','other') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  IF length(trim(p_subject)) < 3 THEN
    RAISE EXCEPTION 'Subject must be at least 3 characters';
  END IF;

  IF length(trim(p_message)) < 5 THEN
    RAISE EXCEPTION 'Message must be at least 5 characters';
  END IF;

  SELECT count(*) INTO v_recent_count
  FROM public.support_tickets
  WHERE user_id = v_user_id
    AND subject = trim(p_subject)
    AND created_at > now() - interval '2 minutes';
  IF v_recent_count > 0 THEN
    RAISE EXCEPTION 'A ticket with this subject was just created. Please wait a moment.';
  END IF;

  -- Create ticket
  INSERT INTO public.support_tickets (user_id, category, subject)
  VALUES (v_user_id, p_category, trim(p_subject))
  RETURNING id INTO v_ticket_id;

  -- Insert the user's first message
  INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_type, body, attachment_url)
  VALUES (v_ticket_id, v_user_id, 'user', trim(p_message), p_attachment_url);

  -- Insert automatic acknowledgement message (appears as "Support" in the UI)
  INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_type, body, is_internal_note)
  VALUES (
    v_ticket_id,
    v_user_id,
    'admin',
    'Thank you for contacting ZAPZO Support! 👋' || E'\n' ||
    'We''ve received your request and our support team will review it shortly. If you have any additional information or screenshots, you can reply to this ticket.' || E'\n' ||
    'We''ll get back to you as soon as possible. Thank you for your patience! 💙',
    false
  );

  RETURN v_ticket_id;
end;
$function$;

-- Preserve grants (CREATE OR REPLACE keeps existing grants, but be explicit)
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';