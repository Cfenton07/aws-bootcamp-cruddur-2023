-- Suggested users for the sidebar: up to 3 random users other than the
-- caller. IS DISTINCT FROM keeps everyone when cognito_user_id is NULL
-- (logged out), where "<> NULL" would match no one.
SELECT
  users.uuid,
  users.handle,
  users.display_name,
  users.cognito_user_id
FROM public.users
WHERE users.cognito_user_id IS DISTINCT FROM %(cognito_user_id)s
ORDER BY random()
LIMIT 3
