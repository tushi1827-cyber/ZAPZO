/*
# Fix UPI server-side validation — reject email domains and numeric-only handles

## Summary
The previous UPI regex `^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9._-]{1,}$`
accepted ordinary email addresses like `test@gmail.com` because it treated
`gmail.com` as a valid UPI handle. This migration replaces the regex-based
check with a multi-step validation that:

1. Rejects spaces
2. Requires exactly one @ separator
3. Requires at least 2 alphanumeric chars before @
4. Requires the handle after @ to start with a letter
5. Rejects handles that are entirely numeric
6. Rejects common email provider domains (gmail.com, yahoo.com, outlook.com, etc.)

## 1. Modified Function: request_withdrawal (4-param overload)
- Replaces the single regex check with sequential validation steps
- All other existing validation unchanged (gift card, balance, min, pending, suspended)

## 2. Security
- Function remains SECURITY DEFINER, search_path = public
- Existing grants preserved

## 3. Important Notes
1. No tables or columns changed
2. No existing data modified
3. Only affects new 'upi' method withdrawals
*/

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
  v_at_pos int;
  v_before_at text;
  v_after_at text;
  v_at_count int;
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

  -- UPI format validation
  IF p_method = 'upi' THEN
    -- Extract the UPI ID portion after "UPI ID: "
    v_upi_match := substring(p_payout_details from 'UPI ID:[[:space:]]*(.+?)[[:space:]]*$');
    v_upi_id := btrim(coalesce(v_upi_match, ''));

    IF v_upi_id = '' THEN
      RAISE EXCEPTION 'UPI ID is required';
    END IF;

    -- No spaces allowed
    IF v_upi_id ~ ' ' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;

    -- Count @ symbols — must be exactly 1
    v_at_count := array_length(string_to_array(v_upi_id, '@'), 1) - 1;
    IF v_at_count <> 1 THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;

    v_at_pos := position('@' in v_upi_id);
    v_before_at := substring(v_upi_id from 1 for v_at_pos - 1);
    v_after_at := substring(v_upi_id from v_at_pos + 1);

    -- Before @: at least 2 chars, alphanumeric/dot/hyphen/underscore only
    IF v_before_at IS NULL OR char_length(v_before_at) < 2 THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;
    IF v_before_at !~ '^[a-zA-Z0-9._-]+$' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;

    -- After @: at least 2 chars, must start with a letter
    IF v_after_at IS NULL OR char_length(v_after_at) < 2 THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;
    IF v_after_at !~ '^[a-zA-Z]' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;
    IF v_after_at !~ '^[a-zA-Z0-9._-]+$' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;

    -- Reject handles that are only numbers
    IF v_after_at ~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Enter a valid UPI ID, e.g. name@upi';
    END IF;

    -- Reject common email provider domains
    IF lower(v_after_at) IN (
      'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in',
      'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.in', 'live.com',
      'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me',
      'zoho.com', 'mail.com', 'gmx.com', 'yandex.com', 'rediffmail.com',
      'sify.com', 'inbox.com', 'msn.com', 'comcast.net', 'verizon.net',
      'facebook.com', 'apple.com'
    ) THEN
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
