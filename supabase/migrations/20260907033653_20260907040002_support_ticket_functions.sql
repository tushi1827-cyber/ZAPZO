/*
# Support Ticket System — Server Functions

## Summary
Creates SECURITY DEFINER functions for all ticket operations.
Users can create tickets and reply to their own tickets.
Admins can reply, add internal notes, change status, and change priority.
All admin functions check public.is_admin().
All functions derive user_id/sender_id from auth.uid() — never trust client input.

## 1. Functions Created

### create_support_ticket(p_category, p_subject, p_message, p_attachment_url)
- Creates a new ticket for the calling user
- Inserts the first message into ticket_messages
- Returns the ticket id (uuid)
- Validates: subject length >= 3, message length >= 5, category is valid
- Duplicate prevention: rejects if user created a ticket with same subject in last 2 minutes

### reply_to_ticket(p_ticket_id, p_message, p_attachment_url)
- User replies to their own ticket
- Returns the message id (uuid)
- Validates: ticket belongs to user, ticket is not closed
- If ticket is 'resolved', reopens to 'open' (handled by trigger)

### admin_reply_to_ticket(p_ticket_id, p_message, p_attachment_url, p_is_internal)
- Admin replies to any ticket or adds an internal note
- Returns the message id (uuid)
- Requires is_admin()
- Internal notes (p_is_internal=true) are never visible to users and never generate notifications

### admin_update_ticket_status(p_ticket_id, p_status)
- Admin changes ticket status
- Returns void
- Requires is_admin()
- Validates: status is one of open, in_progress, resolved, closed

### admin_update_ticket_priority(p_ticket_id, p_priority)
- Admin changes ticket priority
- Returns void
- Requires is_admin()
- Validates: priority is one of low, medium, high, urgent

## 2. Security
1. All functions are SECURITY DEFINER with search_path = 'public'
2. All admin functions check public.is_admin() and raise exception if not admin
3. User functions derive user_id from auth.uid() — never from client params
4. sender_id is always set to auth.uid() inside the function
5. sender_type is hardcoded ('user' or 'admin') — never from client params
6. is_internal_note is only settable by admin functions
7. Users cannot reply to closed tickets
8. Duplicate ticket creation prevented (same subject within 2 minutes)
9. Empty/short messages rejected server-side

## 3. Grants
- create_support_ticket, reply_to_ticket: GRANT EXECUTE TO authenticated
- admin_*: GRANT EXECUTE TO authenticated (is_admin() check inside function gates access)
*/

-- ============================================================
-- create_support_ticket
-- ============================================================
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

  -- Validate category
  IF p_category NOT IN ('task_issue','payment_reward','withdrawal','account','referral','technical','other') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  -- Validate subject
  IF length(trim(p_subject)) < 3 THEN
    RAISE EXCEPTION 'Subject must be at least 3 characters';
  END IF;

  -- Validate message
  IF length(trim(p_message)) < 5 THEN
    RAISE EXCEPTION 'Message must be at least 5 characters';
  END IF;

  -- Duplicate prevention: same subject within last 2 minutes
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

  -- Insert first message
  INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_type, body, attachment_url)
  VALUES (v_ticket_id, v_user_id, 'user', trim(p_message), p_attachment_url);

  RETURN v_ticket_id;
end;
$function$;

-- ============================================================
-- reply_to_ticket (user)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reply_to_ticket(
  p_ticket_id uuid,
  p_message text,
  p_attachment_url text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.support_tickets%rowtype;
  v_msg_id uuid;
begin
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate ticket belongs to user
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT found THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF v_ticket.user_id != v_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Prevent replies to closed tickets
  IF v_ticket.status = 'closed' THEN
    RAISE EXCEPTION 'This ticket is closed. Please create a new ticket if you need further assistance.';
  END IF;

  -- Validate message
  IF length(trim(p_message)) < 1 THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  -- Insert message
  INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_type, body, attachment_url)
  VALUES (p_ticket_id, v_user_id, 'user', trim(p_message), p_attachment_url)
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
end;
$function$;

-- ============================================================
-- admin_reply_to_ticket
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_reply_to_ticket(
  p_ticket_id uuid,
  p_message text,
  p_attachment_url text,
  p_is_internal boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_msg_id uuid;
begin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Validate ticket exists
  IF NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE id = p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  -- Validate message
  IF length(trim(p_message)) < 1 THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  -- Insert message
  INSERT INTO public.ticket_messages (ticket_id, sender_id, sender_type, body, attachment_url, is_internal_note)
  VALUES (p_ticket_id, v_admin_id, 'admin', trim(p_message), p_attachment_url, COALESCE(p_is_internal, false))
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
end;
$function$;

-- ============================================================
-- admin_update_ticket_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_ticket_status(
  p_ticket_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_status NOT IN ('open','in_progress','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.support_tickets SET status = p_status WHERE id = p_ticket_id;

  IF NOT found THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
end;
$function$;

-- ============================================================
-- admin_update_ticket_priority
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_ticket_priority(
  p_ticket_id uuid,
  p_priority text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_priority NOT IN ('low','medium','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;

  UPDATE public.support_tickets SET priority = p_priority WHERE id = p_ticket_id;

  IF NOT found THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
end;
$function$;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_to_ticket(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reply_to_ticket(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_ticket_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_ticket_priority(uuid, text) TO authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
