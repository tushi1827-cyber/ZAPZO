/*
# Fix get_user_balance() to correctly deduct pending withdrawals from spendable balance

## Problem
The `get_user_balance()` function returned `0` for pending withdrawal transactions
instead of their (already negative) `amount`. This meant a user with ₹5.50 who
requested a ₹5 withdrawal still saw ₹5.50 as their "Available Balance" — even though
₹5 was reserved. The UI labels this value "Available Balance" and the withdrawal info
sidebar states "Funds are reserved in your wallet immediately," so the displayed
balance must be the spendable amount.

## Root Cause
The CASE expression had:
  when type = 'withdrawal' and status = 'pending' then 0
This skipped the negative amount entirely, leaving the reserved funds counted as available.

## Fix
Remove the special case for pending withdrawals. Now:
- Pending withdrawal (amount = -5, status = 'pending'): contributes -5 → balance reduced
- Completed/paid withdrawal (amount = -5, status = 'completed'): contributes -5 → still reduced
- Reversed withdrawal (status = 'reversed'): contributes 0 → funds restored (unchanged)
- Rewards/bonuses (positive amounts): contribute their full amount (unchanged)

This matches the UI's stated behavior: funds are reserved immediately on withdrawal
request, and released back if the admin rejects the withdrawal.

## Verification
- User with ₹5.50, withdraws ₹5 → balance shows ₹0.50 (spendable)
- Admin rejects withdrawal → tx becomes 'reversed' → balance returns to ₹5.50
- Admin approves (paid) → tx becomes 'completed' → balance stays ₹0.50
- Duplicate withdrawal still blocked by request_withdrawal (checks for pending/processing)
- Insufficient balance still blocked (request_withdrawal checks amount > balance)
*/

CREATE OR REPLACE FUNCTION public.get_user_balance()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
select coalesce(sum(
  case
    when status = 'reversed' then 0  -- funds restored, do not deduct
    else amount                       -- pending & completed withdrawals are negative, rewards are positive
  end
), 0)
from public.wallet_transactions
where user_id = auth.uid();
$function$;

-- Ensure only authenticated users can call it
REVOKE EXECUTE ON FUNCTION public.get_user_balance() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_balance() TO authenticated;
