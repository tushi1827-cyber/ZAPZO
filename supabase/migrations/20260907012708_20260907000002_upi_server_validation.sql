/*
# Add server-side UPI ID format validation to request_withdrawal

## Summary
Recreates the request_withdrawal function (4-parameter overload) with an added
validation: when the payment method is 'upi', the payout details must contain
a valid UPI ID format (text part before @, handle after @, no spaces).

## 1. Modified Function: request_withdrawal (4-param overload)
- Adds a regex check for UPI ID format when p_method = 'upi'
- The payout_details string for UPI is expected to be in the format: "UPI ID: xxx@yyy"
- The function extracts the UPI ID from the payout_details and validates it
  against a pattern requiring:
    - At least 2 chars before @ (alphanumeric, dots, hyphens, underscores)
    - An @ separator
    - At least 2 chars after @ starting with a letter (alphanumeric, dots, hyphens, underscores)
- If invalid, raises an exception with a clear message
- All other existing validation (gift card denominations, balance, min withdrawal,
  pending check, suspended check) is unchanged
- The 3-parameter overload (legacy) is dropped to avoid ambiguity, since the
  4-parameter overload has a DEFAULT NULL for p_denomination_id and covers all cases

## 2. Security
- Function remains SECURITY DEFINER with search_path = public
- Existing grants preserved (authenticated can execute)

## 3. Important Notes
1. No tables or columns changed
2. No existing data modified
3. The UPI validation only applies to new 'upi' method withdrawals
4. Bank transfer and gift card methods are completely unaffected
5. The legacy 3-param overload is dropped since the 4-param version supersedes it
*/

-- Drop the old 3-parameter overload to avoid ambiguity
DROP FUNCTION IF EXISTS public.request_withdrawal(numeric, text, text);

-- Recreate the 4-parameter overload with UPI validation
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_payout_details text,
  p_denomination_id uuid DEFAULT NULL
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
  v_denom_value numeric;
  v_denom_provider text;
  v_upi_id text;
  v_upi_match text;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Acquire exclusive lock on user's profile row to serialize concurrent withdrawals
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;

  -- Validate method
  IF p_method NOT IN ('upi', 'bank_transfer', 'amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card') THEN
    RAISE EXCEPTION 'Invalid withdrawal method';
  END IF;

  IF char_length(trim(p_payout_details)) = 0 THEN
    RAISE EXCEPTION 'Payout details are required';
  END IF;

  -- UPI format validation: extract UPI ID from "UPI ID: xxx@yyy" and validate
  IF p_method = 'upi' THEN
    -- Extract the UPI ID portion after "UPI ID: "
    v_upi_match := substring(p_payout_details from 'UPI ID:\s*(.+?)$');
    v_upi_id := btrim(coalesce(v_upi_match, ''));

    IF v_upi_id = '' THEN
      RAISE EXCEPTION 'UPI ID is required';
    END IF;

    -- Validate UPI ID format:
    -- - No spaces
    -- - Exactly one @ separator
    -- - At least 2 chars before @ (alphanumeric, dot, hyphen, underscore)
    -- - At least 2 chars after @, starting with a letter
    IF v_upi_id ~ ' ' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;

    IF v_upi_id !~ '^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9._-]{1,}$' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;
  END IF;

  -- Gift card validation: denomination_id required, must match method + amount
  IF p_method IN ('amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card') THEN
    IF p_denomination_id IS NULL THEN
      RAISE EXCEPTION 'Please select a gift card denomination';
    END IF;

    SELECT value, provider INTO v_denom_value, v_denom_provider
    FROM public.gift_card_denominations
    WHERE id = p_denomination_id AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid or inactive denomination selected';
    END IF;

    IF v_denom_provider <> p_method THEN
      RAISE EXCEPTION 'Denomination does not match the selected gift card provider';
    END IF;

    IF v_denom_value <> p_amount THEN
      RAISE EXCEPTION 'Amount must exactly match the selected denomination value';
    END IF;
  ELSE
    -- For UPI / Bank Transfer, denomination_id must be null
    IF p_denomination_id IS NOT NULL THEN
      RAISE EXCEPTION 'Denomination is not applicable for this payment method';
    END IF;
  END IF;

  -- Suspended check
  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id = v_user_id;
  IF v_suspended THEN
    RAISE EXCEPTION 'Your account is suspended. Contact support.';
  END IF;

  -- Min withdrawal check
  SELECT min_withdrawal INTO v_min FROM public.settings WHERE id = 1;
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is %', v_min;
  END IF;

  -- Existing pending withdrawal check
  SELECT count(*) INTO v_existing FROM public.withdrawals
  WHERE user_id = v_user_id AND status IN ('pending', 'processing');
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'You already have a pending or processing withdrawal';
  END IF;

  -- Balance check
  v_balance := public.get_user_balance();
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %', v_balance;
  END IF;

  -- Insert withdrawal
  INSERT INTO public.withdrawals (user_id, amount, method, payout_details, status)
  VALUES (v_user_id, p_amount, p_method, p_payout_details, 'pending')
  RETURNING id INTO v_id;

  -- Insert wallet transaction
  INSERT INTO public.wallet_transactions (user_id, type, amount, status, reference_id, description)
  VALUES (v_user_id, 'withdrawal', -p_amount, 'pending', v_id, 'Withdrawal request');

  RETURN v_id;
END;
$function$;

-- Preserve grants
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, uuid) TO authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
