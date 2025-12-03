-- this file was manually created
INSERT INTO public.users (display_name, email, handle, cognito_user_id)
VALUES
  ('Chris Fenton', 'chris@example.com' ,'chrisfenton' ,'MOCK'),
  ('Antwuan Jacobs', 'antwuan@example.com', 'aj-skynet' ,'MOCK')
  ('Trinidad James', 'TrinidadJ@example.com', 'goldgrill' ,'MOCK');

INSERT INTO public.activities (user_uuid, message, expires_at)
VALUES
  (
    (SELECT uuid from public.users WHERE users.handle = 'chrisfenton' LIMIT 1),
    'This was imported as seed data!',
    current_timestamp + interval '10 day'
  )