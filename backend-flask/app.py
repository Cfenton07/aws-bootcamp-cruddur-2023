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
#from aws_xray_sdk.core import xray_recorder
#from aws_xray_sdk.ext.flask.middleware import XRayMiddleware

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
#xray_url = os.getenv("AWS_XRAY_URL")
#xray_recorder.configure(service='backend-flask', dynamic_naming=xray_url)


# Will show in logs within the backend-flask app (STDOUT)
simple_processor = SimpleSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(simple_processor)

trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

app = Flask(__name__)
 

# X-Ray------ Initialize X-Ray Middleware FIRST
#XRayMiddleware(app, xray_recorder)

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
    resources={r"/api/*": {"origins": origins}},
    expose_headers="location,link",
    allow_headers="content-type,if-modified-since",
    methods="OPTIONS,GET,HEAD,POST"
)

# Rollbar --------
rollbar_access_token = os.getenv('ROLLBAR_ACCESS_TOKEN')
def init_rollbar():
    """init rollbar module"""
    rollbar.init(
        # Access token
        rollbar_access_token,
        # environment name
        'production',
        root=os.path.dirname(os.path.realpath(__file__)),
        # flask already setup logging
        allow_logging_basic_config=False)

    # send exceptions from app to rollbar, using flasks signal system.
    got_request_exception.connect(rollbar.contrib.flask.report_exception, app)   

@app.route('/rollbar/test')
def rollbar_test():
    rollbar.report_message('Hello World!', 'warning')
    return "Hello World!"

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
    data = HomeActivities.run(logger=LOGGER) #data = HomeActivities.run(logger=LOGGER) will add later maybe
    return data, 200

@app.route("/api/activities/notifications", methods=['GET'])
#@xray_recorder.capture('notifications_api_call') # <-- ADD THIS LINE
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