from lib.db import db


class UsersSuggested:
  """Up to 3 random users other than the caller (sidebar, backlog #19)."""

  @staticmethod
  def run(cognito_user_id=None):
    sql = db.template('users', 'suggested')
    return db.query_array_json(sql, {'cognito_user_id': cognito_user_id})
