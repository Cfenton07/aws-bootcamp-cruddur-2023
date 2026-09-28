SELECT
  replies.uuid,
  reply_users.display_name,
  reply_users.handle,
  reply_users.cognito_user_id,
  replies.message,
  replies.replies_count,
  replies.reposts_count,
  replies.likes_count,
  replies.reply_to_activity_uuid,
  replies.created_at
FROM public.activities replies
LEFT JOIN public.users reply_users ON reply_users.uuid = replies.user_uuid
WHERE replies.reply_to_activity_uuid = %(activity_uuid)s::uuid
ORDER BY replies.created_at ASC
LIMIT 100
