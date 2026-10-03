-- Unlike an activity: mirror of like.sql. Deletes the caller's like (if any)
-- and decrements likes_count in the same statement, never below 0.
-- Unliking something you never liked is a no-op.
WITH me AS (
  SELECT users.uuid
  FROM public.users
  WHERE users.cognito_user_id = %(cognito_user_id)s
  LIMIT 1
),
deleted AS (
  DELETE FROM public.likes
  USING me
  WHERE likes.user_uuid = me.uuid
    AND likes.activity_uuid = %(activity_uuid)s::uuid
  RETURNING likes.activity_uuid
),
bumped AS (
  UPDATE public.activities
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
  WHERE uuid IN (SELECT activity_uuid FROM deleted)
  RETURNING likes_count
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM me) THEN
  COALESCE(
    (SELECT likes_count FROM bumped),
    (SELECT COALESCE(likes_count, 0) FROM public.activities WHERE uuid = %(activity_uuid)s::uuid)
  )
END AS likes_count
