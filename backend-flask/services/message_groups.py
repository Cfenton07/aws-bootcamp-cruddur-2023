from datetime import datetime, timedelta, timezone

from lib.ddb import Ddb
from lib.db import db

class MessageGroups:
  def run(cognito_user_id):
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
    data = Ddb.list_message_groups(ddb, my_user_uuid)
    print("list_message_groups:",data)

    # DynamoDB message-group items carry handle and display name but not the
    # Cognito id the frontend needs to build an avatar URL. Enrich at read
    # time with ONE Postgres query for every handle on the page, instead of
    # changing the DynamoDB item shape (which would need a backfill of every
    # existing item). A handle with no match gets None and the frontend
    # falls back to an initial.
    handles = list({group['handle'] for group in data})
    ids_by_handle = {}
    if handles:
      sql = db.template('users','cognito_ids_by_handles')
      rows = db.query_array_json(sql, {'handles': handles}) or []
      ids_by_handle = {row['handle']: row['cognito_user_id'] for row in rows}
    for group in data:
      group['cognito_user_id'] = ids_by_handle.get(group['handle'])

    model['data'] = data
    return model
