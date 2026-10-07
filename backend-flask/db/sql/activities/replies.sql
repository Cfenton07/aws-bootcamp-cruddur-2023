SELECT
  replies.uuid,
  reply_users.display_name,
  reply_users.handle,
  reply_users.cognito_user_id,
  replies.message,
  replies.replies_count,
  replies.reposts_count,
  replies.likes_count,
  -- Same rule as home.sql and users/show.sql: true only for the signed-in
  -- viewer's own like; NULL viewer (signed out) gives false. Without this,
  -- every reply loaded by "View N more replies" showed an empty heart.
  EXISTS (
    SELECT 1
    FROM public.likes
    JOIN public.users likers ON likers.uuid = likes.user_uuid
    WHERE likes.activity_uuid = replies.uuid
      AND likers.cognito_user_id = %(cognito_user_id)s
  ) AS liked_by_me,
  replies.reply_to_activity_uuid,
  replies.created_at
FROM public.activities replies
LEFT JOIN public.users reply_users ON reply_users.uuid = replies.user_uuid
WHERE replies.reply_to_activity_uuid = %(activity_uuid)s::uuid
ORDER BY replies.created_at ASC
LIMIT 100
