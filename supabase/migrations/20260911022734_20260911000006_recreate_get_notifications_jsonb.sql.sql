/*
# Recreate get_notifications with jsonb return type

## Why
PostgREST has better support for jsonb return types vs json.
The previous version returned json which may contribute to the
schema cache not recognizing the function.

## Changes
- DROP the old function (text, uuid, int) returning json
- CREATE new function (text, uuid, int) returning jsonb
- Same SECURITY DEFINER, same search_path, same logic
- Re-grant EXECUTE to authenticated only
*/

DROP FUNCTION IF EXISTS public.get_notifications(text, uuid, int);

CREATE OR REPLACE FUNCTION public.get_notifications(
  p_action text,
  p_notif_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_limit int;
  v_count int;
begin
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Authentication required');
  END IF;

  IF p_action NOT IN ('list', 'unread_count', 'mark_read', 'mark_all_read', 'delete') THEN
    RETURN jsonb_build_object('error', 'Invalid action');
  END IF;

  IF p_action = 'list' THEN
    v_limit := GREATEST(1, LEAST(p_limit, 50));

    RETURN (
      SELECT jsonb_build_object(
        'data',
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
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
          '[]'::jsonb
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

    RETURN jsonb_build_object('count', v_count);

  ELSIF p_action = 'mark_read' THEN
    IF p_notif_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Notification ID required');
    END IF;

    UPDATE public.notifications
    SET is_read = true
    WHERE id = p_notif_id AND user_id = v_user_id;

    RETURN jsonb_build_object('success', true);

  ELSIF p_action = 'mark_all_read' THEN
    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = v_user_id AND is_read = false;

    RETURN jsonb_build_object('success', true);

  ELSIF p_action = 'delete' THEN
    IF p_notif_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Notification ID required');
    END IF;

    DELETE FROM public.notifications
    WHERE id = p_notif_id AND user_id = v_user_id;

    RETURN jsonb_build_object('success', true);
  END IF;

  RETURN jsonb_build_object('error', 'Invalid action');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_notifications(text, uuid, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_notifications(text, uuid, int) FROM anon;

COMMENT ON FUNCTION public.get_notifications(text, uuid, int) IS 'SECURITY DEFINER RPC for user notifications. Uses auth.uid() for identification.';

NOTIFY pgrst, 'reload schema';
