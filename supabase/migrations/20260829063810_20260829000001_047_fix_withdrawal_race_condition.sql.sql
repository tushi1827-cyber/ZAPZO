/*
# Fix Race Condition in request_withdrawal()

## Problem
The `request_withdrawal()` function checks the user's available balance and
existing pending/processing withdrawals without acquiring any row-level lock.
Two concurrent HTTP requests can both pass the balance check and the
pending-withdrawal check before either inserts, creating two withdrawals
that together exceed the user's actual balance (double-spend).

## Fix
Acquire a `SELECT ... FOR UPDATE` lock on the authenticated user's `profiles`
row at the very beginning of the function, before any balance or
pending-withdrawal checks. This serializes all withdrawal requests for the
same user — the second concurrent call blocks until the first completes
its transaction, at which point it re-reads the balance (which now reflects
the first withdrawal's deduction) and correctly fails if insufficient.

## Changes
- Recreate `public.request_withdrawal()` with the same signature, SECURITY
  DEFINER, and search_path settings.
- Add `SELECT ... FOR UPDATE` on `public.profiles WHERE id = auth.uid()`
  as the first statement after the `auth.uid()` null check.
- All existing validation is preserved:
  1. Authentication required (auth.uid() not null)
  2. Suspended-user blocking
  3. Positive amount
  4. Valid withdrawal method (upi, bank_transfer)
  5. Required payout details (non-empty)
  6. Minimum withdrawal amount (from settings)
  7. No existing pending/processing withdrawal
  8. Sufficient spendable balance (via get_user_balance())
- The lock is held until the function returns (end of the auto-transaction).

## Security
- No RLS changes.
- No new grants.
- SECURITY DEFINER with `SET search_path TO 'public'` preserved.
- The function still uses `auth.uid()` for self-identification only.
*/

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_payout_details text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_balance numeric;
  v_min numeric;
  v_existing int;
  v_suspended boolean;
  v_user_id uuid := auth.uid();
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Acquire an exclusive lock on the user's profile row to serialize
  -- concurrent withdrawal requests for the same user. This prevents
  -- two concurrent calls from both passing the balance check before
  -- either inserts (double-spend race condition).
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;

  IF p_method NOT IN ('upi', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid withdrawal method';
  END IF;

  IF char_length(trim(p_payout_details)) = 0 THEN
    RAISE EXCEPTION 'Payout details are required';
  END IF;

  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id = v_user_id;
  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support.';
  END IF;

  SELECT min_withdrawal INTO v_min FROM public.settings WHERE id = 1;
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is %', v_min;
  END IF;

  SELECT count(*) INTO v_existing FROM public.withdrawals
  WHERE user_id = v_user_id AND status IN ('pending', 'processing');
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'You already have a pending or processing withdrawal';
  END IF;

  v_balance := public.get_user_balance();
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %', v_balance;
  END IF;

  INSERT INTO public.withdrawals (user_id, amount, method, payout_details, status)
  VALUES (v_user_id, p_amount, p_method, p_payout_details, 'pending')
  RETURNING id INTO v_id;

  INSERT INTO public.wallet_transactions (user_id, type, amount, status, reference_id, description)
  VALUES (v_user_id, 'withdrawal', -p_amount, 'pending', v_id, 'Withdrawal request');

  RETURN v_id;
END;
$function$;
