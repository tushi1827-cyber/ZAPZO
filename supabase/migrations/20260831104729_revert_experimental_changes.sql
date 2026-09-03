/*
# Revert experimental changes

## What this reverts:
1. Drop trg_validate_task_submission trigger (BEFORE INSERT on task_submissions)
2. Drop trg_after_task_submission trigger (AFTER INSERT on task_submissions)
3. Drop validate_task_submission() function
4. Drop after_task_submission() function
5. Drop submissions_insert_own policy (restored in experimental migration)
6. Drop submission_queue table (created in experimental migration)
7. Drop test_rpc_visibility function (created during diagnosis)
8. Drop submit-task-proxy edge function is handled separately (file removal)

## Result:
- task_submissions RLS returns to its pre-experiment state (SELECT + UPDATE only, no INSERT)
- submit_task_safe remains the ONLY way to submit tasks
- All security/validation logic stays in submit_task_safe
*/

-- Drop experimental triggers
DROP TRIGGER IF EXISTS trg_validate_task_submission ON public.task_submissions;
DROP TRIGGER IF EXISTS trg_after_task_submission ON public.task_submissions;

-- Drop experimental trigger functions
DROP FUNCTION IF EXISTS public.validate_task_submission();
DROP FUNCTION IF EXISTS public.after_task_submission();

-- Drop the INSERT policy that was re-added experimentally
DROP POLICY IF EXISTS "submissions_insert_own" ON public.task_submissions;

-- Drop the submission_queue table
DROP TABLE IF EXISTS public.submission_queue CASCADE;

-- Drop the test function
DROP FUNCTION IF EXISTS public.test_rpc_visibility(text);

NOTIFY pgrst, 'reload schema';
