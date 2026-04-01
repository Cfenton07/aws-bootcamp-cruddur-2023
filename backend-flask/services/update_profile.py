from lib.db import db

class UpdateProfile:
  def run(cognito_user_id, bio, display_name):
    model = {
      'errors': None,
      'data': None
    }

    if display_name == None or len(display_name) < 1:
      model['errors'] = ['display_name_blank']
    else:
      handle = UpdateProfile.update(cognito_user_id, bio, display_name)
      data = UpdateProfile.query_users_short(handle)
      model['data'] = data
    return model

  def update(cognito_user_id, bio, display_name):
    sql = db.template('users', 'update')
    handle = db.query_commit(sql, {
      'cognito_user_id': cognito_user_id,
      'bio': bio,
      'display_name': display_name
    })
    return handle

  def query_users_short(handle):
    sql = db.template('activities', 'users', 'short')
    results = db.query_object_json(sql, {'handle': handle})
    return results