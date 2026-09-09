-- Activate 3 missing Support notification trigger functions
-- Updates ONLY: log_ticket_creation, log_admin_ticket_reply, log_ticket_status_change
-- No new tables, no RLS changes, no new triggers, no backfill.

-- ============================================================
-- 1. log_ticket_creation: add ticket_created notification
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_ticket_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Existing activity log
  INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, new_value)
  VALUES (NEW.id, NEW.user_id, 'created', NEW.status);

  -- Notify ticket owner that their ticket was created
  INSERT INTO public.notifications (user_id, type, title, body, link, related_id, is_read)
  VALUES (
    NEW.user_id,
    'ticket_created',
    'Support Ticket Created',
    'Your support ticket ' || NEW.ticket_number || ' has been created successfully.',
    '/dashboard/support/' || NEW.id::text,
    NEW.id,
    false
  )
  ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;

  RETURN NEW;
end;
$function$;

-- ============================================================
-- 2. log_admin_ticket_reply: add support_reply notification (non-internal only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_admin_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ticket public.support_tickets%rowtype;
begin
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

  IF NEW.is_internal_note THEN
    -- Internal note: log only, NEVER notify user
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
    VALUES (NEW.ticket_id, NEW.sender_id, 'note_added');
  ELSE
    -- Admin reply: log + notify ticket owner
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action)
    VALUES (NEW.ticket_id, NEW.sender_id, 'replied');

    INSERT INTO public.notifications (user_id, type, title, body, link, related_id, is_read)
    VALUES (
      v_ticket.user_id,
      'support_reply',
      'Support Replied',
      'ZAPZO Support replied to your ticket ' || v_ticket.ticket_number || '.',
      '/dashboard/support/' || NEW.ticket_id::text,
      NEW.id,
      false
    )
    ON CONFLICT (user_id, type, related_id) WHERE related_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
end;
$function$;

-- ============================================================
-- 3. log_ticket_status_change: add ticket_status_changed notification
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Existing activity log
    INSERT INTO public.ticket_activity_log (ticket_id, actor_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);

    -- Notify ticket owner of each status change (related_id = NULL allows multiple)
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id, is_read)
    VALUES (
      NEW.user_id,
      'ticket_status_changed',
      'Support Ticket Updated',
      'Your support ticket ' || NEW.ticket_number || ' is now ' || NEW.status || '.',
      '/dashboard/support/' || NEW.id::text,
      NULL,
      false
    );
  END IF;
  RETURN NEW;
end;
$function$;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';