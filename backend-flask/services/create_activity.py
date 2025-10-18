# Import necessary classes from the datetime module for handling time and timezones
from datetime import datetime, timedelta, timezone 

# Import the database utility object (presumably for interacting with a database)
from lib.db import db 

# Define a class named 'CreateActivity' which likely handles the creation of a new activity or post
class CreateActivity:
  # Define the main method to run the activity creation logic
  # It takes the 'message' content, the 'user_handle', and a 'ttl' (Time-To-Live) string as arguments
  def run(message, user_handle, ttl):
    # Initialize a dictionary 'model' to hold the response data and any errors
    model = {
      'errors': None, # Key for storing a list of errors if any occur
      'data': None    # Key for storing the resulting activity data upon success
    }

    # Get the current time in UTC and then convert it to the local timezone
    now = datetime.now(timezone.utc).astimezone() 

    # --- Time-To-Live (TTL) Offset Calculation ---
    
    # Check the 'ttl' string argument to determine the expiration offset
    if (ttl == '30-days'):
      # Set the offset to 30 days
      ttl_offset = timedelta(days=30) 
    elif (ttl == '7-days'):
      # Set the offset to 7 days
      ttl_offset = timedelta(days=7) 
    elif (ttl == '3-days'):
      # Set the offset to 3 days
      ttl_offset = timedelta(days=3) 
    elif (ttl == '1-day'):
      # Set the offset to 1 day
      ttl_offset = timedelta(days=1) 
    elif (ttl == '12-hours'):
      # Set the offset to 12 hours
      ttl_offset = timedelta(hours=12) 
    elif (ttl == '3-hours'):
      # Set the offset to 3 hours
      ttl_offset = timedelta(hours=3) 
    elif (ttl == '1-hour'):
      # Set the offset to 1 hour
      ttl_offset = timedelta(hours=1) 
    else:
      # If 'ttl' does not match any expected value, add an error
      model['errors'] = ['ttl_blank']

    # --- Input Validation ---

    # Validate the 'user_handle': check if it is None or an empty string
    if user_handle == None or len(user_handle) < 1:
      # Add an error if the handle is invalid
      model['errors'] = ['user_handle_blank']

    # Validate the 'message': check if it is None or an empty string
    if message == None or len(message) < 1:
      # Add an error if the message is invalid
      model['errors'] = ['message_blank'] 
    # Check if the message exceeds the maximum allowed length (280 characters)
    elif len(message) > 280:
      # Add an error if the message is too long
      model['errors'] = ['message_exceed_max_chars'] 

    # --- Execution or Error Handling ---

    # Check if any errors were recorded during validation
    if model['errors']:
      # If there are errors, set the 'data' field to return the user's input
      model['data'] = {
        'handle':  user_handle,
        'message': message
      }  
    # If there are no errors, proceed with creating the activity
    else:
      # Calculate the 'expires_at' time by adding the TTL offset to the current time
      expires_at = (now + ttl_offset)
      # Call the helper method to insert the activity into the database and get its UUID
      uuid = CreateActivity.create_activity(user_handle,message,expires_at)

      # Call the helper method to retrieve the newly created activity object from the DB
      object_json = CreateActivity.query_object_activity(uuid)
      # Set the 'data' field of the response model with the retrieved activity object
      model['data'] = object_json
      
    # Return the final model containing data or errors
    return model

  # --- Helper Methods for Database Interaction ---

  # Method to perform the actual database insertion of the new activity
  def create_activity(handle, message, expires_at):
    # Get the SQL template for creating an activity
    sql = db.template('activities','create')
    # Execute the SQL commit (insert) with the activity details
    # The 'db.query_commit' likely returns the UUID of the newly created row
    uuid = db.query_commit(sql,{
      'handle': handle,
      'message': message,
      'expires_at': expires_at
    })
    # Return the UUID
    return uuid
    
  # Method to retrieve the full activity object from the database using its UUID
  def query_object_activity(uuid):
    # Get the SQL template for querying a single activity object
    sql = db.template('activities','object')
    # Execute the SQL query and return the result as a JSON object
    return db.query_object_json(sql,{
      'uuid': uuid
    })