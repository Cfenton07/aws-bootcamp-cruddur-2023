-- Single-level threading. `target` resolves the TRUE parent: if the post
-- being replied to is itself a reply, attach to its parent instead.
-- INSERT ... SELECT FROM target inserts zero rows when the target uuid
-- does not exist, so the final SELECT returns nothing, query_commit
-- returns None, and create_reply.py raises. Loud failure is the point.
-- `bumped` keeps replies_count honest in the same transaction.
WITH target AS (
  SELECT COALESCE(a.reply_to_activity_uuid, a.uuid) AS uuid
  FROM public.activities a
  WHERE a.uuid = %(reply_to_activity_uuid)s::uuid
),
inserted AS (
  INSERT INTO public.activities (
    user_uuid,
    message,
    reply_to_activity_uuid,
    expires_at
  )
  SELECT
    (SELECT uuid
      FROM public.users
      WHERE users.cognito_user_id = %(cognito_user_id)s
      LIMIT 1
    ),
    %(message)s::text,
    target.uuid,
    %(expires_at)s::timestamp
  FROM target
  RETURNING uuid
),
bumped AS (
  UPDATE public.activities
  SET replies_count = COALESCE(replies_count, 0) + 1
  WHERE uuid = (SELECT uuid FROM target)
  RETURNING uuid
)
SELECT inserted.uuid FROM inserted;
