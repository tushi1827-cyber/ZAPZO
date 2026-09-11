/*
# Create get_notifications SECURITY DEFINER RPC function

## Purpose
Replaces the broken notifications Edge Function (which returns 404 due to a
Supabase platform deployment issue) and the PGRST205 schema-cache error on
direct table access to public.notifications.

## What this does
- Creates a single SECURITY DEFINER PostgreSQL function `get_notifications`
- Derives the authenticated user exclusively from `auth.uid()` — never accepts
  a user_id parameter from the client
- Supports 5 actions: list, unread_count, mark_read, mark_all_read, delete
- Returns JSON matching the existing frontend notification API contract

## Security
- SECURITY DEFINER with SET search_path = public (prevents search-path injection)
- EXECUTE granted only to `authenticated` (not anon)
- All queries are scoped to auth.uid() — users can only see/modify their own
  notifications
- p_action is validated against an allowlist
- p_notif_id is validated as UUID where required
- p_limit is clamped to 1–50

## What is NOT modified
- The public.notifications table (no schema changes)
- Existing notification triggers
- Existing notification RLS policies
- No other functions are dropped or altered
*/

CREATE OR REPLACE FUNCTION public.get_notifications(
  p_action text,
  p_notif_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_limit int;
  v_count int;
begin
  -- Reject unauthenticated requests
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Authentication required');
  END IF;

  -- Validate action against allowlist
  IF p_action NOT IN ('list', 'unread_count', 'mark_read', 'mark_all_read', 'delete') THEN
    RETURN json_build_object('error', 'Invalid action');
  END IF;

  IF p_action = 'list' THEN
    v_limit := GREATEST(1, LEAST(p_limit, 50));

    RETURN (
      SELECT json_build_object(
        'data',
        COALESCE(
          json_agg(
            json_build_object(
              'id', n.id,
              'user_id', n.user_id,
              'type', n.type,
              'title', n.title,
              'body', n.body,
              'link', n.link,
              'related_id', n.related_id,
              'is_read', n.is_read,
              'created_at', n.created_at
            )
            ORDER BY n.created_at DESC
          ),
          '[]'::json
        )
      )
      FROM public.notifications n
      WHERE n.user_id = v_user_id
      LIMIT v_limit
    );

  ELSIF p_action = 'unread_count' THEN
    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE user_id = v_user_id AND is_read = false;

    RETURN json_build_object('count', v_count);

  ELSIF p_action = 'mark_read' THEN
    IF p_notif_id IS NULL THEN
      RETURN json_build_object('error', 'Notification ID required');
    END IF;

    UPDATE public.notifications
    SET is_read = true
    WHERE id = p_notif_id AND user_id = v_user_id;

    RETURN json_build_object('success', true);

  ELSIF p_action = 'mark_all_read' THEN
    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = v_user_id AND is_read = false;

    RETURN json_build_object('success', true);

  ELSIF p_action = 'delete' THEN
    IF p_notif_id IS NULL THEN
      RETURN json_build_object('error', 'Notification ID required');
    END IF;

    DELETE FROM public.notifications
    WHERE id = p_notif_id AND user_id = v_user_id;

    RETURN json_build_object('success', true);
  END IF;

  RETURN json_build_object('error', 'Invalid action');
END;
$function$;

-- Grant EXECUTE only to authenticated (not anon)
GRANT EXECUTE ON FUNCTION public.get_notifications(text, uuid, int) TO authenticated;

-- Explicitly revoke from anon
REVOKE EXECUTE ON FUNCTION public.get_notifications(text, uuid, int) FROM anon;
