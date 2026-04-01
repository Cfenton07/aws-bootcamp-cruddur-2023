from lib.db import db

class UserActivities:
  def run(handle):
    model = {
      'errors': None,
      'data': None
    }

    if handle == None or len(handle) < 1:
      model['errors'] = ['blank_user_handle']
    else:
      sql = db.template('users', 'show')
      results = db.query_object_json(sql, {'handle': handle})
      model['data'] = results
    return model