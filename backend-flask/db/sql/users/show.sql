SELECT
  (SELECT COALESCE(row_to_json(object_row),'{}'::json) FROM (
    SELECT
      users.uuid,
      users.handle,
      users.display_name,
      users.bio,
      (SELECT COALESCE(array_to_json(array_agg(row_to_json(array_row))),'[]'::json) FROM (
        SELECT
          activities.uuid,
          users.display_name,
          users.handle,
          activities.message,
          activities.replies_count,
          activities.reposts_count,
          activities.likes_count,
          activities.reply_to_activity_uuid,
          activities.expires_at,
          activities.created_at
        FROM public.activities
        WHERE activities.user_uuid = users.uuid
        ORDER BY activities.created_at DESC
        LIMIT 40
      ) array_row) AS activities,
      (SELECT count(true) FROM public.activities
       WHERE activities.user_uuid = users.uuid) AS cruds_count
    FROM public.users
    WHERE users.handle = %(handle)s
  ) object_row) AS profile