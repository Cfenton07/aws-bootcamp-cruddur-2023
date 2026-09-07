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
  (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'uuid', replies.uuid,
          'display_name', reply_users.display_name,
          'handle', reply_users.handle,
          'cognito_user_id', reply_users.cognito_user_id,
          'message', replies.message,
          'replies_count', replies.replies_count,
          'reposts_count', replies.reposts_count,
          'likes_count', replies.likes_count,
          'reply_to_activity_uuid', replies.reply_to_activity_uuid,
          'created_at', replies.created_at
        )
        ORDER BY replies.created_at ASC
      ),
      '[]'::json
    )
    FROM public.activities replies
    LEFT JOIN public.users reply_users ON reply_users.uuid = replies.user_uuid
    WHERE replies.reply_to_activity_uuid = activities.uuid
  ) AS replies
FROM public.activities
LEFT JOIN public.users ON users.uuid = activities.user_uuid
WHERE activities.reply_to_activity_uuid IS NULL
ORDER BY activities.created_at DESC