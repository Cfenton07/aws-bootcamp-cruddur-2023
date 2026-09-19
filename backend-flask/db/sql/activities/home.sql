SELECT
  activities.uuid,
  users.display_name,
  users.handle,
  users.cognito_user_id,
  activities.message,
  activities.replies_count,
  activities.reposts_count,
  activities.likes_count,
  activities.reply_to_activity_uuid,
  activities.expires_at,
  activities.created_at,
  COALESCE(r.replies, '[]'::json) AS replies
FROM public.activities
LEFT JOIN public.users ON users.uuid = activities.user_uuid
LEFT JOIN LATERAL (
  SELECT json_agg(
    json_build_object(
      'uuid', t.uuid,
      'display_name', t.display_name,
      'handle', t.handle,
      'cognito_user_id', t.cognito_user_id,
      'message', t.message,
      'replies_count', t.replies_count,
      'reposts_count', t.reposts_count,
      'likes_count', t.likes_count,
      'reply_to_activity_uuid', t.reply_to_activity_uuid,
      'created_at', t.created_at
    )
    ORDER BY t.created_at ASC
  ) AS replies
  FROM (
    SELECT
      replies.uuid,
      replies.message,
      replies.replies_count,
      replies.reposts_count,
      replies.likes_count,
      replies.reply_to_activity_uuid,
      replies.created_at,
      reply_users.display_name,
      reply_users.handle,
      reply_users.cognito_user_id
    FROM public.activities replies
    LEFT JOIN public.users reply_users ON reply_users.uuid = replies.user_uuid
    WHERE replies.reply_to_activity_uuid = activities.uuid
    ORDER BY replies.created_at ASC
    LIMIT 3
  ) t
) r ON true
WHERE activities.reply_to_activity_uuid IS NULL
ORDER BY activities.created_at DESC
