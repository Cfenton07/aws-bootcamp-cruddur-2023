# Import datetime utilities for handling timestamps and time calculations
from datetime import datetime, timedelta, timezone 
# Import the database utility object for executing SQL queries
from lib.db import db 

class CreateActivity:
  # @staticmethod decorator allows this method to be called without creating a class instance
  # This is useful for utility functions that don't need access to instance data (self)
  @staticmethod
  def run(message, cognito_user_id, ttl):
    # ============================================================
    # DEBUG LOGGING: Print incoming parameters for troubleshooting
    # ============================================================
    print('='*60)
    print('🔍 CreateActivity.run() called!')
    print(f'   message: {message}')
    print(f'   cognito_user_id: {cognito_user_id}')
    print(f'   ttl: {ttl}')
    print('='*60)
    
    # ============================================================
    # INITIALIZE RESPONSE MODEL
    # ============================================================
    # Create a dictionary to hold the response
    # 'errors': will contain validation error messages if any occur
    # 'data': will contain the created activity data on success
    model = {
      'errors': None,
      'data': None
    }

    # ============================================================
    # GET CURRENT TIMESTAMP
    # ============================================================
    # Get current time in UTC, then convert to local timezone
    # This will be used to calculate the activity's expiration time
    now = datetime.now(timezone.utc).astimezone() 

    # ============================================================
    # CONVERT TTL STRING TO TIME OFFSET
    # ============================================================
    # TTL (Time-To-Live) determines when the activity expires
    # Convert the user-friendly string (e.g., "7-days") into a timedelta object
    # that can be added to the current time
    if (ttl == '30-days'):
      ttl_offset = timedelta(days=30) 
    elif (ttl == '7-days'):
      ttl_offset = timedelta(days=7) 
    elif (ttl == '3-days'):
      ttl_offset = timedelta(days=3) 
    elif (ttl == '1-day'):
      ttl_offset = timedelta(days=1) 
    elif (ttl == '12-hours'):
      ttl_offset = timedelta(hours=12) 
    elif (ttl == '3-hours'):
      ttl_offset = timedelta(hours=3) 
    elif (ttl == '1-hour'):
      ttl_offset = timedelta(hours=1) 
    else:
      # If TTL doesn't match any expected value, record a validation error
      model['errors'] = ['ttl_blank']

    # ============================================================
    # VALIDATE COGNITO USER ID
    # ============================================================
    # Check if cognito_user_id is provided and not empty
    # cognito_user_id identifies who is creating the activity
    if cognito_user_id == None or len(cognito_user_id) < 1:
      model['errors'] = ['cognito_user_id_blank']

    # ============================================================
    # VALIDATE MESSAGE
    # ============================================================
    # Check if message is provided and within character limits
    # Message is the actual content of the activity/post
    if message == None or len(message) < 1:
      # Message cannot be empty
      model['errors'] = ['message_blank'] 
    elif len(message) > 280:
      # Message cannot exceed 280 characters (like Twitter)
      model['errors'] = ['message_exceed_max_chars'] 

    # ============================================================
    # HANDLE VALIDATION RESULTS
    # ============================================================
    if model['errors']:
      # If there are validation errors, log them and return the invalid data
      # The frontend can use this to show error messages to the user
      print(f'❌ Validation errors: {model["errors"]}')
      model['data'] = {
        'handle':  cognito_user_id,
        'message': message
      }  
    else:
      # ============================================================
      # CREATE ACTIVITY IN DATABASE (Success Path)
      # ============================================================
      print('✅ Validation passed, creating activity...')
      
      # Calculate when the activity should expire
      # by adding the TTL offset to the current time
      expires_at = (now + ttl_offset)
      
      # Insert the activity into the database and get back its UUID
      uuid = CreateActivity.create_activity(cognito_user_id, message, expires_at)
      print(f'✅ Activity created with UUID: {uuid}')
      
      # Retrieve the complete activity object from the database
      # This includes all fields (user info, timestamps, etc.)
      object_json = CreateActivity.query_object_activity(uuid)
      
      # Set the retrieved activity as the response data
      model['data'] = object_json
      print(f'✅ Activity data retrieved: {object_json}')
    
    # ============================================================
    # RETURN RESPONSE MODEL
    # ============================================================
    # Return the model containing either:
    # - errors + submitted data (if validation failed), OR
    # - the complete created activity object (if successful)
    return model

  # ============================================================
  # DATABASE INSERT HELPER METHOD
  # ============================================================
  @staticmethod
  def create_activity(cognito_user_id, message, expires_at):
    """
    Inserts a new activity into the database
    
    Args:
        cognito_user_id: Cognito sub (user id) of the person creating the activity
        message: Content of the activity/post
        expires_at: When the activity should expire
    
    Returns:
        uuid: Unique identifier of the newly created activity
    """
    print(f'🔍 Inserting into database...')
    
    # Load the SQL template file for creating activities
    # This keeps SQL separate from Python code for better organization
    sql = db.template('activities','create')
    
    # Execute the INSERT query with the provided parameters
    # db.query_commit() will:
    # 1. Execute the SQL with the given parameters
    # 2. Commit the transaction to save changes
    # 3. Return the UUID from the RETURNING clause in the SQL
    uuid = db.query_commit(sql,{
      'cognito_user_id': cognito_user_id,
      'message': message,
      'expires_at': expires_at
    })
    
    return uuid
  
  # ============================================================
  # DATABASE QUERY HELPER METHOD
  # ============================================================
  @staticmethod
  def query_object_activity(uuid):
    """
    Retrieves a single activity object from the database by UUID
    
    Args:
        uuid: Unique identifier of the activity to retrieve
    
    Returns:
        JSON object containing the complete activity data including
        user information, message, timestamps, counts, etc.
    """
    print(f'🔍 Querying activity with UUID: {uuid}')
    
    # Load the SQL template for querying a single activity object
    sql = db.template('activities','object')
    
    # Execute the SELECT query and return the result as a JSON object
    # db.query_object_json() will:
    # 1. Execute the SQL query
    # 2. Fetch one row
    # 3. Convert it to a JSON object
    # 4. Return the JSON (or empty object if not found)
    return db.query_object_json(sql,{
      'uuid': uuid
    })