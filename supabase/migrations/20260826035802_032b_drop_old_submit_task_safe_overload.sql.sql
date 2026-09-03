-- Drop the old 2-arg overload of submit_task_safe so only the 3-arg version remains
DROP FUNCTION IF EXISTS public.submit_task_safe(uuid, text) CASCADE;
