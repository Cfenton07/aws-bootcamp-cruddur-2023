SELECT
  (SELECT COALESCE(row_to_json(object_row),'{}'::json) FROM (
    SELECT
      users.uuid,
      users.handle,
      users.display_name,
      users.cognito_user_id,
      users.bio,
      (SELECT COALESCE(array_to_json(array_agg(row_to_json(array_row))),'[]'::json) FROM (
        SELECT
          activities.uuid,
          users.display_name,
          users.handle,
          users.cognito_user_id,
          activities.message,
          activities.replies_count,
          activities.reposts_count,
          activities.likes_count,
          -- Backlog #26: same rule as home.sql. cognito_user_id is NULL when
          -- signed out, so the EXISTS is false and every heart starts empty.
          EXISTS (
            SELECT 1
            FROM public.likes
            JOIN public.users likers ON likers.uuid = likes.user_uuid
            WHERE likes.activity_uuid = activities.uuid
              AND likers.cognito_user_id = %(cognito_user_id)s
          ) AS liked_by_me,
          activities.reply_to_activity_uuid,
          -- Backlog #29: the post a reply answers, for the
          -- "Replying to @handle: preview" line. NULL for root posts.
          -- The preview is cut to 80 characters here so the payload stays small.
          CASE WHEN parent.uuid IS NULL THEN NULL ELSE json_build_object(
            'uuid', parent.uuid,
            'handle', parent_users.handle,
            'display_name', parent_users.display_name,
            'preview', CASE WHEN char_length(parent.message) > 80
                            THEN left(parent.message, 80) || '…'
                            ELSE parent.message END
          ) END AS reply_to,
          activities.expires_at,
          activities.created_at
        FROM public.activities
        LEFT JOIN public.activities parent ON parent.uuid = activities.reply_to_activity_uuid
        LEFT JOIN public.users parent_users ON parent_users.uuid = parent.user_uuid
        WHERE activities.user_uuid = users.uuid
        ORDER BY activities.created_at DESC
        LIMIT 40
      ) array_row) AS activities,
      (SELECT count(true) FROM public.activities
       WHERE activities.user_uuid = users.uuid) AS cruds_count
    FROM public.users
    WHERE users.handle = %(handle)s
  ) object_row) AS profile