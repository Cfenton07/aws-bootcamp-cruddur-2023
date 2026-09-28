from datetime import datetime, timedelta, timezone
from lib.ddb import Ddb
from lib.db import db

class Messages:
  def run(message_group_uuid,cognito_user_id):
    model = {
      'errors': None,
      'data': None
    }

    sql = db.template('activities/users','uuid_from_cognito_user_id')
    my_user_uuid = db.query_value(sql,{
      'cognito_user_id': cognito_user_id
    })

    print(f"UUID: {my_user_uuid}")

    ddb = Ddb.client()
    # Audit HIGH-01: only a participant may read this conversation.
    # my_user_uuid was already looked up above but was never used.
    if my_user_uuid is None or not Ddb.is_member(ddb, message_group_uuid, my_user_uuid):
      model['errors'] = ['message_group_not_found']
      return model
    data = Ddb.list_messages(ddb, message_group_uuid)
    # Audit HIGH-02: print a count, not the private message bodies.
    print(f"list_messages: {len(data)} items")

    model['data'] = data
    return model