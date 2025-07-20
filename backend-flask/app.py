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

#Honeycomb observability ... via open telemetry
from opentelemetry import trace
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

#X-Ray-------
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.ext.flask.middleware import XRayMiddleware

#AWS Watchtower Cloudwatch logs------
import watchtower
import logging
import sys
import time
from time import strftime

# Configuring Logger to Use CloudWatch
# --- Configuration for CloudWatch Logs ---
# IMPORTANT: Replace these with your desired Log Group and Region.
# These can also be pulled from environment variables for flexibility.
CLOUDWATCH_LOG_GROUP = os.environ.get('CLOUDWATCH_LOG_GROUP', 'cruddur') # Using 'cruddur' as default from your snippet
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1') # e.g., 'us-east-1', 'eu-west-1'

# The log stream name can be dynamic, e.g., based on instance ID, timestamp, etc.
# For simplicity, we'll use a fixed name or a timestamp.
# If running in ECS/Lambda, the environment might provide unique identifiers.
CLOUDWATCH_LOG_STREAM = os.environ.get('CLOUDWATCH_LOG_STREAM', f"app-instance-{int(time.time())}")

# --- Configure the Logger ---
# Get the root logger or a specific logger for your application
# Using __name__ is good practice for library code, but for an app.py,
# you might use a more generic name or the root logger.
LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.DEBUG) # Set to DEBUG as in your snippet

# --- Add a StreamHandler for console output (optional but recommended) ---
# This ensures logs also appear in your console/Docker logs, which is useful for debugging.
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG) # Set to DEBUG to match LOGGER
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
LOGGER.addHandler(console_handler)

# --- Add the Watchtower handler for CloudWatch Logs ---
try:
    cw_handler = watchtower.CloudWatchLogHandler(
        log_group_name=CLOUDWATCH_LOG_GROUP,
        log_stream_name=CLOUDWATCH_LOG_STREAM, # Added dynamic log stream name
        region_name=AWS_REGION, # <-- THIS IS THE CRUCIAL ADDITION
        create_log_group=True,  # Recommended for robustness
        create_log_stream=True, # Recommended for robustness
        # Add any other configuration as needed, e.g., boto3_session for specific credentials
    )
    LOGGER.addHandler(cw_handler)
    LOGGER.info("CloudWatch logging configured successfully.")
except Exception as e:
    LOGGER.error(f"Failed to configure CloudWatch logging: {e}")
    # You might want to exit or fallback to only console logging here




#Initialize tracing and an exporter that can send data to Honeycomb ...
provider = TracerProvider()
processor = BatchSpanProcessor(OTLPSpanExporter())
provider.add_span_processor(processor)

#X-Ray------ Starting the recorder
xray_url = os.getenv("AWS_XRAY_URL")
xray_recorder.configure(service='backend-flask', dynamic_naming=xray_url)


#Will show in logs within the backend-flask app (STDOUT)
simple_processor = SimpleSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(simple_processor)

trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

app = Flask(__name__)
#X-Ray------ 
XRayMiddleware(app, xray_recorder)

#Initialize automatic instrumentation with Flask (Honeycomb)
FlaskInstrumentor().instrument_app(app)
RequestsInstrumentor().instrument()

frontend = os.getenv('FRONTEND_URL')
backend = os.getenv('BACKEND_URL')
origins = [frontend, backend]
cors = CORS(
  app, 
  resources={r"/api/*": {"origins": origins}},
  expose_headers="location,link",
  allow_headers="content-type,if-modified-since",
  methods="OPTIONS,GET,HEAD,POST"
)

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
  data = HomeActivities.run(logger=LOGGER)
  return data, 200

@app.route("/api/activities/notifications", methods=['GET'])
def data_notifications():
  data = NotificationsActivities.run()
  return data, 200

@app.route("/api/activities/@<string:handle>", methods=['GET'])
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