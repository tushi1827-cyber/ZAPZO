
-- Remove default arguments from all functions that have them.
-- PostgREST 14.x schema cache reload may fail silently when functions have default args.
-- By removing all defaults, we eliminate this potential cause of cache reload failure.

-- 1. auto_verify_submission: drop and recreate without defaults
DROP FUNCTION IF EXISTS public.auto_verify_submission(uuid, jsonb, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.auto_verify_submission(
  p_submission_id uuid,
  p_config jsonb,
  p_proof_text text,
  p_proof_image_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
v_sub public.task_submissions%rowtype;
v_task public.tasks%rowtype;
v_config jsonb;
v_verify_type text;
v_target_url text;
v_keywords text[];
v_keyword text;
v_found boolean;
v_proof_lower text;
begin
select * into v_sub from public.task_submissions where id = p_submission_id;
if not found then
return jsonb_build_object('verified', false, 'reason', 'Submission not found');
end if;

select * into v_task from public.tasks where id = v_sub.task_id;
if not found then
return jsonb_build_object('verified', false, 'reason', 'Task not found');
end if;

v_config := COALESCE(p_config, v_task.auto_verification_config);
v_verify_type := COALESCE(v_task.auto_verification_type, v_config->>'type');

if v_verify_type IS NULL then
return jsonb_build_object('verified', false, 'reason', 'No automatic verification configured');
end if;

v_proof_lower := LOWER(COALESCE(p_proof_text, v_sub.proof_text, ''));

if v_verify_type = 'link_click' then
v_target_url := v_config->>'target_url';
if v_target_url IS NULL or length(trim(v_target_url)) = 0 then
return jsonb_build_object('verified', false, 'reason', 'No target URL configured for link verification');
end if;
if v_proof_lower LIKE '%' || LOWER(trim(v_target_url)) || '%' then
return jsonb_build_object('verified', true, 'reason', 'Link verified in proof text');
end if;
return jsonb_build_object('verified', false, 'reason', 'Could not verify you visited the required link. Please include the link in your proof.');
end if;

if v_verify_type = 'keyword_check' then
v_keywords := ARRAY(
SELECT jsonb_array_elements_text(v_config->'keywords')
);
if array_length(v_keywords, 1) IS NULL or array_length(v_keywords, 1) = 0 then
return jsonb_build_object('verified', false, 'reason', 'No keywords configured for verification');
end if;
v_found := false;
foreach v_keyword in array v_keywords loop
if v_proof_lower LIKE '%' || LOWER(trim(v_keyword)) || '%' then
v_found := true;
exit;
end if;
end loop;
if v_found then
return jsonb_build_object('verified', true, 'reason', 'Required keyword found in proof');
end if;
return jsonb_build_object('verified', false, 'reason', 'Could not find required verification keyword in your proof. Please check the instructions and try again.');
end if;

return jsonb_build_object('verified', false, 'reason', 'Unknown verification type: ' || v_verify_type);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_verify_submission(uuid, jsonb, text, text) TO authenticated;

-- 2. review_withdrawal: drop and recreate without defaults
DROP FUNCTION IF EXISTS public.review_withdrawal(uuid, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.review_withdrawal(
  p_withdrawal_id uuid,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  UPDATE public.withdrawals
  SET status = p_status,
      reviewed_at = now(),
      rejection_reason = CASE WHEN p_status = 'rejected' THEN p_reason ELSE NULL END
  WHERE id = p_withdrawal_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT user_id,
         CASE WHEN p_status = 'approved' THEN 'success' ELSE 'danger' END,
         CASE WHEN p_status = 'approved' THEN 'Withdrawal Approved' ELSE 'Withdrawal Rejected' END,
         CASE WHEN p_status = 'approved'
              THEN 'Your withdrawal request has been approved and will be processed.'
              ELSE 'Your withdrawal request has been rejected. ' || COALESCE(p_reason, '') END,
         '/dashboard/wallet'
  FROM public.withdrawals WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'review_withdrawal', 'withdrawal', p_withdrawal_id,
          jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO authenticated;

-- 3. review_risk_event: drop and recreate without defaults
DROP FUNCTION IF EXISTS public.review_risk_event(uuid, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.review_risk_event(
  p_event_id uuid,
  p_action text,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  UPDATE public.risk_events
  SET reviewed = true,
      reviewed_at = now(),
      review_action = p_action,
      review_notes = p_notes
  WHERE id = p_event_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'review_risk_event', 'risk_event', p_event_id,
          jsonb_build_object('action', p_action, 'notes', p_notes));
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.review_risk_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_risk_event(uuid, text, text) TO authenticated;

-- 4. Drop test functions and test table
DROP FUNCTION IF EXISTS public.test_rpc_visibility(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.test_v1(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.test_v2(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.test_v3(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.test_v4(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.test_v5(uuid, text, uuid) CASCADE;
DROP TABLE IF EXISTS public._pgrst_test CASCADE;

-- 5. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
