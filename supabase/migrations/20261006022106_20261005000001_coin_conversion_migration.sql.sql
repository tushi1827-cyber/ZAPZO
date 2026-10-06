-- ============================================================
-- COIN CONVERSION MIGRATION
-- ============================================================
-- Converts all monetary values from INR to ZAPZO Coins.
--
-- Conversion rule:
--   100 ZAPZO Coins = ₹10
--   1 Coin = ₹0.10
--   10 Coins = ₹1
--
-- All monetary fields are multiplied by 10.
-- Economic value is preserved: ₹50 becomes 500 Coins (still ₹50).
--
-- IDEMPOTENCY:
--   A dedicated migration tracking table is created to record
--   that this conversion has been applied. No business columns
--   or user-facing data are used as migration markers.
--
-- TRANSACTION SAFETY:
--   The entire conversion runs inside a single DO block. If ANY
--   statement fails, the transaction rolls back and no partial
--   changes are committed.
--
-- PRECONDITION CHECKS:
--   Before converting, the migration validates that the data
--   still appears to be in pre-conversion (INR) state. If the
--   values look like they were already converted, the migration
--   aborts safely.
--
-- Additional changes in this migration:
-- 1. Creates _coin_migration_log table with RLS enabled and
--    anon/authenticated access revoked.
-- 2. Creates offerwall_points_to_coins() function (1 point = 1 Coin)
--    with SET search_path = public.
-- 3. Replaces process_offerwall_callback() to use explicit coin
--    conversion, with idempotent credit/reversal logic.
-- 4. Replaces notify_withdrawal_requested() and
--    notify_withdrawal_status() trigger functions to use "Coins"
--    instead of ₹ in notification text.
-- 5. Issues NOTIFY pgrst, 'reload schema' to refresh PostgREST.
-- ============================================================

-- Step 1: Create a dedicated migration tracking table.
-- This table is independent of any business logic or user-facing data.
CREATE TABLE IF NOT EXISTS public._coin_migration_log (
  id          integer PRIMARY KEY DEFAULT 1,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT  singleton_row CHECK (id = 1)
);

-- Lock down the migration log table: no API access for anon or authenticated.
-- The migration runs as the service_role / migration owner which bypasses RLS.
ALTER TABLE public._coin_migration_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._coin_migration_log FROM anon, authenticated;

-- Step 2: Run the entire conversion inside a single transactional block.
-- If any statement fails, the whole block rolls back.
DO $$
DECLARE
  v_already_done     boolean;
  v_wtx_count        integer;
  v_wtx_net          numeric;
  v_wd_count         integer;
  v_wd_total         numeric;
  v_task_count       integer;
  v_task_reward_sum  numeric;
  v_sub_count        integer;
  v_sub_reward_sum   numeric;
  v_ref_count        integer;
  v_ref_reward_sum   numeric;
  v_offerwall_reward_count  integer;
  v_offerwall_reversal_count integer;
