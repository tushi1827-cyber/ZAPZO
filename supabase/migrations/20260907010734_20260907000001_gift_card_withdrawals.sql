/*
# Gift Card Withdrawal Support

## Summary
Extends the withdrawal system to support 3 gift-card payment methods (Amazon, Flipkart, Google Play)
alongside the existing UPI and Bank Transfer methods. Adds an admin-managed denomination table
for gift cards, and updates the request_withdrawal function to validate gift-card denominations
server-side.

## 1. New Table: gift_card_denominations
- `id` (uuid, primary key)
- `provider` (text: 'amazon_gift_card' | 'flipkart_gift_card' | 'google_play_gift_card')
- `value` (numeric, positive — the gift card face value in INR)
- `is_active` (boolean, default true — admin can disable a denomination without deleting it)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

Admin can add, edit, remove, enable/disable rows. This is the single source of truth
for which denominations are available per gift-card provider.

## 2. Modified Table: withdrawals
- The `method` CHECK constraint is replaced to also allow:
  'amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card'
- Existing rows with 'upi' or 'bank_transfer' are unaffected.

## 3. Modified Function: request_withdrawal
- Accepts a new optional `p_denomination_id` (uuid) parameter for gift-card withdrawals.
- When the method is a gift card, validates that:
  (a) the denomination_id refers to an active row in gift_card_denominations
      with matching provider;
  (b) the denomination value equals the requested amount;
  (c) the user has sufficient balance (existing balance check remains).
- When the method is UPI or Bank Transfer, denomination_id must be NULL and
  the existing manual-amount flow is unchanged.
- All existing safety logic (suspended check, pending-withdrawal check,
  min-withdrawal check, balance check, row lock) is preserved.

## 4. Security
- RLS enabled on gift_card_denominations.
- SELECT: any authenticated user can read (they need to see available denominations).
- INSERT/UPDATE/DELETE: admin-only (checked via is_admin flag on profiles).

## 5. Defaults
- Seeds ₹10, ₹50, ₹100, ₹500 for each of the three gift-card providers (12 rows),
  all active.

## 6. Important Notes
1. No existing data is modified or deleted.
2. The withdrawals.method constraint is dropped and recreated — existing values
   remain valid under the new constraint.
3. The request_withdrawal function is recreated with the same security settings
   (SECURITY DEFINER, search_path = public).
4. review_withdrawal function is unchanged.
*/

-- ============================================================
-- 1. gift_card_denominations table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gift_card_denominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card')),
  value numeric NOT NULL CHECK (value > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gift_card_denominations ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see active denominations (needed to display choices)
DROP POLICY IF EXISTS "select_gift_card_denominations" ON public.gift_card_denominations;
CREATE POLICY "select_gift_card_denominations"
  ON public.gift_card_denominations FOR SELECT
  TO authenticated USING (true);

-- Only admins can insert
DROP POLICY IF EXISTS "insert_gift_card_denominations_admin" ON public.gift_card_denominations;
CREATE POLICY "insert_gift_card_denominations_admin"
  ON public.gift_card_denominations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Only admins can update
DROP POLICY IF EXISTS "update_gift_card_denominations_admin" ON public.gift_card_denominations;
CREATE POLICY "update_gift_card_denominations_admin"
  ON public.gift_card_denominations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Only admins can delete
DROP POLICY IF EXISTS "delete_gift_card_denominations_admin" ON public.gift_card_denominations;
CREATE POLICY "delete_gift_card_denominations_admin"
  ON public.gift_card_denominations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed default denominations (idempotent — only insert if not already present)
INSERT INTO public.gift_card_denominations (provider, value, is_active)
SELECT 'amazon_gift_card', v, true
FROM (VALUES (10), (50), (100), (500)) AS vals(v)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gift_card_denominations
  WHERE provider = 'amazon_gift_card' AND value = vals.v
);

INSERT INTO public.gift_card_denominations (provider, value, is_active)
SELECT 'flipkart_gift_card', v, true
FROM (VALUES (10), (50), (100), (500)) AS vals(v)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gift_card_denominations
  WHERE provider = 'flipkart_gift_card' AND value = vals.v
);

INSERT INTO public.gift_card_denominations (provider, value, is_active)
SELECT 'google_play_gift_card', v, true
FROM (VALUES (10), (50), (100), (500)) AS vals(v)
WHERE NOT EXISTS (
  SELECT 1 FROM public.gift_card_denominations
  WHERE provider = 'google_play_gift_card' AND value = vals.v
);

-- ============================================================
-- 2. Update withdrawals.method CHECK constraint
-- ============================================================
ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_method_check;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_method_check
  CHECK (method IN ('upi', 'bank_transfer', 'amazon_gift_card', 'flipkart_gift_card', 'google_play_gift_card'));

-- ============================================================
-- 3. Recreate request_withdrawal with denomination validation
-- ============================================================
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

-- Revoke direct table INSERT on withdrawals (force users through the function)
-- This was already in place per migration 031; reassert grants for the new function
REVOKE INSERT ON public.withdrawals FROM authenticated, anon;

-- Ensure only the function can be called by authenticated users
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, uuid) TO authenticated;

-- Revoke execute on the old signature if it lingers
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) FROM authenticated;

-- ============================================================
-- 4. Force PostgREST schema cache reload
-- ============================================================
NOTIFY pgrst, 'reload schema';
