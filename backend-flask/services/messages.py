from datetime import datetime, timedelta, timezone
class Messages:
  def run(user_sender_handle, user_receiver_handle):
    model = {
      'errors': None,
      'data': None
    }

    now = datetime.now(timezone.utc).astimezone()

    results = [
      {
        'uuid': '4e81c06a-db0f-4281-b4cc-98208537772a' ,
        'display_name': 'Chris Fenton',
        'handle':  'chrisfenton',
        'message': 'Cloud is the future!',
        'created_at': now.isoformat()
      },
      {
        'uuid': '66e12864-8c26-4c3a-9658-95a10f8fea67',
        'display_name': 'Chris Fenton',
        'handle':  'chrisfenton',
        'message': 'You have to be as agnostic as possible when architecting in the cloud!',
        'created_at': now.isoformat()
    }]
    model['data'] = results
    return model