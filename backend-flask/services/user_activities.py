from datetime import datetime, timedelta, timezone
from aws_xray_sdk.core import xray_recorder

class UserActivities:
  def run(user_handle):
     # Changed to in_subsegment to indicate it's a child of the main request segment
    with xray_recorder.in_subsegment('user_activities') as subsegment: # <-- CHANGED THIS LINE
        try:
            print("Subsegment started: user_activities") # <-- UPDATED PRINT MESSAGE
            print("Endpoint logic finished.")
             #You can add custom annotations or metadata to this subsegment here
            subsegment.put_annotation('custom_key', 'custom_value')
        finally:
            print("Subsegment context manager exiting.") # <-- UPDATED PRINT MESSAGE
    model = {
      'errors': None,
      'data': None
    }

    now = datetime.now(timezone.utc).astimezone()

    if user_handle == None or len(user_handle) < 1:
      model['errors'] = ['blank_user_handle']
    else:
      now = datetime.now()
      results = [{
        'uuid': '248959df-3079-4947-b847-9e0892d1bab4',
        'handle':  'Chris Fenton',
        'message': 'Cloud is the future!',
        'created_at': (now - timedelta(days=1)).isoformat(),
        'expires_at': (now + timedelta(days=31)).isoformat()
      }]
      model['data'] = results
    return model