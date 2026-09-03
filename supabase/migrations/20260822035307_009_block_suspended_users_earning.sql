/*
# Block suspended users from earning features

## Overview
Suspended users should not be able to:
- Submit tasks (enforced via RLS on task_submissions INSERT)
- Request withdrawals (enforced in request_withdrawal function)

## Changes
- Add RLS policy check on task_submissions INSERT: user must not be suspended
- Add is_suspended check in request_withdrawal function
*/

-- Block suspended users from submitting tasks
DROP POLICY IF EXISTS "submissions_insert_own" ON public.task_submissions;
CREATE POLICY "submissions_insert_own"
  ON public.task_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT (
      SELECT is_suspended FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Block suspended users from requesting withdrawals
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_payout_details text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_balance numeric;
  v_min numeric;
  v_existing int;
  v_suspended boolean;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;
  IF p_method NOT IN ('upi','bank_transfer') THEN
    RAISE EXCEPTION 'Invalid withdrawal method';
  END IF;
  IF char_length(trim(p_payout_details)) = 0 THEN
    RAISE EXCEPTION 'Payout details are required';
  END IF;

  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id = auth.uid();
  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support.';
  END IF;

  SELECT min_withdrawal INTO v_min FROM public.settings WHERE id = 1;
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is %', v_min;
  END IF;

  SELECT count(*) INTO v_existing FROM public.withdrawals
    WHERE user_id = auth.uid() AND status IN ('pending','processing');
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'You already have a pending or processing withdrawal';
  END IF;

  v_balance := public.get_user_balance();
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %', v_balance;
  END IF;

  INSERT INTO public.withdrawals (user_id, amount, method, payout_details, status)
    VALUES (auth.uid(), p_amount, p_method, p_payout_details, 'pending')
    RETURNING id INTO v_id;

  INSERT INTO public.wallet_transactions (user_id, type, amount, status, reference_id, description)
    VALUES (auth.uid(), 'withdrawal', -p_amount, 'pending', v_id, 'Withdrawal request');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) FROM anon;
