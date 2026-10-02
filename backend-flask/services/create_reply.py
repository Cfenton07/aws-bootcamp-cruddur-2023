# Import datetime utilities for expiry calculation
from datetime import datetime, timedelta, timezone
# Import the database utility object for executing SQL queries
from lib.db import db
import uuid as uuid_lib


class CreateReply:
  @staticmethod
  def run(message, cognito_user_id, activity_uuid):
    model = {
      'errors': None,
      'data': None
    }

    # ============================================================
    # VALIDATION
    # ============================================================
    if cognito_user_id == None or len(cognito_user_id) < 1:
      model['errors'] = ['cognito_user_id_blank']

    if activity_uuid == None or len(activity_uuid) < 1:
      model['errors'] = ['activity_uuid_blank']

    if message == None or len(message) < 1:
      model['errors'] = ['message_blank']
    elif len(message) > 1024:
      model['errors'] = ['message_exceed_max_chars']

    if model['errors']:
      # Echo back what was submitted so the frontend can repopulate the form.
      model['data'] = {
        'message': message,
        'reply_to_activity_uuid': activity_uuid
      }
      return model

    # ============================================================
    # TARGET CHECK
    # ============================================================
    # Reject a malformed or nonexistent target with a specific error that
    # the route maps to 400 / 404, instead of reaching the insert.
    try:
      uuid_lib.UUID(activity_uuid)
    except ValueError:
      model['errors'] = ['invalid_activity_uuid']
      return model

    sql = db.template('activities', 'exists')
    if not db.query_value(sql, {'activity_uuid': activity_uuid}):
      model['errors'] = ['activity_not_found']
      return model

    # ============================================================
    # PERSIST
    # ============================================================
    now = datetime.now(timezone.utc).astimezone()
    expires_at = now + timedelta(days=30)

    uuid = CreateReply.create_reply(
      cognito_user_id,
      message,
      activity_uuid,
      expires_at
    )

    # db.query_commit() catches its own exceptions and returns None on
    # failure. Without this check a failed INSERT would return HTTP 200
    # with a fabricated-looking body -- the same silent-write-failure
    # shape as the August 2026 signup incident. Fail loudly instead.
    if uuid is None:
      model['errors'] = ['reply_insert_failed']
      model['data'] = {
        'message': message,
        'reply_to_activity_uuid': activity_uuid
      }
      return model

    # Return the row the database actually stored, not a local guess.
    model['data'] = CreateReply.query_object_activity(uuid)
    return model

  @staticmethod
  def create_reply(cognito_user_id, message, reply_to_activity_uuid, expires_at):
    """Insert one reply row and return the uuid the database assigned."""
    sql = db.template('activities', 'create_reply')
    uuid = db.query_commit(sql, {
      'cognito_user_id': cognito_user_id,
      'message': message,
      'reply_to_activity_uuid': reply_to_activity_uuid,
      'expires_at': expires_at
    })
    return uuid

  @staticmethod
  def query_object_activity(uuid):
    """Read the stored reply back as a JSON object."""
    sql = db.template('activities', 'object')
    return db.query_object_json(sql, {
      'uuid': uuid
    })