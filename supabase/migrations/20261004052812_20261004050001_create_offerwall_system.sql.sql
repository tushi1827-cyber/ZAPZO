/*
# Offerwall.GG Integration — Transaction Table, Wallet Types, and Atomic Credit/Reversal RPC

## Overview
Adds support for the Offerwall.GG CPA offerwall. A new `offerwall_transactions` table records every
postback from Offerwall.GG (credited and reversed). A SECURITY DEFINER RPC `process_offerwall_callback`
handles the atomic idempotent credit or reversal — it inserts the offerwall_transactions row and the
wallet_transactions ledger entry in a single transaction, so retried callbacks never double-credit.

## 1. New Table: offerwall_transactions
- `id` uuid PK
- `transaction_id` text NOT NULL UNIQUE — Offerwall.GG's stable conversion id (same on credit and reversal)
- `user_id` uuid NOT NULL REFERENCES auth.users(id) — the user who completed the offer
- `offer_id` text — network's offer id
- `offer_name` text — human-readable offer name
- `amount_usd` numeric — revenue in USD (not signed, for reporting)
- `points` numeric NOT NULL — amount in ZAPZO currency (currencyAmount from Offerwall.GG)
- `status` text NOT NULL — 'credited' or 'reversed'
- `raw_status` text — original status string from Offerwall.GG
- `is_test` boolean NOT NULL DEFAULT false — true when test=1
- `created_at` timestamptz NOT NULL DEFAULT now()
- `updated_at` timestamptz NOT NULL DEFAULT now()

UNIQUE constraint on transaction_id ensures idempotency at the DB level.

## 2. Wallet Transaction Type Expansion
The wallet_transactions.type CHECK constraint is altered to include two new types:
- `offerwall_reward` — credit when an offer is completed
- `offerwall_reversal` — debit when an offer is reversed/chargedback

This is additive — existing types remain unchanged.

## 3. SECURITY DEFINER RPC: process_offerwall_callback
Called by the Edge Function postback handler with the service-role key. NOT callable by anon or authenticated.
- Parameters: p_transaction_id, p_user_id, p_offer_id, p_offer_name, p_points, p_amount_usd, p_status, p_is_test
- For `credited`: inserts offerwall_transactions row (idempotent via unique constraint),
  credits wallet_transactions with type='offerwall_reward', creates a notification.
  If the transaction_id already exists with status='credited', returns idempotent success.
- For `reversed`: checks if a credited transaction exists, and if so:
  inserts a reversal record, debits wallet with type='offerwall_reversal' (negative amount),
  updates the original offerwall_transaction status to 'reversed'. Idempotent.
- For `test` callbacks: records the transaction with is_test=true but does NOT credit wallet.
- Returns JSONB with {success: true, message: string, already_processed: boolean}

## 4. RLS on offerwall_transactions
- SELECT: users can read only their own offerwall transactions (authenticated only)
- No INSERT/UPDATE/DELETE policies for users — all writes happen via the SECURITY DEFINER RPC
- service_role bypasses RLS for the Edge Function

## 5. Security
- The RPC is SECURITY DEFINER with fixed search_path = public.
- EXECUTE granted ONLY to service_role (not anon, not authenticated).
- The Edge Function verifies the Offerwall.GG HMAC-SHA256 signature before calling this RPC.
- No user can directly insert or modify offerwall transactions.
*/

-- ========== 1. Expand wallet_transactions type constraint ==========
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('task_reward','referral_reward','bonus','adjustment','withdrawal','withdrawal_reversal','offerwall_reward','offerwall_reversal'));

-- ========== 2. Create offerwall_transactions table ==========
CREATE TABLE IF NOT EXISTS public.offerwall_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id text,
  offer_name text,
  amount_usd numeric,
  points numeric NOT NULL,
  status text NOT NULL CHECK (status IN ('credited','reversed')),
  raw_status text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offerwall_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read only their own offerwall transactions
DROP POLICY IF EXISTS "offerwall_select_own" ON public.offerwall_transactions;
CREATE POLICY "offerwall_select_own"
  ON public.offerwall_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for users — only the SECURITY DEFINER RPC writes here.

