-- this file was manually created
-- cognito_user_id is UNIQUE (backlog #50), so each seed user needs its own
-- placeholder. bin/db/update_cognito_user_ids replaces them by handle.
INSERT INTO public.users (display_name, email, handle, cognito_user_id)
VALUES
  ('Chris Fenton', 'cfenton07@yahoo.com' ,'chrisfenton' ,'MOCK-chrisfenton'),
  ('Antwuan Jacobs', 'fentonmgmt@gmail.com', 'Aj-skynet' ,'MOCK-Aj-skynet'),
  ('Trinidad James', 'TrinidadJ@example.com', 'goldgrill' ,'MOCK-goldgrill');

INSERT INTO public.activities (user_uuid, message, expires_at)
VALUES
  (
    (SELECT uuid from public.users WHERE users.handle = 'chrisfenton' LIMIT 1),
    'This was imported as seed data!',
    current_timestamp + interval '10 day'
  )