from flask import Flask
from flask import request
from flask_cors import CORS, cross_origin
import os

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

# Honeycomb observability ... via open telemetry
from opentelemetry import trace
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

# X-Ray-------
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.ext.flask.middleware import XRayMiddleware

# AWS Watchtower Cloudwatch logs------
import watchtower
import logging
import sys
import time
from time import strftime

# ROLLBAR ------
import rollbar
import rollbar.contrib.flask
from flask import got_request_exception

# --- Configuration for CloudWatch Logs ---
CLOUDWATCH_LOG_GROUP = os.environ.get('CLOUDWATCH_LOG_GROUP', 'cruddur')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
CLOUDWATCH_LOG_STREAM = os.environ.get('CLOUDWATCH_LOG_STREAM', f"app-instance-{int(time.time())}")

# --- Configure the Logger ---
LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.DEBUG)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
LOGGER.addHandler(console_handler)

# --- Add the Watchtower handler for CloudWatch Logs ---
try:
    cw_handler = watchtower.CloudWatchLogHandler(
        log_group_name=CLOUDWATCH_LOG_GROUP,
        log_stream_name=CLOUDWATCH_LOG_STREAM,
        # region_name=AWS_REGION,(do not use this line)
        create_log_group=True,
        create_log_stream=True,
    )
    LOGGER.addHandler(cw_handler)
    LOGGER.info("CloudWatch logging configured successfully.")
except Exception as e:
    LOGGER.error(f"Failed to configure CloudWatch logging: {e}")

# Initialize tracing and an exporter that can send data to Honeycomb ...
provider = TracerProvider()
processor = BatchSpanProcessor(OTLPSpanExporter())
provider.add_span_processor(processor)



# X-Ray------ Starting the recorder
xray_url = os.getenv("AWS_XRAY_URL")
xray_recorder.configure(service='backend-flask', dynamic_naming=xray_url)

#OTEL --------- Generic processor
# Will show in logs within the backend-flask app (STDOUT)
#simple_processor = SimpleSpanProcessor(ConsoleSpanExporter())
#provider.add_span_processor(simple_processor)

trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

app = Flask(__name__)
 

# X-Ray------ Initialize X-Ray Middleware FIRST
XRayMiddleware(app, xray_recorder)

# Initialize automatic instrumentation with Flask (Honeycomb)
# IMPORTANT: This line is commented out to avoid conflict with X-Ray Flask middleware.
# FlaskInstrumentor().instrument_app(app) -- Do not use this line
# Keep RequestsInstrumentor if you want OpenTelemetry to trace outgoing HTTP requests
RequestsInstrumentor().instrument()

frontend = os.getenv('FRONTEND_URL')
backend = os.getenv('BACKEND_URL')
origins = [frontend, backend]
cors = CORS(
    app,
  resources={r"/api/*": {
    "origins": origins,
    "allow_headers": ["Authorization", "Content-Type", "if-modified-since"],
    "expose_headers": ["location", "link", "Authorization"],
    "methods": ["OPTIONS", "GET", "HEAD", "POST"]
  }}
    # Old code.
    # app,
    # resources={r"/api/*": {"origins": origins}},
    # expose_headers="location,link",
    # allow_headers="content-type,if-modified-since",
    # methods="OPTIONS,GET,HEAD,POST"
)

# Rollbar --------
rollbar_access_token = os.getenv('ROLLBAR_ACCESS_TOKEN')
if rollbar_access_token: # Good practice: only init if token is available
    rollbar.init(
        rollbar_access_token,
        'production', # Or an environment variable like os.getenv('FLASK_ENV', 'development')
        root=os.path.dirname(os.path.realpath(__file__)),
        allow_logging_basic_config=False
    )
    # The signal connection needs to be done within an app context
    # if you were outside the app context, but here it's fine.
    with app.app_context():
        got_request_exception.connect(rollbar.contrib.flask.report_exception, app)
