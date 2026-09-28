SELECT
  users.handle,
  users.cognito_user_id
FROM public.users
WHERE users.handle = ANY(%(handles)s)
