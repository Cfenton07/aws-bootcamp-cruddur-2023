# Week 5 — DynamoDB and Serverless Caching
## Here is a link to the week 5 bootcamp recording brokendown into a structured layout for reference and educational purposes: ![Week 5 NoSQL & Caching Summary Notes:](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/_docs/assets/AWS%20Bootcamp%20Week%205%20Summarized%20DynamoDB%20and%20Caching.pdf)
### Snapshot and link to my Dynamo DB Access Patterns Flow diagram: ![DynamoDB Access Patterns Diagram](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/_docs/assets/DynamoDB_AccessPatterns_Diagram_Cruddur.png)
- [**Lucid Diagram Link**](https://lucid.app/lucidchart/a45381e1-23aa-4d4f-8e52-bd8f0823267f/edit?invitationId=inv_af3824ec-06c5-45a1-a694-bb30cc15d720) 
- [**Link to Excel worksheet draft for NoSQL understanding**](https://docs.google.com/spreadsheets/d/1DSFfnXiO5xsDbqZJB7UdoMhT40A_YqzuiuJa9rm3Ge0/edit?usp=sharing)
-----------------------------------------------------------------------------------------------------------------------------------------------------------------
# Week 5 Complete Development Journal - DynamoDB Messaging System Implementation
## Executive Summary

### During Week 5 of the AWS Cloud Project Bootcamp, I successfully implemented a complete real-time messaging system for my Cruddur social media application. This involved integrating AWS DynamoDB for message storage, migrating to AWS Amplify authentication, creating a dual-database architecture (PostgreSQL + DynamoDB), and building a React-based messaging interface with real-time updates and auto-scroll functionality.
This was the most technically challenging week of the bootcamp, requiring approximately 20+ hours of focused development and extensive debugging across multiple layers of the application stack.

## Table of Contents

[1. Development Environment Setup](##1.-development-environment-setup)

2 - Authentication Migration to AWS Amplify

3 - Database Architecture Design

4 - DynamoDB Schema and Setup

5 - Backend API Development

6 - DynamoDB Client Library Implementation

7 - Service Layer Development

8 - Frontend Component Architecture

9 - Routing and Navigation

10 - UI/UX Improvements

11 - Debugging and Problem Solving

12 - Security Considerations

13 - Testing and Validation

14 - Code Quality Improvements Over Bootcamp

15 - Key Learnings and Takeaways



## 1. Development Environment Setup
1.1 GitHub Codespaces Migration
I migrated my entire development environment from Gitpod Classic to GitHub Codespaces after Gitpod Classic announced its deprecation. This required:
Docker Compose Configuration Updates:
```yaml
backend-flask:
  environment:
    FRONTEND_URL: "https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    BACKEND_URL: "https://${CODESPACE_NAME}-4567.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    AWS_XRAY_URL: "*${CODESPACE_NAME}-4567.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}*"
```
Key learning: Environment-specific variables must be properly configured for each development platform. GitHub Codespaces uses different environment variable patterns than Gitpod.
1.2 DynamoDB Local Setup
I configured a local DynamoDB instance for development:
```yaml
dynamodb-local:
  user: root
  command: "-jar DynamoDBLocal.jar -sharedDb -dbPath ./data"
  image: "amazon/dynamodb-local:latest"
  container_name: dynamodb-local
  ports:
    - "8000:8000"
  volumes:
    - "./docker/dynamodb:/home/dynamodblocal/data"
  working_dir: /home/dynamodblocal
```
What this does:

Runs Amazon's official DynamoDB Local Docker image
Persists data to ./docker/dynamodb for data retention between restarts
Exposes port 8000 for local development access
Uses shared database mode for simplified development


### 2. Authentication Migration to AWS Amplify
2.1 The Problem with localStorage
The bootcamp initially used cookie-based authentication with localStorage:
```javascript
// Old approach (insecure)
headers: {
  'Authorization': `Bearer ${localStorage.getItem("access_token")}`
}
```
Issues with this approach:

Tokens stored in plain text in browser localStorage
Vulnerable to XSS attacks
Manual token management
No automatic token refresh

2.2 AWS Amplify Implementation
I migrated to AWS Amplify's authentication library for secure JWT token management:
Installation:
```bash
cd frontend-react-js
npm install aws-amplify
```
Amplify Configuration (App.js):
```javascript
import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      region: process.env.REACT_APP_AWS_PROJECT_REGION,
      userPoolId: process.env.REACT_APP_AWS_USER_POOLS_ID,
      userPoolClientId: process.env.REACT_APP_CLIENT_ID,
    }
  }
});
```
What this does:

Configures Amplify v6 (newer syntax than bootcamp's v5)
Connects to my AWS Cognito User Pool
Provides automatic token refresh
Handles authentication state globally

2.3 Shared Authentication Utility
I created a reusable authentication helper to avoid code duplication:
File: frontend-react-js/src/components/lib/CheckAuth.js
```javascript
import { getCurrentUser, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

const checkAuth = async (setUser) => {
  console.log('checkAuth');
  try {
    await fetchAuthSession({ forceRefresh: true });
    const cognitoUser = await getCurrentUser();
    const userAttributes = await fetchUserAttributes();
    setUser({
      display_name: userAttributes.name,
      handle: userAttributes.preferred_username,
      cognito_user_id: userAttributes.sub
    });
    console.log('User is authenticated:', cognitoUser);
    return cognitoUser;
  } catch (err) {
    console.log('User is not authenticated:', err);
    setUser(null);
    return null;
  }
};

export default checkAuth;
```
What this does:

Forces token refresh: Ensures tokens are current
Gets current user: Verifies authentication status
Fetches user attributes: Retrieves display name, handle, and Cognito user ID
Sets user state: Updates React state with user information
Error handling: Gracefully handles unauthenticated state

Usage pattern across pages:
```javascript
import checkAuth from '../components/lib/CheckAuth';

const [user, setUser] = React.useState(null);

React.useEffect(() => {
  checkAuth(setUser);
}, []);
```
2.4 Secure Token Retrieval Pattern
I implemented a consistent pattern for authenticating API requests:
```javascript
const headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json'
};

try {
  const session = await fetchAuthSession();
  const accessToken = session?.tokens?.accessToken;
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
} catch (err) {
  console.log('Error fetching session:', err);
  // Continue with request even if no session
}
```
What this does:

Retrieves fresh JWT token from AWS Amplify
Safely handles missing tokens with optional chaining (?.)
Allows unauthenticated requests to proceed if needed
Separates auth errors from API errors

2.5 Pages Updated with New Authentication
I updated the following pages to use AWS Amplify:

HomeFeedPage.js - Main activity feed
MessageGroupsPage.js - List of message conversations
MessageGroupPage.js - Individual conversation view
MessageGroupNewPage.js - New conversation interface

Key improvement over bootcamp: The bootcamp used localStorage throughout. I migrated everything to AWS Amplify for enterprise-grade security.

3. Database Architecture Design
3.1 Dual Database Strategy
I implemented a dual-database architecture leveraging the strengths of both PostgreSQL and DynamoDB:
PostgreSQL (Relational Data):

Purpose: User accounts and profile information
Why: ACID compliance, complex relationships, user authentication
Storage: users table with cognito_user_id, handle, display_name, email

DynamoDB (NoSQL Data):

Purpose: Messages and message groups (conversations)
Why: High scalability, low latency, flexible schema for messaging
Storage: Single table design with composite keys

3.2 Data Model Design
PostgreSQL Users Table:
```sql
CREATE TABLE public.users (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  display_name text NOT NULL,
  handle text NOT NULL,
  email text NOT NULL,
  cognito_user_id text NOT NULL,
  created_at TIMESTAMP default current_timestamp NOT NULL
);
```
DynamoDB Single Table Design:
EntityPartition Key (pk)Sort Key (sk)Additional AttributesMessage Group (User A)GRP#{user_a_uuid}2025-11-26T...message_group_uuid, user_uuid (User B), user_display_name, user_handle, messageMessage Group (User B)GRP#{user_b_uuid}2025-11-26T...message_group_uuid, user_uuid (User A), user_display_name, user_handle, messageMessageMSG#{message_group_uuid}2025-11-26T...message_uuid, user_uuid, user_display_name, user_handle, message
Why this design:

Efficient queries: Can retrieve all conversations for a user with single query on GRP#{user_uuid}
Chronological ordering: Sort key is ISO timestamp for natural message ordering
Denormalization: User info duplicated in messages for read optimization
Bilateral visibility: Both users have message group entries for their perspective


4. DynamoDB Schema and Setup
4.1 Schema Definition
File: backend-flask/bin/ddb/schema-load
```python
#!/usr/bin/env python3

import boto3
import sys

attrs = {
  'endpoint_url': 'http://localhost:8000'
}

if len(sys.argv) == 2:
  if "prod" in sys.argv[1]:
    attrs = {}

ddb = boto3.client('dynamodb', **attrs)

table_name = 'cruddur-messages'

response = ddb.create_table(
  TableName=table_name,
  AttributeDefinitions=[
    {
      'AttributeName': 'pk',
      'AttributeType': 'S'
    },
    {
      'AttributeName': 'sk',
      'AttributeType': 'S'
    },
  ],
  KeySchema=[
    {
      'AttributeName': 'pk',
      'KeyType': 'HASH'
    },
    {
      'AttributeName': 'sk',
      'KeyType': 'RANGE'
    },
  ],
  BillingMode='PROVISIONED',
  ProvisionedThroughput={
    'ReadCapacityUnits': 5,
    'WriteCapacityUnits': 5
  }
)

print(response)
```
What this does:

Creates DynamoDB table: cruddur-messages
Defines partition key: pk (String type)
Defines sort key: sk (String type - ISO timestamps)
Environment-aware: Uses localhost for dev, AWS for production
Provisioned capacity: 5 RCU/WCU for development (cost-effective)

4.2 Database Management Scripts
Drop Table Script (backend-flask/bin/ddb/drop):
```python
#!/usr/bin/env python3

import boto3
import sys

attrs = {
  'endpoint_url': 'http://localhost:8000'
}

if len(sys.argv) == 2:
  if "prod" in sys.argv[1]:
    attrs = {}

ddb = boto3.client('dynamodb', **attrs)
table_name = 'cruddur-messages'

response = ddb.delete_table(
  TableName=table_name
)
print(response)
```
List Conversations Script (backend-flask/bin/ddb/patterns/list-conversations):
```python
#!/usr/bin/env python3

import boto3
import sys
import json
from datetime import datetime, timedelta, timezone

current_path = os.path.dirname(os.path.abspath(__file__))
parent_path = os.path.abspath(os.path.join(current_path, '..', '..', '..'))
sys.path.append(parent_path)
from lib.db import db

attrs = {
  'endpoint_url': 'http://localhost:8000'
}
ddb = boto3.client('dynamodb',**attrs)
table_name = 'cruddur-messages'

def get_my_user_uuid():
  sql = """
    SELECT 
      users.uuid
    FROM users
    WHERE
      users.handle = %(handle)s
  """
  uuid = db.query_value(sql, {'handle': 'chrisfenton'})
  return uuid

my_user_uuid = get_my_user_uuid()
print(f"my-uuid: {my_user_uuid}")

year = str(datetime.now().year)
query_params = {
  'TableName': table_name,
  'KeyConditionExpression': 'pk = :pk AND begins_with(sk,:year)',
  'ScanIndexForward': False,
  'ExpressionAttributeValues': {
    ':year': {'S': year},
    ':pk': {'S': f"GRP#{my_user_uuid}"}
  },
  'ReturnConsumedCapacity': 'TOTAL'
}

response = ddb.query(**query_params)
print(json.dumps(response, sort_keys=True, indent=2))
```
What this does:

Gets my user UUID from PostgreSQL
Queries DynamoDB for all my message groups
Filters by current year for efficiency
Returns results in reverse chronological order
Shows consumed capacity for performance monitoring

4.3 Seed Data Implementation
File: backend-flask/bin/ddb/seed
```python
#!/usr/bin/env python3

import boto3
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

current_path = os.path.dirname(os.path.abspath(__file__))
parent_path = os.path.abspath(os.path.join(current_path, '..', '..'))
sys.path.append(parent_path)
from lib.db import db

attrs = {
  'endpoint_url': 'http://localhost:8000'
}

if len(sys.argv) == 2:
  if "prod" in sys.argv[1]:
    attrs = {}

ddb = boto3.resource('dynamodb', **attrs)
table_name = 'cruddur-messages'
table = ddb.Table(table_name)

def get_user_uuids():
  sql = """
    SELECT 
      users.uuid,
      users.display_name,
      users.handle
    FROM public.users
    WHERE
      users.handle IN(
        'chrisfenton',
        'aj-skynet'
      )
  """
  users = db.query_array_json(sql)
  
  my_user = next((item for item in users if item["handle"] == 'chrisfenton'), None)
  other_user = next((item for item in users if item["handle"] == 'aj-skynet'), None)
  
  results = {
    'my_user': my_user,
    'other_user': other_user
  }
  print('get_user_uuids')
  print(results)
  return results

def create_message_group(client, message_group_uuid, my_user_uuid, last_message_at, message, other_user_uuid, other_user_display_name, other_user_handle):
  table_name = 'cruddur-messages'
  record = {
    'pk': f"GRP#{my_user_uuid}",
    'sk': last_message_at,
    'message_group_uuid': message_group_uuid,
    'message': message,
    'user_uuid': other_user_uuid,
    'user_display_name': other_user_display_name,
    'user_handle': other_user_handle
  }
  response = client.put_item(
    TableName=table_name,
    Item=record
  )
  print(response)

def create_message(client, message_group_uuid, created_at, message, my_user_uuid, my_user_display_name, my_user_handle):
  record = {
    'pk': f"MSG#{message_group_uuid}",
    'sk': created_at,
    'message_uuid': str(uuid.uuid4()),
    'message': message,
    'user_uuid': my_user_uuid,
    'user_display_name': my_user_display_name,
    'user_handle': my_user_handle
  }
  response = client.put_item(
    TableName=table_name,
    Item=record
  )
  print(response)

message_group_uuid = "5ae290ed-55d1-47a0-bc6d-fe2bc2700399"
users = get_user_uuids()
now = datetime.now(timezone.utc).astimezone(ZoneInfo('America/New_York'))

# Create message groups for both users
create_message_group(
  client=ddb,
  message_group_uuid=message_group_uuid,
  my_user_uuid=users['my_user']['uuid'],
  other_user_uuid=users['other_user']['uuid'],
  other_user_display_name=users['other_user']['display_name'],
  other_user_handle=users['other_user']['handle'],
  last_message_at=now.isoformat(),
  message="this is a filler message"
)

create_message_group(
  client=ddb,
  message_group_uuid=message_group_uuid,
  my_user_uuid=users['other_user']['uuid'],
  other_user_uuid=users['my_user']['uuid'],
  other_user_display_name=users['my_user']['display_name'],
  other_user_handle=users['my_user']['handle'],
  last_message_at=now.isoformat(),
  message="this is a filler message"
)

# Create conversation messages (Babylon 5 themed)
conversation = [
  {
    'user': 'chrisfenton',
    'message': 'I also thought that Zathras was a great example of the show\'s commitment to creating memorable and unique characters.'
  },
  {
    'user': 'aj-skynet',
    'message': 'Bester was brilliant; Zathras was grating. Let\'s not lump them together. Zathras was the kind of character that drags down a serious show.'
  },
  # ... more messages
]

for message_data in conversation:
  now = now + timedelta(minutes=1)
  user = next((item for item in users.values() if item["handle"] == message_data['user']), None)
  create_message(
    client=table,
    message_group_uuid=message_group_uuid,
    created_at=now.isoformat(),
    message=message_data['message'],
    my_user_uuid=user['uuid'],
    my_user_display_name=user['display_name'],
    my_user_handle=user['handle']
  )
```
What this seed data does:

Retrieves users from PostgreSQL: Gets me (Chris Fenton) and Antwuan Jacobs from the users table
Creates bilateral message groups: Both users get a message group entry pointing to the same conversation
Seeds conversation: Creates a Babylon 5-themed discussion with timestamped messages
Maintains consistency: Uses same message_group_uuid for all related data

Seed commands workflow:
```bash
./backend-flask/bin/ddb/drop              # Delete existing table
./backend-flask/bin/ddb/schema-load       # Create fresh table
./backend-flask/bin/ddb/seed              # Load seed data
./backend-flask/bin/ddb/patterns/list-conversations  # Verify data
```
5. Backend API Development
5.1 Messages API Endpoint
File: backend-flask/app.py
```python
@app.route("/api/messages/<string:message_group_uuid>", methods=['GET', 'OPTIONS'])
@cross_origin()
def data_messages(message_group_uuid):
    """Retrieve all messages for a specific conversation"""
    access_token = extract_access_token(request.headers)
    try:
        claims = cognito_jwt_token.verify(access_token)
        app.logger.debug("authenticated")
        app.logger.debug(claims)
        cognito_user_id = claims['sub']
        
        model = Messages.run(
            cognito_user_id=cognito_user_id, 
            message_group_uuid=message_group_uuid
        )
        
        if model['errors'] is not None:
            return model['errors'], 422
        else:
            return model['data'], 200
            
    except TokenVerifyError as e:
        app.logger.debug(e)
        return {}, 401
```
What this does:

Extracts JWT token: Gets Authorization header from request
Verifies token: Validates with AWS Cognito
Retrieves messages: Calls Messages service with authenticated user ID
Returns data: Sends message array or error to frontend
Handles auth failures: Returns 401 for invalid tokens

5.2 Create Message Endpoint
```python
@app.route("/api/messages", methods=['POST','OPTIONS'])
@cross_origin()
def data_create_message():
    """Send a new direct message"""
    message_group_uuid = request.json.get('message_group_uuid', None)
    user_receiver_handle = request.json.get('handle', None)
    message = request.json['message']
    access_token = extract_access_token(request.headers)
    
    try:
        claims = cognito_jwt_token.verify(access_token)
        app.logger.debug("authenticated")
        app.logger.debug(claims)
        cognito_user_id = claims['sub']
        
        if message_group_uuid == None:
            # Create new conversation
            model = CreateMessage.run(
                mode="create",
                message=message,
                cognito_user_id=cognito_user_id,
                user_receiver_handle=user_receiver_handle
            )
        else:
            # Add to existing conversation
            model = CreateMessage.run(
                mode="update",
                message=message,
                message_group_uuid=message_group_uuid,
                cognito_user_id=cognito_user_id
            )
            
        if model['errors'] is not None:
            return model['errors'], 422
        else:
            return model['data'], 200
            
    except TokenVerifyError as e:
        app.logger.debug(e)
        return {}, 401
```
What this does:

Determines operation mode: "create" for new conversations, "update" for existing
Validates authentication: Ensures user is logged in
Routes to service: Calls CreateMessage with appropriate parameters
Returns result: New message_group_uuid for redirects or message data for updates

Key design decision: Using mode parameter allows single endpoint to handle both new and existing conversations, reducing code duplication.
5.3 Message Groups Endpoint
```python
@app.route("/api/message_groups", methods=['GET'])
def data_message_groups():
    """Retrieve all conversations for the authenticated user"""
    access_token = extract_access_token(request.headers)
    try:
        claims = cognito_jwt_token.verify(access_token)
        app.logger.debug("authenticated")
        app.logger.debug(claims)
        cognito_user_id = claims['sub']
        
        model = MessageGroups.run(cognito_user_id=cognito_user_id)
        
        if model['errors'] is not None:
            return model['errors'], 422
        else:
            return model['data'], 200
            
    except TokenVerifyError as e:
        app.logger.debug(e)
        return {}, 401
```
What this does:

Lists conversations: Returns all message groups for authenticated user
Includes metadata: Last message preview, other user info, timestamp
Sorted by recency: Most recent conversations first

5.4 User Short Info Endpoint
```python
@app.route("/api/users/@<string:handle>/short", methods=['GET'])
def data_users_short(handle):
    """Retrieve basic user profile information by handle"""
    data = UsersShort.run(handle)
    return data, 200
```
What this does:

Public endpoint: No authentication required
Lookup by handle: Fetches user by @username
Returns minimal data: UUID, display name, handle only
Used for: Starting new conversations, displaying user info

Security note: This endpoint is intentionally public to allow users to look up others for messaging. Only non-sensitive profile data is returned.

6. DynamoDB Client Library Implementation
6.1 Core DynamoDB Client
File: backend-flask/lib/ddb.py
```python
import boto3
import sys
from datetime import datetime, timedelta, timezone
import uuid
import os
import botocore.exceptions

class Ddb:
  @staticmethod
  def client():
    """Create and configure DynamoDB client"""
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
    if endpoint_url:
      attrs = { 'endpoint_url': endpoint_url }
    else:
      attrs = {}
    
    # Critical fix: Add region configuration
    attrs['region_name'] = os.getenv('AWS_DEFAULT_REGION') or os.getenv('AWS_REGION', 'us-east-1')
    
    dynamodb = boto3.client('dynamodb', **attrs)
    return dynamodb
```
What this does:

Environment-aware: Uses localhost for dev, AWS endpoint for production
Region configured: Prevents NoRegionError by explicitly setting region
Fallback logic: Tries AWS_DEFAULT_REGION, then AWS_REGION, defaults to us-east-1
Returns client: boto3 DynamoDB client ready for operations

Critical improvement over bootcamp: The bootcamp code was missing region configuration, causing runtime errors. I debugged and fixed this.
6.2 List Message Groups Method
```python
@staticmethod
def list_message_groups(client, my_user_uuid):
    """Retrieve all conversations for a user"""
    year = str(datetime.now().year)
    table_name = 'cruddur-messages'
    
    query_params = {
      'TableName': table_name,
      'KeyConditionExpression': 'pk = :pkey AND begins_with(sk, :year)',
      'ScanIndexForward': False,  # Reverse chronological
      'Limit': 20,
      'ExpressionAttributeValues': {
        ':year': {'S': year},
        ':pkey': {'S': f"GRP#{my_user_uuid}"}
      }
    }
    
    print('query-params:', query_params)
    response = client.query(**query_params)
    items = response['Items']
    
    results = []
    for item in items:
      last_sent_at = item['sk']['S']
      results.append({
        'uuid': item['message_group_uuid']['S'],
        'display_name': item['user_display_name']['S'],
        'handle': item['user_handle']['S'],
        'message': item['message']['S'],
        'created_at': last_sent_at
      })
    
    return results
```
What this does:

Partition key query: Finds all items with GRP#{user_uuid}
Year filtering: Uses begins_with on sort key for efficient queries
Reverse chronological: Most recent conversations first
Limit results: Returns top 20 conversations
Transform data: Converts DynamoDB format to application JSON

DynamoDB query pattern: This uses a partition key exact match with sort key prefix, one of DynamoDB's most efficient query patterns.
6.3 List Messages Method
```python
@staticmethod
def list_messages(client, message_group_uuid):
    """Retrieve all messages in a conversation"""
    year = str(datetime.now().year)
    table_name = 'cruddur-messages'
    
    query_params = {
      'TableName': table_name,
      'KeyConditionExpression': 'pk = :pkey AND begins_with(sk, :year)',
      'ScanIndexForward': True,  # Chronological (oldest first)
      'Limit': 20,
      'ExpressionAttributeValues': {
        ':year': {'S': year},
        ':pkey': {'S': f"MSG#{message_group_uuid}"}
      }
    }
    
    response = client.query(**query_params)
    items = response['Items']
    
    results = []
    for item in items:
      created_at = item['sk']['S']
      results.append({
        'uuid': item['message_uuid']['S'],
        'display_name': item['user_display_name']['S'],
        'handle': item['user_handle']['S'],
        'message': item['message']['S'],
        'created_at': created_at
      })
    
    return results
```
What this does:

Different partition key: Uses MSG#{message_group_uuid} not GRP#
Chronological order: ScanIndexForward: True for oldest-first (typical chat UX)
Year scoped: Only queries current year for performance
Message-specific data: Includes message_uuid for uniqueness

Key distinction: Message groups use GRP# prefix, individual messages use MSG# prefix. This was a critical debugging insight.
6.4 Create Message Method
```python
@staticmethod
def create_message(client, message_group_uuid, message, my_user_uuid, my_user_display_name, my_user_handle):
    """Add a new message to an existing conversation"""
    now = datetime.now(timezone.utc).astimezone().isoformat()
    created_at = now
    message_uuid = str(uuid.uuid4())
    
    record = {
      'pk': {'S': f"MSG#{message_group_uuid}"},
      'sk': {'S': created_at},
      'message': {'S': message},
      'message_uuid': {'S': message_uuid},
      'user_uuid': {'S': my_user_uuid},
      'user_display_name': {'S': my_user_display_name},
      'user_handle': {'S': my_user_handle}
    }
    
    table_name = 'cruddur-messages'
    response = client.put_item(
      TableName=table_name,
      Item=record
    )
    
    print(response)
    return {
      'message_group_uuid': message_group_uuid,
      'uuid': message_uuid,
      'display_name': my_user_display_name,
      'handle': my_user_handle,
      'message': message,
      'created_at': created_at
    }
```
What this does:

Generates timestamp: ISO 8601 format in UTC
Creates UUID: Unique identifier for the message
Structures data: DynamoDB item with proper types ({'S': value})
Inserts to DynamoDB: Uses put_item for single item write
Returns data: Formatted for immediate display in UI

DynamoDB data format: All values must be typed dictionaries like {'S': 'string_value'} or {'N': 'number_value'}.
6.5 Create Message Group Method
```python
@staticmethod
def create_message_group(client, message, my_user_uuid, my_user_display_name, my_user_handle, other_user_uuid, other_user_display_name, other_user_handle):
    """Create a new conversation with first message"""
    print('== create_message_group.1')
    table_name = 'cruddur-messages'
    
    message_group_uuid = str(uuid.uuid4())
    message_uuid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).astimezone().isoformat()
    last_message_at = now
    created_at = now
    
    print('== create_message_group.2')
    
    # Message group for sender
    my_message_group = {
      'pk': {'S': f"GRP#{my_user_uuid}"},
      'sk': {'S': last_message_at},
      'message_group_uuid': {'S': message_group_uuid},
      'message': {'S': message},
      'user_uuid': {'S': other_user_uuid},  # Other person's info
      'user_display_name': {'S': other_user_display_name},
      'user_handle': {'S': other_user_handle}
    }
    
    print('== create_message_group.3')
    
    # Message group for receiver
    other_message_group = {
      'pk': {'S': f"GRP#{other_user_uuid}"},
      'sk': {'S': last_message_at},
      'message_group_uuid': {'S': message_group_uuid},
      'message': {'S': message},
      'user_uuid': {'S': my_user_uuid},  # Sender's info
      'user_display_name': {'S': my_user_display_name},
      'user_handle': {'S': my_user_handle}
    }
    
    print('== create_message_group.4')
    
    # First message in conversation
    message_record = {
      'pk': {'S': f"MSG#{message_group_uuid}"},
      'sk': {'S': created_at},
      'message': {'S': message},
      'message_uuid': {'S': message_uuid},
      'user_uuid': {'S': my_user_uuid},
      'user_display_name': {'S': my_user_display_name},
      'user_handle': {'S': my_user_handle}
    }
    
    # Batch write all three items atomically
    items = {
      table_name: [
        {'PutRequest': {'Item': my_message_group}},
        {'PutRequest': {'Item': other_message_group}},
        {'PutRequest': {'Item': message_record}}
      ]
    }
    
    try:
      print('== create_message_group.try')
      response = client.batch_write_item(RequestItems=items)
      return {
        'message_group_uuid': message_group_uuid
      }
    except botocore.exceptions.ClientError as e:
      print('== create_message_group.error')
      print(e)
      return None
```
What this does:

Creates 3 items: Two message group entries (one per user) + first message
Bilateral visibility: Both users get conversation in their list
Shared UUID: All items reference same message_group_uuid
Denormalized data: User info stored in each item for read efficiency
Batch write: Single atomic operation for consistency
Debug prints: Step-by-step logging for troubleshooting

Critical design: Each user gets their own message group entry (GRP#{their_uuid}) pointing to the other user. This enables efficient "list my conversations" queries.
Improvement over bootcamp: Added comprehensive debug logging at each step, making troubleshooting much easier.

7. Service Layer Development
7.1 Messages Service
File: backend-flask/services/messages.py
```python
from datetime import datetime, timedelta, timezone
from lib.ddb import Ddb
from lib.db import db

class Messages:
  def run(message_group_uuid, cognito_user_id):
    model = {
      'errors': None,
      'data': None
    }
    
    # Get user UUID from Cognito ID
    sql = db.template('activities/users', 'uuid_from_cognito_user_id')
    my_user_uuid = db.query_value(sql, {
      'cognito_user_id': cognito_user_id
    })
    
    print(f"UUID: {my_user_uuid}")
    
    # Get messages from DynamoDB
    ddb = Ddb.client()
    data = Ddb.list_messages(ddb, message_group_uuid)
    print("list_messages:", data)
    
    model['data'] = data
    return model
```
What this does:

Converts Cognito ID to UUID: PostgreSQL lookup for user identification
Queries DynamoDB: Retrieves all messages for the conversation
Returns structured data: Model format with errors/data pattern
Debug logging: Prints UUID and message data for troubleshooting

SQL Template Used (backend-flask/db/sql/activities/users/uuid_from_cognito_user_id.sql):
```sql
SELECT 
  users.uuid
FROM public.users
WHERE 
  users.cognito_user_id = %(cognito_user_id)s
LIMIT 1
```
7.2 Message Groups Service
File: backend-flask/services/message_groups.py
```python
from datetime import datetime, timedelta, timezone
from lib.ddb import Ddb
from lib.db import db

class MessageGroups:
  def run(cognito_user_id):
    model = {
      'errors': None,
      'data': None
    }
    
    # Get user UUID from Cognito ID
    sql = db.template('activities/users', 'uuid_from_cognito_user_id')
    my_user_uuid = db.query_value(sql, {
      'cognito_user_id': cognito_user_id
    })
    
    print(f"UUID: {my_user_uuid}")
    
    # Get conversation list from DynamoDB
    ddb = Ddb.client()
    data = Ddb.list_message_groups(ddb, my_user_uuid)
    print("list_message_groups:", data)
    
    model['data'] = data
    return model
```
What this does:

Authenticates user: Converts Cognito ID to internal UUID
Lists conversations: Retrieves all message groups for user
Returns formatted data: Array of conversations with metadata

7.3 Create Message Service
File: backend-flask/services/create_message.py
```python
from datetime import datetime, timedelta, timezone
from lib.db import db
from lib.ddb import Ddb

class CreateMessage:
  def run(mode, message, cognito_user_id, message_group_uuid=None, user_receiver_handle=None):
    model = {
      'errors': None,
      'data': None
    }
    
    # Validation based on mode
    if (mode == "update"):
      if message_group_uuid == None or len(message_group_uuid) < 1:
        model['errors'] = ['message_group_uuid_blank']
    
    if cognito_user_id == None or len(cognito_user_id) < 1:
      model['errors'] = ['cognito_user_id_blank']
    
    if (mode == "create"):
      if user_receiver_handle == None or len(user_receiver_handle) < 1:
        model['errors'] = ['user_receiver_handle_blank']
    
    if message == None or len(message) < 1:
      model['errors'] = ['message_blank']
    elif len(message) > 1024:
      model['errors'] = ['message_exceed_max_chars']
    
    if model['errors']:
      return model
    
    # Get user data from PostgreSQL
    sql = db.template('activities/users', 'create_message_users')
    
    if user_receiver_handle == None:
      rev_handle = ''
    else:
      rev_handle = user_receiver_handle
      
    users = db.query_array_json(sql, {
      'cognito_user_id': cognito_user_id,
      'user_receiver_handle': rev_handle
    })
    
    print("USERS =-=-=-=-==")
    print(users)
    
    # Extract sender and receiver
    my_user = next((item for item in users if item["kind"] == 'sender'), None)
    other_user = next((item for item in users if item["kind"] == 'recv'), None)
    
    print("USERS=[my-user]==")
    print(my_user)
    print("USERS=[other-user]==")
    print(other_user)
    
    # Create message in DynamoDB
    ddb = Ddb.client()
    
    if (mode == "update"):
      # Add to existing conversation
      data = Ddb.create_message(
        client=ddb,
        message_group_uuid=message_group_uuid,
        message=message,
        my_user_uuid=my_user['uuid'],
        my_user_display_name=my_user['display_name'],
        my_user_handle=my_user['handle']
      )
    elif (mode == "create"):
      # Create new conversation
      data = Ddb.create_message_group(
        client=ddb,
        message=message,
        my_user_uuid=my_user['uuid'],
        my_user_display_name=my_user['display_name'],
        my_user_handle=my_user['handle'],
        other_user_uuid=other_user['uuid'],
        other_user_display_name=other_user['display_name'],
        other_user_handle=other_user['handle']
      )
    
    model['data'] = data
    return model
```
What this does:

Mode-based validation: Different requirements for create vs update
Message validation: Checks for blank messages and length limits
User lookup: Queries PostgreSQL for both sender and receiver info
Dual operation: Handles both new conversations and message replies
Returns result: Message data for UI display or message_group_uuid for redirect

SQL Template (backend-flask/db/sql/activities/users/create_message_users.sql):
```sql
SELECT 
  users.uuid,
  users.display_name,
  users.handle,
  CASE users.cognito_user_id = %(cognito_user_id)s
  WHEN TRUE THEN
    'sender'
  WHEN FALSE THEN
    'recv'
  ELSE
    'other'
  END as kind
FROM public.users
WHERE
  users.cognito_user_id = %(cognito_user_id)s
  OR 
  users.handle = %(user_receiver_handle)s
```
What this SQL does:

Returns both users: Sender (matched by Cognito ID) and receiver (matched by handle)
Labels users: 'sender' vs 'recv' using CASE statement
Single query: Efficient - retrieves both users in one database call
Handles empty handle: When updating existing conversation, handle is empty string

Critical learning: The CASE statement creates a computed column 'kind' that lets me identify which user is which without complex Python logic.
7.4 Users Short Service
File: backend-flask/services/users_short.py
```python
from lib.db import db

class UsersShort:
  def run(handle):
    sql = db.template('activities/users', 'short')
    results = db.query_object_json(sql, {
      'handle': handle
    })
    return results
```
What this does:

Minimal user lookup: Returns only essential profile data
Public endpoint: No authentication required
Used for: New conversation UI, displaying user cards

SQL Template (backend-flask/db/sql/activities/users/short.sql):
```sql
SELECT 
  users.uuid,
  users.handle,
  users.display_name
FROM public.users
WHERE users.handle = %(handle)s
```
Security consideration: This endpoint is intentionally public to allow users to look up others for messaging. Only non-sensitive fields are returned.

8. Frontend Component Architecture
8.1 MessageFeed Component with Auto-Scroll
File: frontend-react-js/src/components/MessageFeed.js
```javascript
import './MessageFeed.css';
import React from 'react';
import MessageItem from './MessageItem';

export default function MessageFeed(props) {
  const messagesFeedRef = React.useRef(null);

  React.useEffect(() => {
    // Scroll to bottom when messages load or update
    if (messagesFeedRef.current) {
      messagesFeedRef.current.scrollTop = messagesFeedRef.current.scrollHeight;
    }
  }, [props.messages]);

  return (
    <div className='message_feed'>
      <div className='message_feed_heading'>
        <div className='title'>Messages</div>
      </div>
      <div className='message_feed_collection' ref={messagesFeedRef}>
        {props.messages.map(message => {
          return <MessageItem key={message.uuid} message={message} />
        })}
      </div>
    </div>
  );
}
```
What this does:

useRef hook: Creates reference to scrollable container
useEffect hook: Runs after messages render
Auto-scroll logic: Sets scrollTop to scrollHeight (bottom of container)
Dependency array: [props.messages] triggers re-scroll when messages change
Maps messages: Renders each message as MessageItem component

CSS Configuration (frontend-react-js/src/components/MessageFeed.css):
```css
.message_feed {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.message_feed_heading {
  flex-shrink: 0;
}

.message_feed_collection {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
```
What this CSS does:

Flexbox layout: Parent container fills available height
Fixed header: Heading doesn't shrink when content grows
Scroll container: Collection div has overflow-y: auto
Fills space: flex: 1 makes it take remaining vertical space

Critical learning: Direct scrollTop manipulation is more reliable than scrollIntoView() which can scroll the wrong container.
8.2 MessageForm Component
File: frontend-react-js/src/components/MessageForm.js
```javascript
import './MessageForm.css';
import React from "react";
import process from 'process';
import { useParams } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';

export default function MessageForm(props) {
  const [count, setCount] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const params = useParams();

  const classes = []
  classes.push('count')
  if (1024-count < 0){
    classes.push('err')
  }

  const onsubmit = async (event) => {
    event.preventDefault();
    
    // Build headers with authentication
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    try {
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken;

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (err) {
      console.log('Error fetching session:', err);
    }

    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/messages`
      console.log('onsubmit payload', message)
      
      // Build request body
      let json = { 'message': message }
      if (params.handle) {
        json.handle = params.handle
      } else {
        json.message_group_uuid = params.message_group_uuid
      }

      const res = await fetch(backend_url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(json)
      });
      
      let data = await res.json();
      if (res.status === 200) {
        console.log('data:', data)
        
        if (data.message_group_uuid) {
          // New conversation - redirect
          console.log('redirect to message group')
          window.location.href = `/messages/${data.message_group_uuid}`
        } else {
          // Existing conversation - update UI
          props.setMessages(current => [...current, data]);
          setMessage('');
          setCount(0);
        }
      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  }

  const textarea_onchange = (event) => {
    setCount(event.target.value.length);
    setMessage(event.target.value);
  }

  return (
    <form 
      className='message_form'
      onSubmit={onsubmit}
    >
      <textarea
        type="text"
        placeholder="send a direct message..."
        value={message}
        onChange={textarea_onchange} 
      />
      <div className='submit'>
        <div className={classes.join(' ')}>{1024-count}</div>
        <button type='submit'>Message</button>
      </div>
    </form>
  );
}
```
What this does:

Character counter: Tracks message length (1024 char limit)
AWS Amplify auth: Retrieves JWT token for authentication
Conditional payload: Sends handle for new conversations, message_group_uuid for existing
Response handling: Redirects for new conversations, updates UI for replies
Form clearing: Resets input and counter after successful send
Error styling: Adds 'err' class when over character limit

Improvement over bootcamp: I added form clearing after send (setMessage('') and setCount(0)) for better UX. The bootcamp version left the text in the input.
8.3 MessageGroupFeed Component
File: frontend-react-js/src/components/MessageGroupFeed.js
```javascript
import './MessageGroupFeed.css';
import MessageGroupItem from './MessageGroupItem';
import MessageGroupNewItem from './MessageGroupNewItem';

export default function MessageGroupFeed(props) {
  let message_group_new_item;
  
  if (props.otherUser) {
    message_group_new_item = <MessageGroupNewItem user={props.otherUser} />
  }

  return (
    <div className='message_group_feed'>
      <div className='message_group_feed_heading'>
        <div className='title'>Messages</div>
      </div>
      <div className='message_group_feed_collection'>
        {message_group_new_item}
        {props.message_groups.map(message_group => {
          return <MessageGroupItem key={message_group.uuid} message_group={message_group} />
        })}
      </div>
    </div>
  );
}
```
What this does:

Conditional rendering: Shows "new conversation" item only when otherUser exists
New item first: MessageGroupNewItem appears at top of list
Existing conversations: Maps through message_groups array
Unique keys: Uses message_group.uuid for React key prop

Context: otherUser is populated when navigating to /messages/new/:handle, showing who you're about to message.
8.4 MessageGroupNewItem Component
File: frontend-react-js/src/components/MessageGroupNewItem.js
```javascript
import './MessageGroupItem.css';
import { Link } from "react-router-dom";

export default function MessageGroupNewItem(props) {
  return (
    <Link className='message_group_item active' to={`/messages/new/${props.user.handle}`}>
      <div className='message_group_avatar'></div>
      <div className='message_content'>
        <div className='message_group_meta'>
          <div className='message_group_identity'>
            <div className='display_name'>{props.user.display_name}</div>
            <div className="handle">@{props.user.handle}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
```
What this does:

Displays target user: Shows who you're starting a conversation with
Highlighted styling: 'active' class makes it visually distinct
Clickable link: Navigates to new message page for this user
Reuses styles: Uses same CSS as MessageGroupItem for consistency

Bug fix: Fixed typo classsName → className on line that was causing styling issues.
8.5 MessageGroupItem Component
File: frontend-react-js/src/components/MessageGroupItem.js
```javascript
import './MessageGroupItem.css';
import { Link } from "react-router-dom";
import { DateTime } from 'luxon';

export default function MessageGroupItem(props) {
  const format_time_created_at = (value) => {
    const created = DateTime.fromISO(value)
    const now = DateTime.now()
    const diff_mins = now.diff(created, 'minutes').toObject().minutes;
    const diff_hours = now.diff(created, 'hours').toObject().hours;

    if (diff_hours > 24.0){
      return created.toFormat("LLL dd");
    } else if (diff_hours < 24.0 && diff_hours > 1.0) {
      return `${Math.floor(diff_hours)}h`;
    } else if (diff_hours < 1.0) {
      return `${Math.round(diff_mins)}m`;
    }
  };

  return (
    <Link className='message_group_item' to={`/messages/${props.message_group.uuid}`}>
      <div className='message_group_avatar'></div>
      <div className='message_content'>
        <div className='message_group_meta'>
          <div className='message_group_identity'>
            <div className='display_name'>{props.message_group.display_name}</div>
            <div className="handle">@{props.message_group.handle}</div>
          </div>
          <div className='created_at' title={props.message_group.created_at}>
            <span className='ago'>{format_time_created_at(props.message_group.created_at)}</span> 
          </div>
        </div>
        <div className="message">{props.message_group.message}</div>
      </div>
    </Link>
  );
}
```
What this does:

Relative timestamps: Shows "5m", "2h", or "Nov 26" based on age
Displays preview: Last message text shown
User info: Other user's display name and handle
Links to conversation: Clicking navigates to full message thread
Tooltip: Full timestamp on hover

Time formatting logic:

< 1 hour: "45m"
1-24 hours: "5h"


24 hours: "Nov 26"




### 9. Routing and Navigation
9.1 App.js Route Configuration
File: frontend-react-js/src/App.js
```javascript
import MessageGroupsPage from './pages/MessageGroupsPage';
import MessageGroupNewPage from './pages/MessageGroupNewPage';
import MessageGroupPage from './pages/MessageGroupPage';

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomeFeedPage />
  },
  {
    path: "/messages",
    element: <MessageGroupsPage />
  },
  {
    path: "/messages/new/:handle",
    element: <MessageGroupNewPage />
  },
  {
    path: "/messages/:message_group_uuid",
    element: <MessageGroupPage />
  },
  // ... other routes
]);
```
What this does:

Messages index: /messages shows all conversations
New conversation: /messages/new/:handle for starting new chat
Existing conversation: /messages/:message_group_uuid for message thread
URL parameters: :handle and :message_group_uuid extracted with useParams

Navigation flow:

User clicks Messages → /messages (MessageGroupsPage)
User clicks conversation → /messages/{uuid} (MessageGroupPage)
User navigates to new user → /messages/new/goldgrill (MessageGroupNewPage)
User sends first message → Redirects to /messages/{new_uuid}

9.2 MessageGroupsPage
File: frontend-react-js/src/pages/MessageGroupsPage.js
```javascript
import './MessageGroupPage.css';
import React from "react";
import { fetchAuthSession } from 'aws-amplify/auth';

import DesktopNavigation from '../components/DesktopNavigation';
import MessageGroupFeed from '../components/MessageGroupFeed';
import checkAuth from '../components/lib/CheckAuth';

export default function MessageGroupsPage() {
  const [messageGroups, setMessageGroups] = React.useState([]);
  const [popped, setPopped] = React.useState(false);
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);

  const loadData = async () => {
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/message_groups`
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken;
      
      const res = await fetch(backend_url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        method: "GET"
      });
      
      let resJson = await res.json();
      if (res.status === 200) {
        setMessageGroups(resJson)
      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  };

  React.useEffect(() => {
    if (dataFetchedRef.current) return;
    dataFetchedRef.current = true;

    loadData();
    checkAuth(setUser);
  }, [])

  return (
    <article>
      <DesktopNavigation user={user} active={'messages'} setPopped={setPopped} />
      <section className='message_groups'>
        <MessageGroupFeed message_groups={messageGroups} />
      </section>
      <div className='content'>
      </div>
    </article>
  );
}
```
What this does:

Prevents double fetch: Uses useRef to ensure data loads only once
Loads conversations: Fetches message groups from backend
Authenticates: Gets JWT token for authorization
Checks auth status: Updates user state for nav display
Renders feed: Passes message groups to MessageGroupFeed component

Layout: Two-column design with MessageGroupFeed on left, empty content area on right.
9.3 MessageGroupPage
File: frontend-react-js/src/pages/MessageGroupPage.js
```javascript
import './MessageGroupPage.css';
import React from "react";
import { useParams } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';

import DesktopNavigation from '../components/DesktopNavigation';
import MessageGroupFeed from '../components/MessageGroupFeed';
import MessagesFeed from '../components/MessageFeed';
import MessagesForm from '../components/MessageForm';
import checkAuth from '../components/lib/CheckAuth';

export default function MessageGroupPage() {
  const [messageGroups, setMessageGroups] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [popped, setPopped] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);
  const params = useParams();

  const loadMessageGroupsData = async () => {
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/message_groups`
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken;
      
      const res = await fetch(backend_url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        method: "GET"
      });
      
      let resJson = await res.json();
      if (res.status === 200) {
        setMessageGroups(resJson)
      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  };

  const loadMessageGroupData = async () => {
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/messages/${params.message_group_uuid}`
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken;
      
      const res = await fetch(backend_url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        method: "GET"
      });
      
      let resJson = await res.json();
      if (res.status === 200) {
        setMessages(resJson)
      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  };

  React.useEffect(() => {
    if (dataFetchedRef.current) return;
    dataFetchedRef.current = true;

    loadMessageGroupsData();
    loadMessageGroupData();
    checkAuth(setUser);
  }, [])

  return (
    <article>
      <DesktopNavigation user={user} active={'messages'} setPopped={setPopped} />
      <section className='message_groups'>
        <MessageGroupFeed message_groups={messageGroups} />
      </section>
      <div className='content messages'>
        <MessagesFeed messages={messages} />
        <MessagesForm setMessages={setMessages} />
      </div>
    </article>
  );
}
```
What this does:

Dual data load: Fetches both conversation list and specific messages
URL parameter: Extracts message_group_uuid from route
Three-column layout: Nav + conversation list + message thread
Message form: Allows sending new messages in this conversation
State management: Updates messages array when new message sent

Layout: MessageGroupFeed (left), MessagesFeed + MessageForm (right).
9.4 MessageGroupNewPage
File: frontend-react-js/src/pages/MessageGroupNewPage.js
```javascript
import './MessageGroupPage.css';
import React from "react";
import { useParams } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';

import DesktopNavigation from '../components/DesktopNavigation';
import MessageGroupFeed from '../components/MessageGroupFeed';
import MessagesFeed from '../components/MessageFeed';
import MessagesForm from '../components/MessageForm';
import checkAuth from '../components/lib/CheckAuth';

export default function MessageGroupNewPage() {
  const [otherUser, setOtherUser] = React.useState(null);
  const [messageGroups, setMessageGroups] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [popped, setPopped] = React.useState([]);
  const [user, setUser] = React.useState(null);
  const dataFetchedRef = React.useRef(false);
  const params = useParams();

  const loadUserShortData = async () => {
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/users/@${params.handle}/short`
      const res = await fetch(backend_url, {
        method: "GET"
      });
      
      let resJson = await res.json();
      if (res.status === 200) {
        console.log('other user:', resJson)
        setOtherUser(resJson)
      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  };

  const loadMessageGroupsData = async () => {
    try {
      const backend_url = `${process.env.REACT_APP_BACKEND_URL}/api/message_groups`
      const session = await fetchAuthSession();
      const accessToken = session?.tokens?.accessToken;
      
      const res = await fetch(backend_url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        method: "GET"
      });
      
      let resJson = await res.json();
      if (res.status === 200) {
        setMessageGroups(resJson)
      } else {
        console.log(res)
      }
    } catch (err) {
      console.log(err);
    }
  };

  React.useEffect(() => {
    if (dataFetchedRef.current) return;
    dataFetchedRef.current = true;

    loadMessageGroupsData();
    loadUserShortData();
    checkAuth(setUser);
  }, [])

  return (
    <article>
      <DesktopNavigation user={user} active={'messages'} setPopped={setPopped} />
      <section className='message_groups'>
        <MessageGroupFeed otherUser={otherUser} message_groups={messageGroups} />
      </section>
      <div className='content messages'>
        <MessagesFeed messages={messages} />
        <MessagesForm setMessages={setMessages} />
      </div>
    </article>
  );
}
```
What this does:

Loads target user: Fetches profile data for user you're messaging
Shows in feed: MessageGroupFeed displays target user at top
Empty messages: No messages yet (new conversation)
Form ready: MessageForm prepared to send first message
URL parameter: Extracts handle from /messages/new/:handle

User flow:

Navigate to /messages/new/goldgrill
See "Trinidad James @goldgrill" highlighted at top of left sidebar
Type message in form
Click "Message" button
Backend creates conversation
Redirect to /messages/{new_message_group_uuid}


### 10. UI/UX Improvements
10.1 Scroll Container Fix
Problem: Entire page was scrolling instead of just the message container, causing navigation to disappear.
Root cause: No explicit scroll boundaries defined in CSS.
Solution implemented:
MessageGroupPage.css:
```css
body {
  overflow: hidden; /* Prevents body scroll */
}

.content.messages {
  height: calc(100vh - 80px); /* Fixed height based on viewport */
  display: flex;
  flex-direction: column;
}
```
MessageFeed.css:
```css
.message_feed {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.message_feed_heading {
  flex-shrink: 0; /* Fixed header */
}

.message_feed_collection {
  flex: 1; /* Takes remaining space */
  overflow-y: auto; /* Scrollable container */
  overflow-x: hidden;
}
```
What this achieves:

Page doesn't scroll: Body has overflow: hidden
Container fills viewport: calc(100vh - 80px) accounts for nav height
Messages scroll: Only message_feed_collection has scrollbar
Header stays fixed: flex-shrink: 0 prevents header from compressing

Testing performed: Loaded 50+ messages, verified only message container scrolls, navigation remains visible.
10.2 Auto-Scroll Implementation
First attempt (failed):
```javascript
// Attempted to scroll entire page
React.useEffect(() => {
  window.scrollTo(0, document.body.scrollHeight);
}, [props.messages]);
```
Problem: Scrolled wrong container, broke navigation visibility.
Final solution (successful):
```javascript
const messagesFeedRef = React.useRef(null);

React.useEffect(() => {
  if (messagesFeedRef.current) {
    messagesFeedRef.current.scrollTop = messagesFeedRef.current.scrollHeight;
  }
}, [props.messages]);

// In JSX:
<div className='message_feed_collection' ref={messagesFeedRef}>
```
Why this works:

Direct DOM manipulation: scrollTop = scrollHeight scrolls to bottom
Correct container: Targets message_feed_collection, not window
React ref: Access to actual DOM element
Dependency array: Triggers when messages change
No animation: Instant scroll (behavior: "auto" implicit)

10.3 Form Clearing After Send
Before (bootcamp code):
```javascript
if (res.status === 200) {
  props.setMessages(current => [...current, data]);
  // Message stays in textarea
}
```
After (my improvement):
```javascript
if (res.status === 200) {
  props.setMessages(current => [...current, data]);
  setMessage('');     // Clear textarea
  setCount(0);        // Reset character count
}
```
UX improvement: User doesn't need to manually clear the input after sending.
10.4 Character Counter with Error Styling
Implementation:
```javascript
const [count, setCount] = React.useState(0);

const classes = []
classes.push('count')
if (1024-count < 0){
  classes.push('err')  // Add error class when over limit
}

// In JSX:
<div className={classes.join(' ')}>{1024-count}</div>
```
CSS (MessageForm.css):
```css
.count {
  color: #888;
}

.count.err {
  color: #ff4444; /* Red when over limit */
  font-weight: bold;
}
```

**What this does:**
1. **Shows remaining characters**: "1024" → "1023" → ... → "0" → "-1"
2. **Visual warning**: Turns red when negative
3. **Dynamic classes**: JavaScript array join for conditional CSS



### 11. Debugging and Problem Solving

11.1 SQL Syntax Error - Trailing Semicolon

**Error encountered:**
---
psycopg.errors.SyntaxError: syntax error at or near ";"
LINE 19:   users.handle = $2;

Context: This error occurred when trying to create messages.
Investigation process:

Checked SQL file location: /backend-flask/db/sql/activities/users/create_message_users.sql
Examined db.query_array_json() method in lib/db.py
Discovered query wrapping:

```python
def query_wrap_array(self, template):
  sql = f"""
  (SELECT COALESCE(array_to_json(array_agg(row_to_json(array_row))),'[]'::json) FROM (
  {template}
  ) array_row);
  """
  return sql
```
Root cause: The SQL template had a trailing semicolon:
```sql
WHERE
  users.cognito_user_id = %(cognito_user_id)s
  OR 
  users.handle = %(user_receiver_handle)s;  -- ❌ This semicolon
```
When wrapped, it became invalid syntax:
```sql
(SELECT ... FROM (
  SELECT ... WHERE ... ;  -- Semicolon inside subquery!
) array_row);
```
Solution:
```sql
WHERE
  users.cognito_user_id = %(cognito_user_id)s
  OR 
  users.handle = %(user_receiver_handle)s  -- ✅ No semicolon
```

**Lesson learned**: SQL templates that get wrapped should never have trailing semicolons. The wrapper adds them automatically.

### 11.2 DynamoDB Region Configuration Error

**Error encountered:**

botocore.exceptions.NoRegionError: You must specify a region.

Context: Error occurred when trying to list message groups.
Investigation process:

Checked DynamoDB client creation in lib/ddb.py

Verified environment variables in docker-compose.yml
Found mismatch: AWS_REGION set but code looked for AWS_DEFAULT_REGION

Root cause: DynamoDB client not configured with region:
```python
def client():
  endpoint_url = os.getenv("AWS_ENDPOINT_URL")
  if endpoint_url:
    attrs = { 'endpoint_url': endpoint_url }
  else:
    attrs = {}
  dynamodb = boto3.client('dynamodb', **attrs)  # ❌ No region!
  return dynamodb
```
Solution implemented:
Updated docker-compose.yml:
```yaml
backend-flask:
  environment:
    AWS_REGION: "${AWS_DEFAULT_REGION}"
    AWS_DEFAULT_REGION: "${AWS_DEFAULT_REGION}"  # Added this
```
Updated lib/ddb.py:
```python
@staticmethod
def client():
  endpoint_url = os.getenv("AWS_ENDPOINT_URL")
  if endpoint_url:
    attrs = { 'endpoint_url': endpoint_url }
  else:
    attrs = {}
  
  # ✅ Add region with fallback logic
  attrs['region_name'] = os.getenv('AWS_DEFAULT_REGION') or os.getenv('AWS_REGION', 'us-east-1')
  
  dynamodb = boto3.client('dynamodb', **attrs)
  return dynamodb
```

**Lesson learned**: boto3 requires explicit region configuration, even for local DynamoDB. Always set region_name in attrs.

### 11.3 Frontend/Backend Key Mismatch

**Error encountered:**

KeyError: 'user_receiver_handle'

Context: Sending new message from frontend resulted in 500 error.
Investigation process:

Checked browser console - saw 500 error
Checked backend logs - found KeyError
Compared frontend JSON payload to backend expectations
Found mismatch in key names

Root cause: Frontend and backend using different keys:
Frontend (MessageForm.js):
```javascript
if (params.handle) {
  json.user_receiver_handle = params.handle  // ❌ Wrong key
}
```
Backend (app.py):
```python
user_receiver_handle = request.json.get('handle', None)  // Expects 'handle'
```
Solution:
```javascript
if (params.handle) {
  json.handle = params.handle  // ✅ Correct key
}
```
Lesson learned: Frontend and backend contracts must match exactly. Using .get() with default prevents crashes but doesn't solve the underlying mismatch.
11.4 Wrong DynamoDB Partition Key Prefix
Error encountered: Empty array returned when querying for messages.
Context: Message groups loaded correctly, but individual messages didn't appear.
Investigation process:

Verified data exists with ./bin/ddb/patterns/list-conversations
Checked query parameters in list_messages method
Discovered incorrect partition key prefix

Root cause: Using GRP# instead of MSG#:
Wrong code:
```python
def list_messages(client, message_group_uuid):
  query_params = {
    'ExpressionAttributeValues': {
      ':pkey': {'S': f"GRP#{message_group_uuid}"}  # ❌ Wrong prefix!
    }
  }
```
Correct code:
```python
def list_messages(client, message_group_uuid):
  query_params = {
    'ExpressionAttributeValues': {
      ':pkey': {'S': f"MSG#{message_group_uuid}"}  # ✅ Correct prefix
    }
  }
```

**Data structure:**
- `GRP#{user_uuid}` = Message groups (conversations list)
- `MSG#{message_group_uuid}` = Individual messages in conversation

**Lesson learned**: DynamoDB single-table design requires strict partition key conventions. Document and verify prefix patterns.

### 11.5 Import Path Issues - CheckAuth Module

**Error encountered:**

Uncaught Error: Cannot find module '../lib/CheckAuth'
Context: Multiple pages failing to load after creating CheckAuth utility.
Investigation process:

Verified file exists at intended location
Checked actual file path in VS Code
Compared import statements across files
Found inconsistency in directory structure

Root cause: File created in wrong location:
Expected location: src/lib/CheckAuth.js
Actual location: src/components/lib/CheckAuth.js
Imports looking for: ../lib/CheckAuth
Should be: ../components/lib/CheckAuth
Solution: Verified actual file location and updated all imports:
```javascript
// All pages now use:
import checkAuth from '../components/lib/CheckAuth';
```

**Lesson learned**: File system organization must match import paths exactly. Use VS Code's file explorer to verify paths before debugging.

### 11.6 SQL File Path Error - users_short.py

**Error encountered:**

FileNotFoundError: [Errno 2] No such file or directory: '/backend-flask/db/sql/users/short.sql'
Context: Navigating to /messages/new/:handle resulted in 500 error.
Investigation process:

Backend logs showed FileNotFoundError
Checked actual file location: db/sql/activities/users/short.sql
Checked service code: db.template('users', 'short')
Found path mismatch

Root cause: Service looking in wrong directory:
users_short.py:
```python
sql = db.template('users', 'short')  # ❌ Looks in sql/users/short.sql
```

**Actual file location:**

backend-flask/db/sql/activities/users/short.sql
Solution:
```python
sql = db.template('activities/users', 'short')  # ✅ Correct path
```
How db.template() works:
```python
def template(self, *args):
  pathing = list((app.root_path, 'db', 'sql',) + args)
  pathing[-1] = pathing[-1] + ".sql"
  template_path = os.path.join(*pathing)
  # Result: /backend-flask/db/sql/{arg1}/{arg2}.sql
```
Lesson learned: SQL template paths must match actual file structure. db.template('a', 'b') → db/sql/a/b.sql.
11.7 Webpack Not Detecting New Files
Error encountered: CheckAuth.js added but still getting "Cannot find module" error.
Context: Created new file, updated imports, but frontend still broken.
Investigation process:

Verified file exists in correct location
Checked imports are correct
Suspected webpack dev server hasn't picked up new file

Root cause: Webpack dev server caches module resolution. New files sometimes not detected until rebuild.
Solutions tried:
Soft restart (failed):
```bash
docker-compose restart frontend-react-js
```
Hard rebuild (succeeded):
```bash
docker-compose down
docker-compose up -d --build
```
Lesson learned: Adding new files to React projects sometimes requires full container rebuild to clear webpack cache.
11.8 Scroll Behavior Debugging
Problem: Auto-scroll scrolling entire page instead of just message container.
Investigation process:

Added console logs to scroll effect:

```javascript
React.useEffect(() => {
  console.log('Scrolling to bottom');
  console.log('scrollHeight:', messagesFeedRef.current?.scrollHeight);
}, [props.messages]);
```

Tested different scroll methods:

window.scrollTo() - Scrolled page (wrong)
scrollIntoView() - Scrolled page (wrong)
Direct scrollTop manipulation - Worked!


Checked CSS scroll container setup
Added overflow: hidden to body
Made message_feed_collection the scroll container

Solution evolution:
Attempt 1 (failed):
```javascript
messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
```
Attempt 2 (failed with delay):
```javascript
setTimeout(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
}, 100);
```
Final solution (worked):
```javascript
const messagesFeedRef = React.useRef(null);

React.useEffect(() => {
  if (messagesFeedRef.current) {
    messagesFeedRef.current.scrollTop = messagesFeedRef.current.scrollHeight;
  }
}, [props.messages]);
```
Lesson learned: scrollIntoView() can scroll unintended containers. Direct scrollTop manipulation with refs is more reliable for specific container scrolling.

12. Security Considerations
12.1 Environment Variable Management
Current approach:
```yaml
# docker-compose.yml
backend-flask:
  environment:
    AWS_ACCESS_KEY_ID: "${AWS_ACCESS_KEY_ID}"
    AWS_SECRET_ACCESS_KEY: "${AWS_SECRET_ACCESS_KEY}"
```
Security issues:

Credentials visible in plain text
Could be committed to version control
Shared across all developers

Better practices discussed:
1. AWS Secrets Manager (Production):
```python
import boto3
import json

def get_secret(secret_name):
    client = boto3.client('secretsmanager', region_name='us-east-1')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

# Usage:
db_secrets = get_secret('cruddur/db/credentials')
CONNECTION_URL = f"postgresql://{db_secrets['username']}:{db_secrets['password']}@..."
```
Benefits:

Secrets never in code
Automatic rotation
Audit logging
IAM-based access control

2. .env Files with .gitignore (Development):
```bash
# .env (not committed)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=abc123...
POSTGRES_PASSWORD=secure_password
```
```gitignore
# .gitignore
.env
.env.local
.env.*.local
```
```yaml
# docker-compose.yml
backend-flask:
  env_file:
    - .env
```
4. GitHub Codespaces Secrets (My environment):

Stored in GitHub repository settings
Automatically injected as environment variables
Encrypted at rest
Not visible in logs

Current status: Using environment variables for development, plan to migrate to AWS Secrets Manager for production deployment.
12.2 JWT Token Security
Implementation:

Tokens stored in AWS Amplify secure storage (not localStorage)
Automatic token refresh before expiration
Tokens passed in Authorization header (not URL)
Backend validates every request with Cognito

Security improvements over bootcamp:

Migrated from localStorage to AWS Amplify
Removed manual token management
Automatic expiration handling

12.3 Public vs Private Endpoints
Public endpoints (no auth required):

/api/users/@<handle>/short - Basic user lookup

Private endpoints (auth required):

/api/messages - Create message
/api/messages/<uuid> - List messages
/api/message_groups - List conversations

Rationale: User lookup must be public to enable starting new conversations. All message content requires authentication.
12.4 CORS Configuration
Current configuration:
```python
cors = CORS(
  app,
  resources={r"/api/*": {
    "origins": [frontend, backend],
    "allow_headers": ["Authorization", "Content-Type", "if-modified-since"],
    "expose_headers": ["location", "link", "Authorization"],
    "methods": ["OPTIONS", "GET", "HEAD", "POST"]
  }}
)
```
Security considerations:

Whitelist-based origins (not *)
Specific allowed headers
Specific allowed methods
Preflight request handling with OPTIONS


### 13. Testing and Validation
13.1 Manual Testing Performed
Message Groups:

✅ Load conversation list for authenticated user
✅ Display other user's name and handle
✅ Show last message preview
✅ Display relative timestamps (5m, 2h, Nov 26)
✅ Click to open conversation
✅ Empty state when no conversations exist

Individual Messages:

✅ Load all messages in conversation
✅ Display in chronological order (oldest first)
✅ Show sender's name and handle
✅ Auto-scroll to bottom on load
✅ Distinguish my messages from other user's messages
✅ Handle empty conversation state

Sending Messages:

✅ Send message to existing conversation
✅ Message appears immediately in UI
✅ Form clears after send
✅ Character counter updates correctly
✅ Error styling when over 1024 characters
✅ Authentication required (401 if not logged in)

New Conversations:

✅ Navigate to /messages/new/goldgrill
✅ Target user appears highlighted at top
✅ Send first message creates conversation
✅ Redirect to new conversation after send
✅ Both users can see conversation
✅ 404 if target user doesn't exist

Authentication:

✅ JWT token retrieved on page load
✅ Token included in all API requests
✅ 401 response for invalid tokens
✅ Redirect to login when unauthenticated
✅ User info displayed in navigation

Scroll Behavior:

✅ Only message container scrolls (not page)
✅ Navigation stays visible when scrolling
✅ Auto-scroll to bottom on conversation load
✅ Scroll position maintained when sending message
✅ Works with 1, 10, 50+ messages

13.2 Database Verification
PostgreSQL checks:
```bash
./bin/db/connect

SELECT * FROM users;
```
Verified:

✅ Chris Fenton exists with correct cognito_user_id
✅ Antwuan Jacobs exists
✅ Trinidad James added successfully
✅ All users have valid UUIDs

DynamoDB checks:
```bash
./bin/ddb/patterns/list-conversations
```
Verified:

✅ Message groups created for both users
✅ message_group_uuid consistent across items
✅ User info properly denormalized
✅ Timestamps in ISO 8601 format
✅ Messages have unique message_uuid

13.3 Network Traffic Analysis
Used Chrome DevTools Network tab to verify:
GET /api/message_groups:

✅ Status: 200 OK
✅ Authorization header present
✅ Response: Array of message groups
✅ CORS headers present

GET /api/messages/{uuid}:

✅ Status: 200 OK
✅ Authorization header present
✅ Response: Array of messages
✅ Messages in chronological order

POST /api/messages:

✅ Status: 200 OK
✅ Authorization header present
✅ Request body: { message, message_group_uuid } or { message, handle }
✅ Response: Message object or { message_group_uuid }

GET /api/users/@goldgrill/short:

✅ Status: 200 OK
✅ No authorization required
✅ Response: { uuid, handle, display_name }

13.4 Error Scenarios Tested
Invalid authentication:

Removed auth token → Got 401 response ✅
Expired token → Auto-refresh triggered ✅

Invalid data:

Empty message → Error: "message_blank" ✅
Message > 1024 chars → Error: "message_exceed_max_chars" ✅
Missing message_group_uuid in update mode → Error ✅

Network failures:

Backend offline → Error displayed in console ✅
Slow network → Loading state maintained ✅

Edge cases:

No conversations → Empty state displayed ✅
New user with no history → Works correctly ✅
Conversation with single message → Displays properly ✅


14. Code Quality Improvements Over Bootcamp
14.1 AWS Amplify Migration
Bootcamp approach (outdated):
```javascript
headers: {
  'Authorization': `Bearer ${localStorage.getItem("access_token")}`
}
```
My approach (modern):
```javascript
const session = await fetchAuthSession();
const accessToken = session?.tokens?.accessToken;
if (accessToken) {
  headers['Authorization'] = `Bearer ${accessToken}`;
}
```
Improvements:

Secure token storage (not localStorage)
Automatic token refresh
Better error handling
Industry-standard practice

14.2 Static Method Decorators
Bootcamp code:
```python
class Ddb:
  def client():  # Missing @staticmethod
    ...
```
My code:
```python
class Ddb:
  @staticmethod
  def client():
    ...
```
Why this matters:

Allows calling Ddb.client() without instantiation
Clearer intent (these are utility methods)
Prevents accidental instance method bugs
Python best practice

14.3 Region Configuration
Bootcamp code:
```python
dynamodb = boto3.client('dynamodb', **attrs)
```
My code:
```python
attrs['region_name'] = os.getenv('AWS_DEFAULT_REGION') or os.getenv('AWS_REGION', 'us-east-1')
dynamodb = boto3.client('dynamodb', **attrs)
```
Why this matters:

Prevents NoRegionError at runtime
Explicit configuration over implicit
Fallback logic for different environments
Production-ready

14.4 Parameter Naming
Bootcamp code:
```python
':pk': {'S': f"GRP#{my_user_uuid}"}
```
My code:
```python
':pkey': {'S': f"GRP#{my_user_uuid}"}
```
Why this matters:

Avoids confusion between :pk placeholder and pk attribute
More descriptive
Easier to debug
Less ambiguous

14.5 Form UX Improvements
Bootcamp code:
```javascript
if (res.status === 200) {
  props.setMessages(current => [...current, data]);
  // Input stays populated
}
```
My code:
```javascript
if (res.status === 200) {
  props.setMessages(current => [...current, data]);
  setMessage('');
  setCount(0);
}
```
Why this matters:

Better user experience
Reduces user action steps
Prevents double-sends
Standard messaging UI pattern

14.6 Error Handling Separation
Bootcamp code:
```javascript
try {
  const backend_url = ...
  const session = await fetchAuthSession();
  const res = await fetch(backend_url, ...);
} catch (err) {
  console.log(err);
}
```
My code:
```javascript
try {
  const session = await fetchAuthSession();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
} catch (err) {
  console.log('Error fetching session:', err);
}

try {
  const res = await fetch(backend_url, ...);
} catch (err) {
  console.log(err);
}
```
Why this matters:

Separates auth errors from API errors
More granular error handling
Allows auth failure without blocking request
Better debugging

14.7 Debug Logging
Bootcamp code:
```python
def create_message_group(...):
  # No debug output
  response = client.batch_write_item(RequestItems=items)
  return {...}
```
My code:
```python
def create_message_group(...):
  print('== create_message_group.1')
  # ... setup code
  print('== create_message_group.2')
  # ... more setup
  print('== create_message_group.try')
  response = client.batch_write_item(RequestItems=items)
  return {...}
```
Why this matters:

Step-by-step execution tracing
Easier debugging when things go wrong
Production-ready logging hooks
Clear execution flow visibility


15. Key Learnings and Takeaways
15.1 Technical Skills Acquired
AWS Services:

DynamoDB single-table design patterns
AWS Cognito JWT token verification
AWS Amplify v6 authentication
DynamoDB Local for development
IAM roles and permissions concepts

Backend Development:

Flask routing and middleware
CORS configuration
Service layer architecture
SQL template systems
Error handling patterns
JWT token validation

Frontend Development:

React hooks (useState, useEffect, useRef)
React Router v6 with useParams
Component composition patterns
Form state management
CSS flexbox layouts
Scroll container management

Database Design:

Dual-database architecture (PostgreSQL + DynamoDB)
NoSQL access patterns
Denormalization strategies
Partition key design
Sort key optimization

15.2 Problem-Solving Methodology
Developed systematic debugging approach:

Read error message carefully

Extract exact error and line number
Identify error type (syntax, runtime, logic)



Verify assumptions
Check file paths match code references

Verify environment variables are set
Confirm database tables exist


Add logging

Print statements at key decision points
Log input parameters
Output intermediate values


Test in isolation

Verify SQL queries in psql directly
Test DynamoDB queries with AWS CLI
Curl backend endpoints independently


Compare with working code

Reference bootcamp examples
Check documentation
Review previous successful implementations


Incremental fixes

Change one thing at a time
Test after each change
Document what worked



Example application - SQL Syntax Error:

Read error: "syntax error at or near ';'"
Checked file: create_message_users.sql exists
Added logging: db.template() path construction
Tested SQL directly in psql: worked fine
Compared with other SQL templates: found semicolon difference
Removed semicolon: error resolved

15.3 Architectural Insights
Why Dual Database Architecture:
PostgreSQL strengths:

ACID transactions for user accounts
Complex joins for user relationships
Referential integrity
Mature ecosystem
SQL query flexibility

DynamoDB strengths:

Horizontal scalability for messages
Single-digit millisecond latency
Predictable performance at any scale
No schema migrations
Pay-per-request pricing

Design decision: Use each database for what it does best. PostgreSQL as source of truth for identity, DynamoDB for high-volume messaging.
Alternative considered: PostgreSQL for everything

Rejected because: Message tables would grow unbounded, query performance would degrade, scaling would require complex sharding

Alternative considered: DynamoDB for everything

Rejected because: Complex user relationship queries difficult, ACID compliance harder, less mature tooling for user management

15.4 DynamoDB Access Pattern Understanding
Single Table Design Benefits:

Fewer API calls: Related data in one query
Lower cost: Fewer read operations
Atomic operations: Batch writes ensure consistency
Flexible schema: Add attributes without migrations

Partition Key Strategy:
GRP#{user_uuid} → All conversations for this user
MSG#{message_group_uuid} → All messages in this conversation

Why this works:

Each user's conversations: Single partition query
Each conversation's messages: Single partition query
No scans needed (expensive)
Efficient even at millions of messages

Sort Key Strategy:

ISO timestamps enable chronological ordering
begins_with allows year-based filtering
Natural expiration strategy (query current year only)

15.5 React State Management Patterns
Learned when to use different hooks:
useState - Component-level state:
```javascript
const [messages, setMessages] = React.useState([]);
const [count, setCount] = React.useState(0);
```
useEffect - Side effects and data loading:
```javascript
React.useEffect(() => {
  loadData();
  checkAuth(setUser);
}, [])  // Empty array = run once on mount
```
useRef - DOM references and preventing re-renders:
```javascript
const messagesFeedRef = React.useRef(null);
const dataFetchedRef = React.useRef(false);
```
useParams - URL parameter extraction:
```javascript
const params = useParams();
const handle = params.handle;
```
Key insight: Refs don't trigger re-renders. Using dataFetchedRef prevents double API calls in StrictMode.
15.6 CSS Layout Mastery
Flexbox container patterns learned:
Pattern 1: Fixed header with scrolling content
```css
.container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header {
  flex-shrink: 0;  /* Never shrink */
}

.content {
  flex: 1;  /* Take remaining space */
  overflow-y: auto;
}
```
Pattern 2: Preventing page scroll
```css
body {
  overflow: hidden;
}

.page-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
```
Pattern 3: Nested scroll containers
```css
.outer {
  height: calc(100vh - 80px);
}

.inner-scroll {
  height: 100%;
  overflow-y: auto;
}
```

**Critical understanding**: For `height: 100%` to work, every parent must have a defined height.

### 15.7 Authentication Flow Understanding

**Complete authentication flow:**

1. **User signs in** → AWS Cognito
2. **Cognito returns tokens** → Access token, ID token, Refresh token
3. **Amplify stores tokens** → Secure storage (not localStorage)
4. **Frontend requests data** → Retrieves access token from Amplify
5. **Token in Authorization header** → `Bearer {token}`
6. **Backend receives request** → Extracts token from header
7. **Backend verifies token** → Calls Cognito to validate
8. **Cognito confirms validity** → Returns user claims (sub, email, etc.)
9. **Backend processes request** → Uses cognito_user_id from claims
10. **Response to frontend** → Data or error

**Security checkpoints:**
- Token expiration (1 hour)
- Token refresh (automatic by Amplify)
- Token signature verification (Cognito)
- User existence check (PostgreSQL)

### 15.8 Error Message Interpretation Skills

**Learned to read Python tracebacks:**

File "/backend-flask/app.py", line 488, in data_users_short
  data = UsersShort.run(handle)
File "/backend-flask/services/users_short.py", line 5, in run
  sql = db.template('users','short')
File "/backend-flask/lib/db.py", line 22, in template
  with open(template_path, 'r') as f:
FileNotFoundError: [Errno 2] No such file or directory


**Reading strategy:**
1. Start at bottom: Actual error and file
2. Work up: Call stack showing execution path
3. Identify my code: Differentiate from library code
4. Find line numbers: Exact location of problem

**Learned to read JavaScript console errors:**

Uncaught Error: Cannot find module '../lib/CheckAuth'
  at webpackMissingModule (HomeFeedPage.js:13:1)
Reading strategy:

Error type: Module resolution error
Module name: What's missing
File location: Where import attempted
Action: Verify file path and location

15.9 Environment Configuration Lessons
Environment variable hierarchy learned:

Local .env file (highest priority)
docker-compose.yml environment section
Dockerfile ENV statements
System environment variables (lowest priority)

Debugging environment variables:
```bash
# Inside container
docker exec -it backend-flask bash
echo $AWS_DEFAULT_REGION
env | grep AWS
```

**Best practices established:**
- Never commit .env files
- Document all required variables
- Provide .env.example template
- Use defaults when sensible
- Validate on startup

### 15.10 Git Workflow Improvements

**Commit message pattern developed:**

feat: Add DynamoDB message creation

- Implement create_message_group method in ddb.py
- Add batch_write_item for atomic operations
- Create bilateral message group entries
- Fix region configuration bug

Resolves issue with new conversations not appearing
Commit types used:

feat: - New features
fix: - Bug fixes
refactor: - Code restructuring
docs: - Documentation updates
style: - Formatting changes
test: - Testing additions

Branch strategy:

main - Stable code
week-5-messaging - Feature development
bugfix/sql-syntax - Specific bug fixes

15.11 Documentation Habits Formed
What I document:

Why decisions were made (not just what)
Failed approaches and reasons
Configuration requirements
API contracts
Database schemas
Error solutions

Example good documentation:
```python
def create_message_group(...):
    """
    Create a new conversation with bilateral visibility.
    
    Creates 3 DynamoDB items:
    1. Message group for sender (GRP#{sender_uuid})
    2. Message group for receiver (GRP#{receiver_uuid})  
    3. First message in conversation (MSG#{message_group_uuid})
    
    All items share the same message_group_uuid for linking.
    Uses batch_write_item for atomic operation.
    
    Args:
        client: DynamoDB client
        message: First message text
        my_user_uuid: Sender's UUID
        other_user_uuid: Receiver's UUID
        
    Returns:
        dict: {'message_group_uuid': str} or None on error
    """
```
### 15.12 Testing Strategies Developed
Manual testing checklist created:
markdown## Message Creation Tests
- [ ] Create new conversation
- [ ] Send to existing conversation
- [ ] Empty message validation
- [ ] Character limit validation
- [ ] Authentication required
- [ ] Both users see conversation
- [ ] Message appears immediately
- [ ] Form clears after send

#### UI/UX Tests
- [ ] Auto-scroll on load
- [ ] Scroll only message container
- [ ] Character counter updates
- [ ] Error styling at limit
- [ ] Navigation stays visible
- [ ] Loading states display
Learned to test edge cases:

Empty states (no messages, no conversations)
Boundary conditions (1024 chars exactly)
Network failures (offline backend)
Auth failures (expired tokens)
Invalid data (missing required fields)

15.13 Performance Considerations
Optimizations implemented:
1. DynamoDB Query Optimization:
```python
# Year filtering reduces scanned items
'KeyConditionExpression': 'pk = :pkey AND begins_with(sk, :year)'
```
2. Denormalization for Read Performance:
```python
# User info stored in message for display without joins
'user_display_name': {'S': my_user_display_name},
'user_handle': {'S': my_user_handle}
```
3. Pagination Ready:
```python
'Limit': 20,  # Only load 20 most recent
# Can add ExclusiveStartKey for pagination
```
4. Connection Pooling:
```python
# PostgreSQL connection pool
from psycopg_pool import ConnectionPool
self.pool = ConnectionPool(connection_url)
```
Performance metrics noted:

Message list query: ~50ms
Individual message load: ~100ms
New message creation: ~150ms
Message group creation: ~200ms

Future optimizations identified:

Add DynamoDB GSI for faster message lookups
Implement frontend caching
Add WebSocket for real-time updates
Lazy load older messages

15.14 Security Awareness Developed
Threats understood:
1. SQL Injection:

Risk: Malicious SQL in user input
Mitigation: Parameterized queries with %(param)s
Never: String concatenation for SQL

2. XSS (Cross-Site Scripting):

Risk: Malicious JavaScript in messages
Mitigation: React automatically escapes content
Danger: Using dangerouslySetInnerHTML

3. CSRF (Cross-Site Request Forgery):

Risk: Unauthorized actions from other sites
Mitigation: JWT tokens, CORS configuration
Validation: Check token on every request

4. Token Theft:

Risk: Stolen tokens used maliciously
Mitigation: Short expiration (1 hour)
Best practice: HTTPS only, secure storage

5. NoSQL Injection:

Risk: Malicious DynamoDB expressions
Mitigation: Parameterized expressions
Validation: Type checking on inputs

15.15 Collaboration and Communication
Skills developed:
Reading documentation:

AWS documentation for DynamoDB API
React documentation for hooks
boto3 documentation for Python SDK
Amplify documentation for auth

Asking for help:

Provide error messages
Share code context
Explain what I've tried
Minimal reproducible example

Code review mindset:

Review my own code before committing
Compare with best practices
Consider maintainability
Think about future developers

15.16 Time Management Lessons
Time spent breakdown:

Planning and design: 2 hours
Initial implementation: 8 hours
Debugging and fixes: 6 hours
Testing and validation: 2 hours
Documentation: 2 hours
Total: ~20 hours

Most time-consuming tasks:

Authentication migration (4 hours)
DynamoDB integration debugging (3 hours)
Scroll behavior fixing (2 hours)
SQL template path issues (1.5 hours)

Lessons learned:

Plan before coding saves time
Read error messages carefully first
Test incrementally (catch bugs early)
Document as you go (not after)
Take breaks when stuck

15.17 Future Potential Enhancements Identified
Features to add:

1. Message Editing:
python
# Would need:
- Update DynamoDB item
- Add 'edited_at' attribute
- Frontend edit UI
- Optimistic UI updates
2. Read Receipts:
python
# Would need:
- Add 'read_by' attribute
- Update on message view
- Display read status
- Update timestamp
3. Typing Indicators:
javascript
// Would need:
- WebSocket connection
- Emit typing events
- Display indicator UI
- Timeout after 3 seconds
4. File Attachments:
python
# Would need:
- S3 bucket for storage
- Upload API endpoint
- Image preview component
- File type validation
5. Search Messages:
python
# Would need:
- DynamoDB GSI on message text
- Or ElasticSearch integration
- Search UI component
- Highlight results
6. Message Reactions:
python
# Would need:
- Add reactions array attribute
- Update DynamoDB item
- Reaction picker UI
- Animation on add
7. Group Conversations:
python
# Would need:
- Multiple participants array
- Group metadata (name, avatar)
- Admin permissions
- Member management UI


---

## Final Reflection

Week 5 was transformative. I went from understanding basic AWS services to implementing a production-ready messaging system with dual-database architecture, modern authentication, and polished UI/UX.

**Biggest challenges overcome:**
1. **Migrating to AWS Amplify** - Required understanding JWT tokens, secure storage, and token lifecycle
2. **DynamoDB single-table design** - Counterintuitive coming from relational databases
3. **CSS scroll containers** - Understanding flexbox, overflow, and height inheritance
4. **Debugging across layers** - Frontend, backend, database coordination

**Most valuable skills gained:**
1. **Systematic debugging** - Error message interpretation, logging, isolation testing
2. **AWS service integration** - Cognito, DynamoDB, IAM concepts
3. **Full-stack thinking** - Frontend/backend contracts, data flow, state management
4. **Production mindset** - Security, performance, error handling, documentation

**Confidence level increase:**
- **Before Week 5**: Comfortable with frontend, uncertain about AWS services
- **After Week 5**: Confident building scalable AWS applications end-to-end

**What I'm most proud of:**
Not just completing the bootcamp requirements, but improving upon them with better security (AWS Amplify), better code quality (@staticmethod decorators, region config), better UX (form clearing, auto-scroll), and comprehensive documentation.

**Ready for Week 6** with the knowledge that I can debug complex multi-layer issues, integrate AWS services effectively, and build production-quality features. 🚀

---

## Appendix: Complete File Inventory

### Backend Files Created
```
backend-flask/
├── bin/
│   └── ddb/
│       ├── drop
│       ├── schema-load
│       ├── seed
│       └── patterns/
│           └── list-conversations
├── db/
│   └── sql/
│       └── activities/
│           └── users/
│               ├── create_message_users.sql
│               ├── short.sql
│               └── uuid_from_cognito_user_id.sql
├── lib/
│   └── ddb.py
└── services/
    ├── create_message.py
    ├── message_groups.py
    ├── messages.py
    └── users_short.py
```

### Frontend Files Created
```
frontend-react-js/
└── src/
    ├── components/
    │   ├── lib/
    │   │   └── CheckAuth.js
    │   ├── MessageFeed.js
    │   ├── MessageFeed.css
    │   ├── MessageForm.js
    │   ├── MessageGroupFeed.js
    │   ├── MessageGroupItem.js
    │   └── MessageGroupNewItem.js
    └── pages/
        ├── MessageGroupsPage.js
        ├── MessageGroupPage.js
        ├── MessageGroupPage.css
        └── MessageGroupNewPage.js
```

### Configuration Files Modified
```
├── docker-compose.yml
└── backend-flask/
    └── app.py
Total Lines of Code Written

Backend Python: ~800 lines
Frontend JavaScript: ~600 lines
SQL Templates: ~100 lines
CSS: ~150 lines
Configuration: ~50 lines
Total: ~1,700 lines of code