BEGIN
  -- ---- Idempotency check ----
  SELECT EXISTS(SELECT 1 FROM public._coin_migration_log WHERE id = 1)
    INTO v_already_done;

  IF v_already_done THEN
    RAISE NOTICE 'Coin conversion migration already applied. Skipping all conversions.';
    RETURN;
  END IF;

  -- ---- Precondition: gather current state ----
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_wtx_count, v_wtx_net
    FROM public.wallet_transactions;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_wd_count, v_wd_total
    FROM public.withdrawals;

  SELECT COUNT(*), COALESCE(SUM(reward), 0)
    INTO v_task_count, v_task_reward_sum
    FROM public.tasks;

  SELECT COUNT(*), COALESCE(SUM(reward_amount), 0)
    INTO v_sub_count, v_sub_reward_sum
    FROM public.task_submissions;

  SELECT COUNT(*), COALESCE(SUM(reward_amount), 0)
    INTO v_ref_count, v_ref_reward_sum
    FROM public.referrals;

  SELECT COUNT(*) INTO v_offerwall_reward_count
    FROM public.wallet_transactions WHERE type = 'offerwall_reward';

  SELECT COUNT(*) INTO v_offerwall_reversal_count
    FROM public.wallet_transactions WHERE type = 'offerwall_reversal';

  -- ---- Precondition validation ----
  IF v_wtx_net > 200 AND v_wtx_count <= 10 THEN
    RAISE EXCEPTION 'ABORTING: wallet_transactions.net (%) appears already converted (expected ~29 for 6 rows). Migration must not run twice.',
      v_wtx_net;
  END IF;

  IF v_offerwall_reward_count > 0 OR v_offerwall_reversal_count > 0 THEN
    RAISE EXCEPTION 'ABORTING: Unexpected offerwall_reward/offerwall_reversal wallet transactions found (% rewards, % reversals). Expected 0. Review data before running this migration.',
      v_offerwall_reward_count, v_offerwall_reversal_count;
  END IF;

  RAISE NOTICE 'Preconditions passed. wallet_transactions: % rows, net % INR. withdrawals: % rows, total % INR. tasks: % rows, reward sum % INR. submissions: % rows, reward sum %. referrals: % rows, reward sum % INR.',
    v_wtx_count, v_wtx_net,
    v_wd_count, v_wd_total,
    v_task_count, v_task_reward_sum,
    v_sub_count, v_sub_reward_sum,
    v_ref_count, v_ref_reward_sum;

  -- ---- Conversions (all x10) ----

  UPDATE public.wallet_transactions
    SET amount = amount * 10;

  UPDATE public.withdrawals
    SET amount = amount * 10;

  UPDATE public.tasks
    SET reward = reward * 10;

  UPDATE public.task_submissions
    SET reward_amount = reward_amount * 10;

  UPDATE public.referrals
    SET reward_amount = reward_amount * 10;

  UPDATE public.settings
    SET min_withdrawal = min_withdrawal * 10,
        referral_reward = referral_reward * 10;

  UPDATE public.gift_card_denominations
    SET value = value * 10;

  -- ---- Record migration completion ----
  INSERT INTO public._coin_migration_log (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  -- ---- Post-conversion verification ----
  SELECT COALESCE(SUM(amount), 0) INTO v_wtx_net
    FROM public.wallet_transactions;

  SELECT COALESCE(SUM(amount), 0) INTO v_wd_total
    FROM public.withdrawals;

  SELECT COALESCE(SUM(reward), 0) INTO v_task_reward_sum
    FROM public.tasks;

  SELECT COALESCE(SUM(reward_amount), 0) INTO v_sub_reward_sum
    FROM public.task_submissions;

  SELECT COALESCE(SUM(reward_amount), 0) INTO v_ref_reward_sum
    FROM public.referrals;

  RAISE NOTICE 'Conversion complete. Post-conversion values: wallet net = % Coins, withdrawals total = % Coins, tasks reward sum = % Coins, submissions reward sum = % Coins, referrals reward sum = % Coins.',
    v_wtx_net, v_wd_total, v_task_reward_sum, v_sub_reward_sum, v_ref_reward_sum;

END $$;

-- ============================================================
-- OFFERWALL POINTS TO ZAPZO COINS CONVERSION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.offerwall_points_to_coins(p_points numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND(p_points * 1.0, 0);
$$;

COMMENT ON FUNCTION public.offerwall_points_to_coins(numeric) IS
  'Converts Offerwall provider points to ZAPZO Coins. 1 point = 1 Coin by default. Adjust the multiplier to change the rate.';

-- ============================================================
-- UPDATE process_offerwall_callback to use explicit conversion
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_offerwall_callback(
  p_transaction_id text,
  p_user_id uuid,
  p_offer_id text DEFAULT NULL,
  p_offer_name text DEFAULT NULL,
  p_points numeric DEFAULT 0,
  p_amount_usd numeric DEFAULT NULL,
  p_status text DEFAULT 'credited',
  p_is_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing        record;
  v_offer_desc      text;
  v_coins           numeric;
  v_reversal_coins  numeric;
BEGIN
  IF p_status NOT IN ('credited', 'reversed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  IF p_is_test THEN
    INSERT INTO public.offerwall_transactions (transaction_id, user_id, offer_id, offer_name, amount_usd, points, status, raw_status, is_test)
    VALUES (p_transaction_id, p_user_id, p_offer_id, p_offer_name, p_amount_usd, p_points, p_status, p_status, true)
    ON CONFLICT (transaction_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'message', 'test recorded', 'already_processed', false);
  END IF;

  SELECT * INTO v_existing
    FROM public.offerwall_transactions
    WHERE transaction_id = p_transaction_id
    FOR UPDATE;

  IF p_status = 'credited' THEN
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'message', 'already credited', 'already_processed', true);
    END IF;

    v_coins := public.offerwall_points_to_coins(p_points);
    v_offer_desc := COALESCE(p_offer_name, 'Offerwall reward');

    INSERT INTO public.offerwall_transactions (transaction_id, user_id, offer_id, offer_name, amount_usd, points, status, raw_status, is_test)
    VALUES (p_transaction_id, p_user_id, p_offer_id, p_offer_name, p_amount_usd, p_points, 'credited', 'credited', p_is_test);

    INSERT INTO public.wallet_transactions (user_id, type, amount, status, description)
    VALUES (p_user_id, 'offerwall_reward', v_coins, 'completed', v_offer_desc);

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (p_user_id, 'reward_received', 'Offer Reward Credited',
            v_offer_desc || ' - ' || v_coins::text || ' Coins credited to your wallet.',
            '/dashboard/wallet');

    RETURN jsonb_build_object('success', true, 'message', 'Offerwall reward credited', 'coins', v_coins, 'already_processed', false);

  ELSIF p_status = 'reversed' THEN
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', true, 'message', 'no credit to reverse', 'already_processed', true);
    END IF;

    IF v_existing.status = 'reversed' THEN
      RETURN jsonb_build_object('success', true, 'message', 'already reversed', 'already_processed', true);
    END IF;

    v_reversal_coins := public.offerwall_points_to_coins(ABS(v_existing.points));
    v_offer_desc := COALESCE(p_offer_name, v_existing.offer_name, 'Offerwall reward');

    UPDATE public.offerwall_transactions
      SET status = 'reversed', updated_at = now()
      WHERE transaction_id = p_transaction_id;

    INSERT INTO public.wallet_transactions (user_id, type, amount, status, description)
    VALUES (v_existing.user_id, 'offerwall_reversal', -v_reversal_coins, 'completed', 'Reversal: ' || v_offer_desc);

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_existing.user_id, 'wallet_adjustment', 'Offer Reward Reversed',
            'A reward of ' || v_reversal_coins::text || ' Coins was reversed for an offer.',
            '/dashboard/wallet');

    RETURN jsonb_build_object('success', true, 'message', 'Offerwall reward reversed', 'coins', -v_reversal_coins, 'already_processed', false);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'unexpected_state');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_offerwall_callback(text, uuid, text, text, numeric, numeric, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offerwall_callback(text, uuid, text, text, numeric, numeric, text, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.offerwall_points_to_coins(numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offerwall_points_to_coins(numeric) TO service_role;

-- ============================================================
-- UPDATE WITHDRAWAL NOTIFICATION TRIGGER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_withdrawal_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_existing int;
  v_user_name text;
  v_method_label text;
begin
  if TG_OP = 'INSERT' then
    select count(*) into v_existing from public.notifications
    where user_id = NEW.user_id and type = 'withdrawal_requested' and related_id = NEW.id;
    if v_existing > 0 then
      return NEW;
    end if;

    select name into v_user_name from public.profiles where id = NEW.user_id;

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
      'Your ' || NEW.amount || ' Coins withdrawal request has been received.',
      '/dashboard/withdraw',
      NEW.id
    );

    PERFORM public.notify_admins_with_permission(
      'withdrawals',
      'admin_withdrawal_requested',
      'New Withdrawal Request',
      COALESCE(v_user_name, 'User') || ' requested ' || NEW.amount || ' Coins via ' || v_method_label || '.',
      '/admin/withdrawals',
      NEW.id
    );

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
$$;

CREATE OR REPLACE FUNCTION public.notify_withdrawal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_existing int;
  v_type text;
  v_title text;
  v_body text;
  v_user_name text;
  v_method_label text;
begin
  if TG_OP = 'UPDATE' and OLD.status != NEW.status then

    select name into v_user_name from public.profiles where id = NEW.user_id;

    v_method_label := CASE NEW.method
      WHEN 'upi' THEN 'UPI'
      WHEN 'bank_transfer' THEN 'Bank Transfer'
      WHEN 'amazon_gift_card' THEN 'Amazon Gift Card'
      WHEN 'flipkart_gift_card' THEN 'Flipkart Gift Card'
      WHEN 'google_play_gift_card' THEN 'Google Play Gift Card'
      ELSE NEW.method
    END;

    if NEW.status = 'paid' then
      if NEW.method in ('amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card') then
        v_type := 'gift_card_fulfilled';
        v_title := 'Gift Card Fulfilled';
        v_body := 'Your ' || replace(replace(replace(NEW.method, '_gift_card', ''), '_', ' '), 'amazon', 'Amazon') || ' Gift Card worth ' || NEW.amount || ' Coins has been fulfilled and sent to your email.';
      else
        v_type := 'withdrawal_paid';
        v_title := 'Payment Received';
        v_body := 'Your ' || NEW.amount || ' Coins withdrawal has been completed.';
      end if;
    elsif NEW.status = 'rejected' then
      v_type := 'withdrawal_rejected';
      v_title := 'Withdrawal Rejected';
      v_body := 'Your ' || NEW.amount || ' Coins withdrawal request was rejected. ' || coalesce('Reason: ' || NEW.rejection_reason, 'Reserved funds have been released back to your wallet.');
    elsif NEW.status = 'processing' then
      v_type := 'withdrawal_processing';
      v_title := 'Withdrawal Processing';
      v_body := 'Your ' || NEW.amount || ' Coins withdrawal is being processed.';
    elsif NEW.status = 'approved' then
      v_type := 'withdrawal_approved';
      v_title := 'Withdrawal Approved';
      v_body := 'Your ' || NEW.amount || ' Coins withdrawal request has been approved and is being processed for payment.';
    else
      return NEW;
    end if;

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
$$;

-- Force PostgREST to pick up the new/changed function signatures
NOTIFY pgrst, 'reload schema';
