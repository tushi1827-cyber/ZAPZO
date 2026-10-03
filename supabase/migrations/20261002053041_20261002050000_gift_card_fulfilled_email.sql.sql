/*
# Gift Card Fulfillment Email (gift_card_fulfilled)

## Purpose
When an admin marks a gift card withdrawal as 'paid', enqueue a
gift_card_fulfilled email instead of the generic withdrawal_paid email.

## Approach
Modify the existing public.notify_withdrawal_status() trigger function.
In the `elsif NEW.status = 'paid' then` block, split gift-card methods
from non-gift-card methods for the email enqueue only. The in-app
notification logic (gift_card_fulfilled vs withdrawal_paid) is already
correct and remains unchanged.

## Changes

### 1. Modified function: public.notify_withdrawal_status()
- All existing in-app notification logic preserved exactly.
- All existing email logic for approved/rejected/processing preserved.
- For `paid` status:
  - Gift card methods → enqueue `gift_card_fulfilled` (NEW)
  - Non-gift-card methods → enqueue `withdrawal_paid` (unchanged)
- gift_card_fulfilled payload: user_name, amount, gift_card, reference
- dedup_key: 'gift_card_email_fulfilled:' || NEW.id::text
- No payout_details, no gift card code, no sensitive data.
- Exception-isolated.

### 2. No other changes
- No changes to review_withdrawal, request_withdrawal, enqueue_email,
  email_queue, process-email-queue, send-email, frontend, auth.users,
  RLS, or withdrawals schema.
*/

CREATE OR REPLACE FUNCTION public.notify_withdrawal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_existing int;
  v_type text;
  v_title text;
  v_body text;
  v_user_name text;
  v_method_label text;
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status then

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

    -- Determine notification type and content
    if NEW.status = 'paid' then
      if NEW.method in ('amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card') then
        v_type := 'gift_card_fulfilled';
        v_title := 'Gift Card Fulfilled';
        v_body := 'Your ' || replace(replace(replace(NEW.method, '_gift_card', ''), '_', ' '), 'amazon', 'Amazon') || ' Gift Card worth ₹' || NEW.amount || ' has been fulfilled and sent to your email.';
      else
        v_type := 'withdrawal_paid';
        v_title := 'Payment Received';
        v_body := 'Your ₹' || NEW.amount || ' withdrawal has been completed.';
      end if;
    elsif NEW.status = 'rejected' then
      v_type := 'withdrawal_rejected';
      v_title := 'Withdrawal Rejected';
      v_body := 'Your ₹' || NEW.amount || ' withdrawal request was rejected. ' || coalesce('Reason: ' || NEW.rejection_reason, 'Reserved funds have been released back to your wallet.');
    elsif NEW.status = 'processing' then
      v_type := 'withdrawal_processing';
      v_title := 'Withdrawal Processing';
      v_body := 'Your ₹' || NEW.amount || ' withdrawal is being processed.';
    elsif NEW.status = 'approved' then
      v_type := 'withdrawal_approved';
      v_title := 'Withdrawal Approved';
      v_body := 'Your ₹' || NEW.amount || ' withdrawal request has been approved and is being processed for payment.';
    else
      return NEW;
    end if;

    -- Check for existing notification to prevent duplicates
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = v_type and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    insert into public.notifications (user_id, type, title, body, link, related_id)
    values (
      NEW.user_id,
      v_type,
      v_title,
      v_body,
      '/dashboard/withdraw',
      NEW.id
    );

    -- Enqueue withdrawal status email (exception-isolated so email failure never blocks the status change)
    if NEW.status = 'approved' then
      begin
        perform public.enqueue_email(
          NEW.user_id,
          'withdrawal_approved',
          jsonb_build_object(
            'user_name', nullif(v_user_name, ''),
            'amount', NEW.amount,
            'withdrawal_method', v_method_label
          ),
          'withdrawal_email_approved:' || NEW.id::text
        );
      exception when others then
        null;
      end;
    elsif NEW.status = 'rejected' then
      begin
        perform public.enqueue_email(
          NEW.user_id,
          'withdrawal_rejected',
          jsonb_build_object(
            'user_name', nullif(v_user_name, ''),
            'amount', NEW.amount,
            'withdrawal_method', v_method_label,
            'reason', NEW.rejection_reason
          ),
          'withdrawal_email_rejected:' || NEW.id::text
        );
      exception when others then
        null;
      end;
    elsif NEW.status = 'paid' then
      if NEW.method in ('amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card') then
        -- Gift card: enqueue gift_card_fulfilled email (not withdrawal_paid)
        begin
          perform public.enqueue_email(
            NEW.user_id,
            'gift_card_fulfilled',
            jsonb_build_object(
              'user_name', nullif(v_user_name, ''),
              'amount', NEW.amount,
              'gift_card', v_method_label,
              'reference', NEW.id::text
            ),
            'gift_card_email_fulfilled:' || NEW.id::text
          );
        exception when others then
          null;
        end;
      else
        -- Non-gift-card: enqueue withdrawal_paid email (unchanged)
        begin
          perform public.enqueue_email(
            NEW.user_id,
            'withdrawal_paid',
            jsonb_build_object(
              'user_name', nullif(v_user_name, ''),
              'amount', NEW.amount,
              'withdrawal_method', v_method_label
            ),
            'withdrawal_email_paid:' || NEW.id::text
          );
        exception when others then
          null;
        end;
      end if;
    end if;

  end if;
  return NEW;
end;
$function$;
