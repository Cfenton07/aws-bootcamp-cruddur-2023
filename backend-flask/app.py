# ============================================================
# FLASK FRAMEWORK AND CORE UTILITIES
# ============================================================
from flask import Flask
from flask import request
from flask_cors import CORS, cross_origin
import os

# ============================================================
# SERVICE LAYER IMPORTS
# ============================================================
# All business logic services for handling different types of activities
from services.home_activities import *
from services.notifications_activities import *
from services.user_activities import *
from services.create_activity import *
from services.create_reply import *
from services.search_activities import *
from services.message_groups import *
from services.messages import *
from services.create_message import *
from services.show_activity import *
from services.users_short import *

# ============================================================
# AUTHENTICATION - AWS COGNITO
# ============================================================
# JWT token verification for authenticated requests
from lib.cognito_jwt_token import CognitoJwtToken, extract_access_token, TokenVerifyError

# ============================================================
# OBSERVABILITY - OPENTELEMETRY (HONEYCOMB)
# ============================================================
# Distributed tracing setup - currently partially disabled in favor of X-Ray
from opentelemetry import trace
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

# ============================================================
# OBSERVABILITY - AWS X-RAY
# ============================================================
# AWS's distributed tracing service - takes priority over OpenTelemetry Flask instrumentation
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.ext.flask.middleware import XRayMiddleware

# ============================================================
# LOGGING - AWS CLOUDWATCH
# ============================================================
# Send application logs to CloudWatch for centralized monitoring
import watchtower
import logging
import sys
import time
from time import strftime

# ============================================================
# ERROR TRACKING - ROLLBAR
# ============================================================
# Third-party error monitoring and tracking service
import rollbar
import rollbar.contrib.flask
from flask import got_request_exception

# ============================================================
# CLOUDWATCH CONFIGURATION
# ============================================================
# Configure log group, region, and stream for CloudWatch Logs
CLOUDWATCH_LOG_GROUP = os.environ.get('CLOUDWATCH_LOG_GROUP', 'cruddur')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
CLOUDWATCH_LOG_STREAM = os.environ.get('CLOUDWATCH_LOG_STREAM', f"app-instance-{int(time.time())}")

# ============================================================
# LOGGER SETUP
# ============================================================
# Configure Python logger to write to both console (STDOUT) and CloudWatch
LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.DEBUG)

# Console handler - logs appear in docker logs
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
LOGGER.addHandler(console_handler)

# CloudWatch handler - logs sent to AWS CloudWatch (requires AWS credentials)
try:
    cw_handler = watchtower.CloudWatchLogHandler(
        log_group_name=CLOUDWATCH_LOG_GROUP,
        log_stream_name=CLOUDWATCH_LOG_STREAM,
        # region_name=AWS_REGION,  # Not used - watchtower auto-detects region from AWS credentials
        create_log_group=True,
        create_log_stream=True,
    )
    LOGGER.addHandler(cw_handler)
    LOGGER.info("CloudWatch logging configured successfully.")
except Exception as e:
    LOGGER.error(f"Failed to configure CloudWatch logging: {e}")

# ============================================================
# OPENTELEMETRY TRACING SETUP
# ============================================================
# Initialize tracer provider and configure to send traces to OTEL Collector
provider = TracerProvider()
processor = BatchSpanProcessor(OTLPSpanExporter())
provider.add_span_processor(processor)

# ============================================================
# X-RAY CONFIGURATION
# ============================================================
# Configure X-Ray recorder with service name and dynamic naming pattern
xray_url = os.getenv("AWS_XRAY_URL")
xray_recorder.configure(service='backend-flask', dynamic_naming=xray_url)

# ============================================================
# COMMENTED OUT: Console trace exporter
# ============================================================
# Would print OpenTelemetry traces to STDOUT for debugging
# Disabled to reduce log noise - using OTEL Collector instead
#simple_processor = SimpleSpanProcessor(ConsoleSpanExporter())
#provider.add_span_processor(simple_processor)