else:
    print("ROLLBAR_ACCESS_TOKEN not found, Rollbar not initialized.")   

#Rollbar ------
@app.route('/rollbar/test')
def rollbar_test():
    rollbar.report_message('Hello World!', 'warning')
    return "Hello World!"

#CloudWatch ----->
@app.after_request
def after_request(response):
    timestamp = strftime('[%Y-%b-%d %H:%M]')
    LOGGER.error('%s %s %s %s %s %s', timestamp, request.remote_addr, request.method, request.scheme, request.full_path, response.status)
    return response

@app.route("/api/message_groups", methods=['GET'])
def data_message_groups():
    user_handle  = 'chrisfenton'
    model = MessageGroups.run(user_handle=user_handle)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200

@app.route("/api/messages/@<string:handle>", methods=['GET'])
def data_messages(handle):
    user_sender_handle = 'chrisfenton'
    user_receiver_handle = request.args.get('user_reciever_handle')

    model = Messages.run(user_sender_handle=user_sender_handle, user_receiver_handle=user_receiver_handle)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200
    return

@app.route("/api/messages", methods=['POST','OPTIONS'])
@cross_origin()
def data_create_message():
    user_sender_handle = 'chrisfenton'
    user_receiver_handle = request.json['user_receiver_handle']
    message = request.json['message']

    model = CreateMessage.run(message=message,user_sender_handle=user_sender_handle,user_receiver_handle=user_receiver_handle)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200
    return

@app.route("/api/activities/home", methods=['GET'])
def data_home():
    # Retrieve the Authorization header from the request
    auth_header = request.headers.get('Authorization')

    # Check if the header exists
    if not auth_header:
        # If no header, return an error
        return {"error": "Authorization header is missing"}, 401

    # Assuming the header is in the format "Bearer <token>"
    try:
        token_type, access_token = auth_header.split()
        if token_type.lower() != 'bearer':
            return {"error": "Invalid token type"}, 401
    except ValueError:
        return {"error": "Invalid Authorization header format"}, 401

    # Now you have the access_token, you can use it to validate the request.
    # For now, we will print it to confirm it's being received.
    print(f"Received access token: {access_token}")
    
    # [TODO] You would typically add code here to validate the token
    # For example, by calling an external service or a function that checks its validity.
    
    data = HomeActivities.run(logger=LOGGER) #data = HomeActivities.run(logger=LOGGER) will add later maybe
    return data, 200

@app.route("/api/activities/notifications", methods=['GET'])
@xray_recorder.capture('notifications_api_call') # <-- ADD THIS LINE
def data_notifications():
    data = NotificationsActivities.run()
    return data, 200

@app.route("/api/activities/@<string:handle>", methods=['GET'])
@xray_recorder.capture('user_api_call')
def data_handle(handle):
    model = UserActivities.run(handle)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200

@app.route("/api/activities/search", methods=['GET'])
def data_search():
    term = request.args.get('term')
    model = SearchActivities.run(term)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200
    return

@app.route("/api/activities", methods=['POST','OPTIONS'])
@cross_origin()
def data_activities():
    user_handle  = 'chrisfenton'
    message = request.json['message']
    ttl = request.json['ttl']
    model = CreateActivity.run(message, user_handle, ttl)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200
    return

@app.route("/api/activities/<string:activity_uuid>", methods=['GET'])
def data_show_activity(activity_uuid):
    data = ShowActivity.run(activity_uuid=activity_uuid)
    return data, 200

@app.route("/api/activities/<string:activity_uuid>/reply", methods=['POST','OPTIONS'])
@cross_origin()
def data_activities_reply(activity_uuid):
    user_handle  = 'chrisfenton'
    message = request.json['message']
    model = CreateReply.run(message, user_handle, activity_uuid)
    if model['errors'] is not None:
        return model['errors'], 422
    else:
        return model['data'], 200
    return

if __name__ == "__main__":
    app.run(debug=True)