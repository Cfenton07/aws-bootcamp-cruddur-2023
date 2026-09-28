import uuid

from lib.db import db

class ActivityReplies:
  def run(activity_uuid):
    """
    Every direct reply to one root activity, oldest first.

    The home feed caps replies at 3 per root (home.sql LIMIT 3). This
    backs the "View N more replies" button. Single-level threading means
    there are no grandchildren, so direct replies are the whole thread.
    LIMIT 100 in replies.sql is a safety cap, not pagination.
    """
    model = {
      'errors': None,
      'data': None
    }

    # Reject a malformed id here with a clear error, instead of letting
    # Postgres fail the ::uuid cast and surface as an HTTP 500.
    try:
      uuid.UUID(activity_uuid)
    except ValueError:
      model['errors'] = ['invalid_activity_uuid']
      return model

    sql = db.template('activities','replies')
    model['data'] = db.query_array_json(sql, {'activity_uuid': activity_uuid}) or []
    return model