# Set global tracer provider and get tracer instance for this module
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

# ============================================================
# FLASK APP INITIALIZATION
# ============================================================
app = Flask(__name__)

# ============================================================
# COGNITO JWT TOKEN VERIFIER
# ============================================================
# Initialize JWT token verifier with Cognito User Pool configuration
cognito_jwt_token = CognitoJwtToken(
  user_pool_id=os.getenv("AWS_COGNITO_USER_POOL_ID"), 
  user_pool_client_id=os.getenv("AWS_COGNITO_USER_POOL_CLIENT_ID"),
  region=os.getenv("AWS_REGION")
)
 
# ============================================================
# X-RAY MIDDLEWARE
# ============================================================
# Must be initialized FIRST before other Flask instrumentations to avoid conflicts
XRayMiddleware(app, xray_recorder)

# ============================================================
# OPENTELEMETRY INSTRUMENTATION
# ============================================================
# FlaskInstrumentor().instrument_app(app) - DISABLED to prevent conflict with X-Ray middleware
# Only instrumenting outgoing HTTP requests, not the Flask app itself
RequestsInstrumentor().instrument()

# ============================================================
# CORS CONFIGURATION
# ============================================================
# Allow frontend (port 3000) to make requests to backend API (port 4567)
frontend = os.getenv('FRONTEND_URL')
backend = os.getenv('BACKEND_URL')
origins = [frontend, backend]
cors = CORS(
    app,
  resources={r"/api/*": {
    "origins": origins,  # Only allow requests from these origins
    "allow_headers": ["Authorization", "Content-Type", "if-modified-since"],
    "expose_headers": ["location", "link", "Authorization"],
    "methods": ["OPTIONS", "GET", "HEAD", "POST"]
  }}
    # COMMENTED OUT: Old CORS configuration - kept for reference
    # app,
    # resources={r"/api/*": {"origins": origins}},
    # expose_headers="location,link",
    # allow_headers="content-type,if-modified-since",
    # methods="OPTIONS,GET,HEAD,POST"
)

# ============================================================
# REQUEST LOGGING MIDDLEWARE
# ============================================================
# Runs before every request to log incoming request details for debugging
@app.before_request
def log_request_info():
    print('='*70)
    print('🔍 INCOMING REQUEST')
    print(f'   Method: {request.method}')
    print(f'   Path: {request.path}')
    print(f'   Origin: {request.headers.get("Origin", "NO ORIGIN")}')
    print(f'   Authorization header present: {"Authorization" in request.headers}')
    if "Authorization" in request.headers:
        auth_header = request.headers.get("Authorization")
        print(f'   Auth header (first 50 chars): {auth_header[:50]}...')
    print('='*70)

# ============================================================
# ROLLBAR INITIALIZATION
# ============================================================
# Initialize Rollbar error tracking only if access token is provided
rollbar_access_token = os.getenv('ROLLBAR_ACCESS_TOKEN')
if rollbar_access_token:
    rollbar.init(
        rollbar_access_token,
        'production',  # Environment name for error grouping
        root=os.path.dirname(os.path.realpath(__file__)),
        allow_logging_basic_config=False
    )
    # Connect Rollbar to Flask's exception handler
    with app.app_context():
        got_request_exception.connect(rollbar.contrib.flask.report_exception, app)
else:
    print("ROLLBAR_ACCESS_TOKEN not found, Rollbar not initialized.")   

# ============================================================
# ROLLBAR TEST ENDPOINT
# ============================================================
@app.route('/rollbar/test')
def rollbar_test():
    """Send a test message to Rollbar to verify integration"""
    rollbar.report_message('Hello World!', 'warning')
    return "Hello World!"

