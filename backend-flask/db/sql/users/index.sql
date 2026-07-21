SELECT
  users.uuid,
  users.handle,
  users.display_name,
  users.cognito_user_id
FROM public.users
ORDER BY users.display_name ASC
