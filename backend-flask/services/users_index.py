from lib.db import db

class UsersIndex:
  def run():
    sql = db.template('users','index')
    results = db.query_array_json(sql)
    return results
