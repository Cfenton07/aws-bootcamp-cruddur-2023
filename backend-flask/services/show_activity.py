from datetime import datetime, timedelta, timezone

class ShowActivity:
    @staticmethod
    def run(activity_uuid):
        print(f'🔍 DEBUG: ShowActivity called with UUID: {activity_uuid}')
        
        now = datetime.now(timezone.utc).astimezone()
        results = [{
            'uuid': '68f126b0-1ceb-4a33-88be-d90fa7109eee',
            'handle': 'Chris Fenton',
            'message': 'Cloud is the future!',
            'created_at': (now - timedelta(days=2)).isoformat(),
            'expires_at': (now + timedelta(days=5)).isoformat(),
            'replies': {
                'uuid': '26e12864-1c26-5c3a-9658-97a10f8fea67',
                'handle': 'Worf',
                'message': 'This post has no honor, always go with proprietary tech in the cloud! Down with open source',
                'created_at': (now - timedelta(days=2)).isoformat()
            }
        }]
        
        print(f'🔍 DEBUG: Returning {len(results)} activities')
        return results