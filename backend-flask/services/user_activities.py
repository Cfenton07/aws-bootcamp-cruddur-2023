from lib.db import db

class UserActivities:
  # cognito_user_id is the signed-in viewer (None when signed out); it only
  # drives liked_by_me (backlog #26). The profile itself is public.
  def run(handle, cognito_user_id=None):
    model = {
      'errors': None,
      'data': None
    }

    if handle == None or len(handle) < 1:
      model['errors'] = ['blank_user_handle']
    else:
      sql = db.template('users', 'show')
      results = db.query_object_json(sql, {
        'handle': handle,
        'cognito_user_id': cognito_user_id
      })
      model['data'] = results
    return model