# ============================================================
# RESPONSE LOGGING MIDDLEWARE
# ============================================================
# Runs after every request to log the response for monitoring
@app.after_request
def after_request(response):
    timestamp = strftime('[%Y-%b-%d %H:%M]')
    LOGGER.error('%s %s %s %s %s %s', timestamp, request.remote_addr, request.method, request.scheme, request.full_path, response.status)
    return response

# ============================================================
# API ENDPOINTS - MESSAGE GROUPS
# ============================================================
@app.route("/api/message_groups", methods=['GET'])
def data_message_groups():
    access_token = extract_access_token(request.headers)
    try:
        claims = cognito_jwt_token.verify(access_token)
        # authenicatied request
        app.logger.debug("authenicated")
        app.logger.debug(claims)
        cognito_user_id = claims['sub']
        model = MessageGroups.run(cognito_user_id=cognito_user_id)
        if model['errors'] is not None:
         return model['errors'], 422
        else:
         return model['data'], 200
    except TokenVerifyError as e:
        # unauthenicatied request
        app.logger.debug(e)
        return {}, 401

# ============================================================
# API ENDPOINTS - DIRECT MESSAGES
# ============================================================
@app.route("/api/messages/<string:message_group_uuid>", methods=['GET', 'OPTIONS'])
@cross_origin()
def data_messages(message_group_uuid):
    access_token = extract_access_token(request.headers)
    try:
        claims = cognito_jwt_token.verify(access_token)
        # authenticated request
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
        # unauthenticated request
        app.logger.debug(e)
        return {}, 401 

@app.route("/api/messages", methods=['POST','OPTIONS'])
@cross_origin()
def data_create_message():
  message_group_uuid   = request.json.get('message_group_uuid',None)
  user_receiver_handle = request.json.get('handle',None)
  message = request.json['message']
  access_token = extract_access_token(request.headers)
  try:
    claims = cognito_jwt_token.verify(access_token)
    # authenicatied request
    app.logger.debug("authenicated")
    app.logger.debug(claims)
    cognito_user_id = claims['sub']
    if message_group_uuid == None:
      # Create for the first time
      model = CreateMessage.run(
        mode="create",
        message=message,
        cognito_user_id=cognito_user_id,
        user_receiver_handle=user_receiver_handle
      )
    else:
      # Push onto existing Message Group
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
    # unauthenicatied request
    app.logger.debug(e)
    return {}, 401


# ============================================================
# API ENDPOINTS - HOME FEED
# ============================================================
@app.route("/api/activities/home", methods=['GET'])
@xray_recorder.capture('activities_home')  # Track this endpoint in X-Ray
def data_home():
    """
    Get home activities feed - supports both authenticated and unauthenticated users
    
    Authentication flow:
    1. Extract JWT token from Authorization header
    2. Verify token with AWS Cognito
    3. If valid: return personalized feed
    4. If invalid/missing: return public feed
    """
    # Extract and verify JWT access token
    access_token = extract_access_token(request.headers)
    
    # COMMENTED OUT: Alternative auth header extraction method
    #auth_header = request.headers.get('Authorization')
    #if not auth_header:
        #return {"error": "Authorization header is missing"}, 401

    try:
        # Verify token and get user claims (throws TokenVerifyError if invalid)
        claims = cognito_jwt_token.verify(access_token)

        # Authenticated request - log user info
        app.logger.debug("authenticated")
        app.logger.debug(claims)
        app.logger.debug(claims['username'])

        # Return personalized feed with user's Cognito ID
        data = HomeActivities().run(cognito_user_id=claims['username'])

        # COMMENTED OUT: Additional token validation
        #token_type, access_token = auth_header.split()
        #if token_type.lower() != 'bearer':
        return data, 200

    except TokenVerifyError as e:
        # Unauthenticated request - return public feed
        app.logger.debug(e)
        app.logger.debug("unauthenticated")

        data = HomeActivities().run()

        # COMMENTED OUT: Debug logging
        #print(f"Received access token: {access_token}")
        # COMMENTED OUT: Alternative service call with logger
        #data = HomeActivities.run(logger=LOGGER)

        return data, 200

