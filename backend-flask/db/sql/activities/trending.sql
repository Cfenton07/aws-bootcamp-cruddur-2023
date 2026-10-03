-- "Most liked this week" for the sidebar: activities ranked by likes
-- RECEIVED in the last 7 days (likes.created_at), not by when the post was
-- written, so an older post liked today still shows. Ties go to the most
-- recently liked. LOCALTIMESTAMP matches likes.created_at, which is a
-- TIMESTAMP without time zone.
SELECT
  activities.uuid,
  activities.message,
  activities.likes_count,
  users.handle,
  users.display_name,
  week.week_likes
FROM (
  SELECT
    likes.activity_uuid,
    COUNT(*) AS week_likes,
    MAX(likes.created_at) AS last_liked_at
  FROM public.likes
  WHERE likes.created_at > LOCALTIMESTAMP - INTERVAL '7 days'
  GROUP BY likes.activity_uuid
) week
JOIN public.activities ON activities.uuid = week.activity_uuid
LEFT JOIN public.users ON users.uuid = activities.user_uuid
ORDER BY week.week_likes DESC, week.last_liked_at DESC
LIMIT 4
