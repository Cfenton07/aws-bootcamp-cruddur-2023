import uuid as uuid_lib

from lib.db import db


class ActivityLike:
  """Like or unlike one activity for the signed-in user (backlog #18)."""

  @staticmethod
  def run(cognito_user_id, activity_uuid, like=True):
    model = {
      'errors': None,
      'data': None
    }

    if cognito_user_id is None or len(cognito_user_id) < 1:
      model['errors'] = ['cognito_user_id_blank']
      return model

    # Same target checks as CreateReply: the route maps these to 400 / 404.
    try:
      uuid_lib.UUID(str(activity_uuid))
    except ValueError:
      model['errors'] = ['invalid_activity_uuid']
      return model

    sql = db.template('activities', 'exists')
    if not db.query_value(sql, {'activity_uuid': activity_uuid}):
      model['errors'] = ['activity_not_found']
      return model

    # like.sql / unlike.sql change the likes row and likes_count in one
    # statement and return the new count. query_commit returns None on a
    # failed write AND when the caller has no users row (the SQL returns
    # NULL). 0 is a valid count after an unlike, so test for None, not
    # falsiness.
    sql = db.template('activities', 'like' if like else 'unlike')
    likes_count = db.query_commit(sql, {
      'cognito_user_id': cognito_user_id,
      'activity_uuid': activity_uuid
    })
    if likes_count is None:
      model['errors'] = ['like_not_saved']
      return model

    model['data'] = {
      'uuid': activity_uuid,
      'likes_count': likes_count,
      'liked': like
    }
    return model
