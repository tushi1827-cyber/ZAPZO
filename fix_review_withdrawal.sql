-- ============================================================
-- FIX: review_withdrawal() — Restore Financial Safety and State Machine
-- ============================================================
-- This migration fixes the broken review_withdrawal() function that lost
-- its financial logic in a later migration. Apply via Supabase migration
-- tool or psql when database access is available.
--
-- See the full description in the header below.
-- ============================================================

/*
# Fix review_withdrawal() — Restore Financial Safety and State Machine

## Problem
A later migration (20260907000005) recreated review_withdrawal() and removed
critical financial logic:
  - No row locking (FOR UPDATE)
  - No terminal-state protection (paid/rejected could be reviewed again)
  - No wallet transaction reversal on rejection (user funds stayed locked)
  - No wallet transaction completion on payment
  - No explicit state-machine validation
  - No status validation (any text could be passed)

## Fix
Recreates review_withdrawal() with full financial logic, state-machine
enforcement, and idempotency guards.

## State Machine
  Allowed transitions:
    pending    → processing
    pending    → rejected
    pending    → approved
    processing → approved
    processing → rejected
    approved   → paid

  Terminal states: rejected, paid (no further review allowed).

## Rejection Refund (idempotent)
  1. Update withdrawal status to rejected.
  2. Check if reversal already exists (prevents duplicate refunds).
  3. If none, insert ONE withdrawal_reversal (positive amount).
  4. Mark original withdrawal wallet transaction as 'reversed'.

## Payment Completion (idempotent)
  1. Update withdrawal status to paid.
  2. Mark original withdrawal wallet transaction as 'completed'.
  3. No new wallet transaction created.

## Security
  - SECURITY DEFINER, search_path = 'public'
  - Admin check via is_admin() (JWT app_metadata, user-immutable)
  - Row lock with FOR UPDATE
  - REVOKE from anon/PUBLIC; GRANT to authenticated only
*/

-- ============================================================
-- Drop and recreate review_withdrawal with full financial logic
-- ============================================================

DROP FUNCTION IF EXISTS public.review_withdrawal(uuid, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.review_withdrawal(
  p_withdrawal_id uuid,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_w         public.withdrawals%rowtype;
  v_old_status text;
  v_reversal_exists int;
  v_orig_tx_status text;
BEGIN
  -- 1. Require authenticated admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- 2. Validate target status
  IF p_status NOT IN ('processing', 'approved', 'rejected', 'paid') THEN
    RAISE EXCEPTION 'Invalid target status: %. Must be one of: processing, approved, rejected, paid', p_status;
  END IF;

  -- 3. Lock the withdrawal row for the duration of this transaction
  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  -- 4. Verify the withdrawal exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;

  v_old_status := v_w.status;

  -- 5. Prevent terminal withdrawals from being processed again
  IF v_old_status IN ('rejected', 'paid') THEN
    RAISE EXCEPTION 'Withdrawal % is already in terminal state: %. No further review actions allowed.', p_withdrawal_id, v_old_status;
  END IF;

  -- 6. Validate the state transition
  IF NOT (
    (v_old_status = 'pending'    AND p_status IN ('processing', 'approved', 'rejected'))
    OR
    (v_old_status = 'processing' AND p_status IN ('approved', 'rejected'))
    OR
    (v_old_status = 'approved'   AND p_status = 'paid')
  ) THEN
    RAISE EXCEPTION 'Invalid state transition: % → %. Allowed: pending→processing/approved/rejected, processing→approved/rejected, approved→paid', v_old_status, p_status;
  END IF;

  -- 7. Handle each transition
  IF p_status = 'rejected' THEN
    -- --- REJECTION ---
    UPDATE public.withdrawals
      SET status = 'rejected',
          rejection_reason = p_reason,
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          updated_at = now()
      WHERE id = p_withdrawal_id;

    -- Idempotency: check if a reversal already exists
    SELECT count(*) INTO v_reversal_exists
      FROM public.wallet_transactions
      WHERE type = 'withdrawal_reversal'
        AND reference_id = p_withdrawal_id;

    IF v_reversal_exists = 0 THEN
      -- Create exactly ONE reversal transaction (positive amount = refund)
      INSERT INTO public.wallet_transactions (user_id, type, amount, status, reference_id, description)
        VALUES (v_w.user_id, 'withdrawal_reversal', v_w.amount, 'completed', p_withdrawal_id,
                'Withdrawal rejected - funds released');

      -- Mark the original withdrawal transaction as reversed
      UPDATE public.wallet_transactions
        SET status = 'reversed'
        WHERE type = 'withdrawal' AND reference_id = p_withdrawal_id;
    END IF;

  ELSIF p_status = 'paid' THEN
    -- --- PAYMENT COMPLETION ---
    UPDATE public.withdrawals
      SET status = 'paid',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          updated_at = now()
      WHERE id = p_withdrawal_id;

    -- Mark the original withdrawal wallet transaction as completed
    -- Idempotent: if already 'completed', this is a no-op
    UPDATE public.wallet_transactions
      SET status = 'completed'
      WHERE type = 'withdrawal' AND reference_id = p_withdrawal_id AND status = 'pending';

  ELSE
    -- --- PROCESSING or APPROVED (intermediate states) ---
    UPDATE public.withdrawals
      SET status = p_status,
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          updated_at = now()
      WHERE id = p_withdrawal_id;
  END IF;

  -- 8. Audit log
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'withdrawal_review', 'withdrawal', p_withdrawal_id,
            jsonb_build_object('old_status', v_old_status, 'new_status', p_status, 'reason', p_reason));

END;
$function$;

-- ============================================================
-- Grants: authenticated only, never anon or public
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO authenticated;

-- ============================================================
-- Reassert: users cannot directly INSERT into withdrawals
-- ============================================================
REVOKE INSERT ON public.withdrawals FROM authenticated, anon;

-- ============================================================
-- Force PostgREST schema cache reload
-- ============================================================
NOTIFY pgrst, 'reload schema';
