/*
# Withdrawal Requested Email

## Purpose
When a user submits a withdrawal request, automatically enqueue a
"withdrawal_requested" email into public.email_queue via
public.enqueue_email(). The existing process-email-queue Edge Function
picks it up and sends it through Resend.

## Approach
Modify the existing public.notify_withdrawal_requested() trigger function
(AFTER INSERT on withdrawals) to also enqueue an email. This is the single
point that already fires on every withdrawal creation, so no new triggers
are needed and request_withdrawal() does not need to change.

## Changes

### 1. Modified function: public.notify_withdrawal_requested()
- All existing in-app notification logic is preserved exactly as-is.
- After the notification insert, enqueues a "withdrawal_requested" email:
  enqueue_email(NEW.user_id, 'withdrawal_requested',
    jsonb with user_name, amount, withdrawal_method,
    'withdrawal_email_requested:' || NEW.id)
- The user's display name is fetched from public.profiles.
- The method is translated to a human-readable label for the email.
- enqueue_email is wrapped in BEGIN/EXCEPTION so that an email failure
  never rolls back the withdrawal request or the in-app notification.

### 2. No new triggers
- trg_notify_withdrawal_insert already calls notify_withdrawal_requested().
- CREATE OR REPLACE picks up the new logic automatically.

### 3. No other changes
- No changes to email_queue, enqueue_email, request_withdrawal,
  review_withdrawal, notify_withdrawal_status, process-email-queue Edge
  Function, auth.users, RLS, or frontend code.

## Safety
- Function remains SECURITY DEFINER with search_path = 'public'.
- dedup_key ('withdrawal_email_requested:' || withdrawal_id) guarantees
  one email per withdrawal request, even if the trigger fires twice.
- enqueue_email is also SECURITY DEFINER and resolves the recipient
  email from auth.users internally.
- Exception isolation ensures email failures never block withdrawals.
*/

CREATE OR REPLACE FUNCTION public.notify_withdrawal_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
  v_user_name text;
  v_method_label text;
begin
if TG_OP = 'INSERT' then
-- Check for existing notification to prevent duplicates
select count(*) into v_existing from public.notifications
where user_id = NEW.user_id and type = 'withdrawal_requested' and related_id = NEW.id;
if v_existing > 0 then
return NEW;
end if;

-- Resolve user display name for email payload
select name into v_user_name from public.profiles where id = NEW.user_id;

-- Human-readable method label for email
v_method_label := CASE NEW.method
  WHEN 'upi' THEN 'UPI'
  WHEN 'bank_transfer' THEN 'Bank Transfer'
  WHEN 'amazon_gift_card' THEN 'Amazon Gift Card'
  WHEN 'flipkart_gift_card' THEN 'Flipkart Gift Card'
  WHEN 'google_play_gift_card' THEN 'Google Play Gift Card'
  ELSE NEW.method
END;

insert into public.notifications (user_id, type, title, body, link, related_id)
values (
NEW.user_id,
'withdrawal_requested',
'Withdrawal Requested',
'Your ₹' || NEW.amount || ' withdrawal request has been received.',
'/dashboard/withdraw',
NEW.id
);

-- Enqueue withdrawal requested email (exception-isolated so email failure never blocks the request)
begin
  perform public.enqueue_email(
    NEW.user_id,
    'withdrawal_requested',
    jsonb_build_object(
      'user_name', nullif(v_user_name, ''),
      'amount', NEW.amount,
      'withdrawal_method', v_method_label
    ),
    'withdrawal_email_requested:' || NEW.id::text
  );
exception when others then
  null;
end;

end if;
return NEW;
end;
$function$;
