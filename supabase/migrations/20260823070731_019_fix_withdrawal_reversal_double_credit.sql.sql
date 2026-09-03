/*
# Fix double-credit bug in withdrawal rejection

## Bug
When a withdrawal is rejected, review_withdrawal() did two things:
1. Marked the original withdrawal transaction as 'reversed' (contributes 0 to balance)
2. Inserted a new 'withdrawal_reversal' transaction with +amount (contributes +amount to balance)

Since the original withdrawal was 'pending' (excluded from balance as 0), the
reversal +amount was never offset by the original -amount. This caused a
double-credit: the user's balance increased by the withdrawal amount upon
rejection, even though it was never deducted.

## Fix
Remove the withdrawal_reversal INSERT. Only mark the original withdrawal
transaction as 'reversed'. Since both 'pending' and 'reversed' states contribute
0 to get_user_balance(), the balance remains unchanged by the rejection — which
is correct because the funds were never actually deducted.
*/

CREATE OR REPLACE FUNCTION public.review_withdrawal(
  p_withdrawal_id uuid,
  p_status text,
  p_reason text default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_w public.withdrawals%rowtype;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_status NOT IN ('processing','approved','rejected','paid') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT found THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF v_w.status IN ('rejected','paid') THEN
    RAISE EXCEPTION 'Withdrawal is already in a terminal state';
  END IF;

  IF p_status = 'rejected' THEN
    UPDATE public.withdrawals
      SET status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = p_withdrawal_id;

    -- Mark original withdrawal tx as reversed. Both 'pending' and 'reversed'
    -- contribute 0 to get_user_balance(), so balance is unchanged.
    -- No reversal transaction needed — the -amount was never counted.
    UPDATE public.wallet_transactions SET status = 'reversed'
      WHERE type = 'withdrawal' AND reference_id = p_withdrawal_id;

  ELSIF p_status = 'paid' THEN
    UPDATE public.withdrawals
      SET status = 'paid', reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = p_withdrawal_id;

    -- Mark the withdrawal transaction as completed so it IS counted in the balance.
    UPDATE public.wallet_transactions SET status = 'completed'
      WHERE type = 'withdrawal' AND reference_id = p_withdrawal_id;

  ELSE
    UPDATE public.withdrawals
      SET status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = p_withdrawal_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'withdrawal_review', 'withdrawal', p_withdrawal_id,
            jsonb_build_object('status', p_status, 'reason', p_reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO authenticated;