# ============================================================
# API ENDPOINTS - NOTIFICATIONS
# ============================================================
@app.route("/api/activities/notifications", methods=['GET'])
@xray_recorder.capture('notifications_api_call')  # Track this endpoint in X-Ray
def data_notifications():
    """Get notification activities for user"""
    data = NotificationsActivities.run()
    return data, 200

# ============================================================
# API ENDPOINTS - USER PROFILE
# ============================================================
@app.route("/api/activities/@<string:handle>", methods=['GET'])
@xray_recorder.capture('user_api_call')  # Track this endpoint in X-Ray
def data_handle(handle):
    """Get activities for a specific user profile"""
    model = UserActivities.run(handle)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200

# ============================================================
# API ENDPOINTS - SEARCH
# ============================================================
@app.route("/api/activities/search", methods=['GET'])
def data_search():
    """Search activities by term"""
    term = request.args.get('term')
    model = SearchActivities.run(term)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200

# ============================================================
# API ENDPOINTS - CREATE ACTIVITY (CRUD POST)
# ============================================================
@app.route("/api/activities", methods=['POST','OPTIONS'])
@cross_origin()
def data_activities():
    """Create a new activity/post"""
    # Debug logging for troubleshooting
    print('='*60)
    print('🔍 /api/activities endpoint hit!')
    print(f'   Method: {request.method}')
    print(f'   Headers: {dict(request.headers)}')
    print(f'   Origin: {request.headers.get("Origin")}')
    print('='*60)
    
    # Handle CORS preflight request
    if request.method == 'OPTIONS':
        print('✅ Handling OPTIONS preflight request')
        return '', 204
    
    try:
        # Extract request data
        user_handle = 'chrisfenton'  # Hardcoded for now - TODO: get from authenticated user
        message = request.json['message']
        ttl = request.json['ttl']  # Time-to-live for activity expiration
        
        print(f'🔍 Request data - message: {message}, ttl: {ttl}')
        
        # Create activity in database
        model = CreateActivity.run(message, user_handle, ttl)
        
        # Return response based on success/failure
        if model['errors'] is not None:
            print(f'❌ CreateActivity returned errors: {model["errors"]}')
            return model['errors'], 422
        else:
            print(f'✅ CreateActivity succeeded: {model["data"]}')
            return model['data'], 200
    except Exception as e:
        # Catch and log any unexpected errors
        print(f'💥 EXCEPTION in data_activities: {e}')
        import traceback
        traceback.print_exc()
        return {'error': str(e)}, 500

# ============================================================
# API ENDPOINTS - VIEW SINGLE ACTIVITY
# ============================================================
@app.route("/api/activities/<string:activity_uuid>", methods=['GET'])
def data_show_activity(activity_uuid):
    """Get a single activity by UUID"""
    data = ShowActivity.run(activity_uuid=activity_uuid)
    return data, 200

# ============================================================
# API ENDPOINTS - REPLY TO ACTIVITY
# ============================================================
@app.route("/api/activities/<string:activity_uuid>/reply", methods=['POST','OPTIONS'])
@cross_origin()
def data_activities_reply(activity_uuid):
    """Create a reply to an existing activity"""
    user_handle  = 'chrisfenton'
    message = request.json['message']
    model = CreateReply.run(message, user_handle, activity_uuid)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200
    
# ============================================================
# API ENDPOINTS - USERS SHORT INFO
# ============================================================    
    
@app.route("/api/users/@<string:handle>/short", methods=['GET'])
def data_users_short(handle):
  data = UsersShort.run(handle)
  return data, 200    

# ============================================================
# APPLICATION ENTRY POINT
# ============================================================
if __name__ == "__main__":
    # Run Flask development server with debug mode enabled
    # Debug mode provides better error messages and auto-reloading
    app.run(debug=True)