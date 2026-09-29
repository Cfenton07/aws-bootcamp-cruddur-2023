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

    # Backlog #17: DynamoDB message items carry handle and display name but
    # not the Cognito id the frontend needs to build an avatar URL. Same
    # read-time enrichment as message_groups.py: ONE Postgres query for every
    # handle in the conversation. It runs after the membership check above,
    # so a non-member never triggers it. A handle with no match gets None and
    # the frontend falls back to an initial.
    handles = list({message['handle'] for message in data})
    ids_by_handle = {}
    if handles:
      sql = db.template('users','cognito_ids_by_handles')
      rows = db.query_array_json(sql, {'handles': handles}) or []
      ids_by_handle = {row['handle']: row['cognito_user_id'] for row in rows}
    for message in data:
      message['cognito_user_id'] = ids_by_handle.get(message['handle'])

    model['data'] = data
    return model