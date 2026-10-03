-- Like an activity: one statement inserts the like (if it is not already
-- there) and bumps activities.likes_count in the same transaction, so the
-- count can never drift from the likes table. Liking twice is a no-op.
-- Returns the activity's likes_count, or NULL when the caller has no users
-- row (the service turns NULL into an error).
WITH me AS (
  SELECT users.uuid
  FROM public.users
  WHERE users.cognito_user_id = %(cognito_user_id)s
  LIMIT 1
),
inserted AS (
  INSERT INTO public.likes (user_uuid, activity_uuid)
  SELECT me.uuid, %(activity_uuid)s::uuid FROM me
  ON CONFLICT (user_uuid, activity_uuid) DO NOTHING
  RETURNING activity_uuid
),
bumped AS (
  UPDATE public.activities
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE uuid IN (SELECT activity_uuid FROM inserted)
  RETURNING likes_count
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM me) THEN
  COALESCE(
    (SELECT likes_count FROM bumped),
    (SELECT COALESCE(likes_count, 0) FROM public.activities WHERE uuid = %(activity_uuid)s::uuid)
  )
END AS likes_count