CREATE INDEX IF NOT EXISTS idx_offerwall_user ON public.offerwall_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_offerwall_status ON public.offerwall_transactions(status);
CREATE INDEX IF NOT EXISTS idx_offerwall_txid ON public.offerwall_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_offerwall_created ON public.offerwall_transactions(created_at DESC);

-- ========== 3. SECURITY DEFINER RPC ==========
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
  v_existing record;
  v_points_abs numeric;
  v_offer_desc text;
BEGIN
  -- Validate status
  IF p_status NOT IN ('credited', 'reversed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  -- For test callbacks: record but do NOT credit wallet
  IF p_is_test THEN
    INSERT INTO public.offerwall_transactions (transaction_id, user_id, offer_id, offer_name, amount_usd, points, status, raw_status, is_test)
    VALUES (p_transaction_id, p_user_id, p_offer_id, p_offer_name, p_amount_usd, p_points, p_status, p_status, true)
    ON CONFLICT (transaction_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'message', 'test recorded', 'already_processed', false);
  END IF;

  v_offer_desc := 'Offer Reward' || COALESCE(' — ' || NULLIF(p_offer_id, ''), '');

  -- Check if this transaction_id already exists
  SELECT * INTO v_existing FROM public.offerwall_transactions
    WHERE transaction_id = p_transaction_id FOR UPDATE;

  IF p_status = 'credited' THEN
    IF FOUND THEN
      -- Already processed — idempotent success
      RETURN jsonb_build_object('success', true, 'message', 'already credited', 'already_processed', true);
    END IF;

    -- Insert the offerwall transaction record
    INSERT INTO public.offerwall_transactions (transaction_id, user_id, offer_id, offer_name, amount_usd, points, status, raw_status, is_test)
    VALUES (p_transaction_id, p_user_id, p_offer_id, p_offer_name, p_amount_usd, p_points, 'credited', 'credited', false);

    -- Credit wallet
    INSERT INTO public.wallet_transactions (user_id, type, amount, status, description)
    VALUES (p_user_id, 'offerwall_reward', p_points, 'completed', v_offer_desc);

    -- Create notification
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (p_user_id, 'reward_received', 'Offer Reward Received',
            'You earned ' || p_points::text || ' from completing an offer.',
            '/dashboard/wallet');

    RETURN jsonb_build_object('success', true, 'message', 'credited', 'already_processed', false);

  ELSIF p_status = 'reversed' THEN
    -- Reversal: only reverse if we have a credited transaction that hasn't been reversed yet
    IF NOT FOUND THEN
      -- No original credit found — nothing to reverse
      RETURN jsonb_build_object('success', true, 'message', 'no credit to reverse', 'already_processed', true);
    END IF;

    IF v_existing.status = 'reversed' THEN
      -- Already reversed — idempotent success
      RETURN jsonb_build_object('success', true, 'message', 'already reversed', 'already_processed', true);
    END IF;

    -- Update the offerwall transaction to reversed
    UPDATE public.offerwall_transactions
      SET status = 'reversed', updated_at = now()
      WHERE transaction_id = p_transaction_id;

    -- Debit wallet (negative amount, using absolute value of the original credit)
    v_points_abs := ABS(v_existing.points);
    INSERT INTO public.wallet_transactions (user_id, type, amount, status, description)
    VALUES (p_user_id, 'offerwall_reversal', -v_points_abs, 'completed',
            'Offer reversal' || COALESCE(' — ' || NULLIF(p_offer_id, ''), ''));

    -- Notification for reversal
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (p_user_id, 'wallet_adjustment', 'Offer Reward Reversed',
            'A reward of ' || v_points_abs::text || ' was reversed for an offer.',
            '/dashboard/wallet');

    RETURN jsonb_build_object('success', true, 'message', 'reversed', 'already_processed', false);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'unexpected_state');
END;
$$;

-- Grant EXECUTE only to service_role (Edge Function uses service-role key)
-- Explicitly do NOT grant to anon or authenticated
REVOKE EXECUTE ON FUNCTION public.process_offerwall_callback(text, uuid, text, text, numeric, numeric, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offerwall_callback(text, uuid, text, text, numeric, numeric, text, boolean) TO service_role;

-- ========== 4. Notify PostgREST to reload schema ==========
NOTIFY pgrst, 'reload schema';
