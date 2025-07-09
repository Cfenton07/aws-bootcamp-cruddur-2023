# Week 2 — Distributed Tracing
## Added yaml code to connect my container to Opentelemetry collector so that my backend-falsk can cend traces to the Collector and then forward them to Honeycomb.
### See code changes to my Docker-Compose file below

### From the initial config set up for my Open Telemetry set up I was receiving the following error:
What does this mean: Exception while exporting Span.

Traceback (most recent call last):

  File "/usr/local/lib/python3.10/site-packages/urllib3/connection.py", line 198, in _new_conn

    sock = connection.create_connection(

  File "/usr/local/lib/python3.10/site-packages/urllib3/util/connection.py", line 85, in create_connection

    raise err

  File "/usr/local/lib/python3.10/site-packages/urllib3/util/connection.py", line 73, in create_connection

    sock.connect(sa)

ConnectionRefusedError: [Errno 111] Connection refused

## I inquired Gemini about this error and here is what I found out:

### This means that your application successfully generated a trace span (a piece of telemetry data), but it failed to send it to its intended destination.

Let's break down the error message and its implications:

Exception while exporting Span.: This is the top-level message. It clearly states that the problem occurred during the "export" phase of a "Span."

Span: In OpenTelemetry, a span represents a single operation or unit of work within a trace. For example, an API call, a database query, or a function execution can be a span.

Exporting: This is the process of sending the collected telemetry data (spans, metrics, logs) from your application to an observability backend (like an OpenTelemetry Collector, Jaeger, Datadog, etc.).

Traceback (most recent call last):: This is a standard Python traceback, showing the sequence of function calls that led to the error.

File "/usr/local/lib/python3.10/site-packages/urllib3/connection.py", line 198, in _new_conn
File "/usr/local/lib/python3.10/site-packages/urllib3/util/connection.py", line 85, in create_connection
File "/usr/local/lib/python3.10/site-packages/urllib3/util/connection.py", line 73, in create_connection
sock.connect(sa):
These lines show that the error occurred deep within the urllib3 library, which is a Python HTTP client library often used by other libraries (like requests and, by extension, OpenTelemetry's OTLP HTTP exporter) to make network connections. Specifically, it happened when urllib3 tried to establish a raw socket connection (sock.connect(sa)) to a remote address.

ConnectionRefusedError: [Errno 111] Connection refused:
This is the core problem. It's an operating system error that means:

Your application (the client) attempted to connect to a specific network address (IP address and port).

The machine at that address actively refused the connection. It wasn't just unreachable; it explicitly sent back a "connection refused" signal.

What does this imply in the context of OpenTelemetry?

This error typically means one of the following:

The OpenTelemetry Collector (or whatever service you're trying to send traces to) is not running. Your application is trying to "talk" to a server that isn't there or isn't listening for connections.

The OpenTelemetry Collector is running, but it's not listening on the expected port or IP address. For example, your application might be configured to send to localhost:4318, but the Collector is configured to listen on a different port, or only on a specific network interface other than localhost.

A firewall is blocking the connection. While less common for localhost connections (if both your application and the Collector are on the same machine), a strict firewall could prevent even internal connections. If the Collector is on a different machine, a network firewall is a very common cause.

In summary, your application did its job of creating the telemetry data, but it failed at the last step: sending that data out because the intended recipient was not available or not accepting connections at the specified address and port.

To resolve this, you need to ensure that the service that is supposed to receive your OpenTelemetry traces (most commonly an OpenTelemetry Collector) is running and correctly configured to listen on the address and port that your application's OpenTelemetry exporter is trying to connect to.

```yaml
# docker-compose.yml

version: "3.8"
services:
  backend-flask:
    environment:
      FRONTEND_URL: "https://3000-${GITPOD_WORKSPACE_ID}.${GITPOD_WORKSPACE_CLUSTER_HOST}"
      BACKEND_URL: "https://4567-${GITPOD_WORKSPACE_ID}.${GITPOD_WORKSPACE_CLUSTER_HOST}"
      OTEL_SERVICE_NAME: 'backend-flask'
      # --- REMOVED: Direct Honeycomb endpoint and headers from Flask app ---
      # OTEP_EXPORTER_OTLP_ENDPOINT: "https://api.honeycomb.io"
      # OTEP_EXPORTER_OTLP_HEADERS: "x-honeycomb-team=${HONEYCOMB_API_KEY}"
      # --- ADDED: Point Flask app to the local OpenTelemetry Collector service ---
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318" # Flask app sends to the Collector service
    build: ./backend-flask
    ports:
      - "4567:4567"
    volumes:
      - ./backend-flask:/backendflasktype
    depends_on:
      - otel-collector # Ensure the Collector starts before the Flask app

  # OpenTelemetry Collector service
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest # Use the contrib image for more features
    command: ["--config=/etc/otelcol/config.yaml"] # Tell the Collector to use our mounted config
    volumes:
      # Mount your local config.yaml into the container
      # Make sure you have a 'config.yaml' file in a './otel-collector/' directory at your project root
      - ./otel-collector/config.yaml:/etc/otelcol/config.yaml
    ports:
      # Expose the OTLP HTTP port so your Flask app can reach it
      - "4318:4318" # OTLP HTTP receiver
      - "4317:4317" # OTLP gRPC receiver (optional, but good to expose if needed)
      # You might also expose other ports for debugging, e.g., for Prometheus exporter or zPages
      # - "8888:8888" # Prometheus metrics (if configured in Collector)
    environment:
      # Pass your Honeycomb API key to the Collector container
      # This is how the Collector's config.yaml will get the ${env:HONEYCOMB_API_KEY} value
      HONEYCOMB_API_KEY: "${HONEYCOMB_API_KEY}" # Reads from your host's environment variable
      # If you use a specific dataset for Honeycomb Classic, you might also pass it here
      # HONEYCOMB_DATASET: "${HONEYCOMB_DATASET_NAME}"
    restart: unless-stopped # Automatically restart if it stops

  frontend-react-js:
    environment:
      REACT_APP_BACKEND_URL: "https://4567-${GITPOD_WORKSPACE_ID}.${GITPOD_WORKSPACE_CLUSTER_HOST}"
    build: ./frontend-react-js
    ports:
      - "3000:3000"
    volumes:
      - ./frontend-react-js:/frontend-react-js
  dynamodb-local:
    # https://stackoverflow.com/questions/67533058/persist-local-dynamodb-data-in-volumes-lack-permission-unable-to-open-datba
    # We need to add a user:root to get this working
    user: root
    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath ./data"
    image: "amazon/dynamodb-local:latest"
    container_name: dynamodb-local
    ports:
      - "8000:8000"
    volumes:
      - "./docker/dynamodb:/home/dynamodblocal/data"
    working_dir: /home/dynamodblocal
  db:
    image: postgres:13-alpine
    restart: always
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=POSTGRES_PASSWORD
    ports:
      - "5432:5432"
    volumes:
      - db:/var/lib/postgresql/data

# the name flag is a hack to change the default prepend folder
# name when outputting the image names
networks:
  internal-network:
    driver: bridge
    name: crudder
volumes:
  db:
    driver: local
```

## I also had to download the OpenTelemetry tar.gz file since I kepts getting an connection refused issue with an initial setup for sending traces to Honeycomb.
### (OpenTelemetry Collector, the .tar.gz file is used to distribute the pre-built executable binary along with any other necessary supporting files (though often it's just the single executable).

Instead of downloading many individual files, I download one compressed .tar.gz file. Once downloaded, I use a command like tar -xvf to extract the actual executable (e.g., otelcol-contrib) from within it. I then run this extracted executable.

So, its purpose is to provide a convenient and compressed way to package and distribute the OpenTelemetry Collector software for Linux systems.)

![Open Telemetry ".tar.gz" file](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/_docs/assets/Opentelemetry_Collector_2025-07-08%20122133.png)

## Here's an explanation of what you've done in the docker-compose.yml file:

In the provided docker-compose.yml file, you've integrated the OpenTelemetry Collector into your multi-service Docker setup. This is a significant step towards centralizing your application's observability.

Specifically, you've made the following key changes:

Introduced an otel-collector Service:

You've added a new service block named otel-collector. This defines a new container that will run the OpenTelemetry Collector.

image: otel/opentelemetry-collector-contrib:latest: This specifies that the Collector container will be built from the official otel/opentelemetry-collector-contrib Docker image, ensuring you have a feature-rich version of the Collector.

command: ["--config=/etc/otelcol/config.yaml"]: This tells the Collector executable inside the container to use a specific configuration file.

volumes: - ./otel-collector/config.yaml:/etc/otelcol/config.yaml: This is crucial for configuration. It mounts your local config.yaml file (which you should place in a ./otel-collector/ directory at your project root) into the /etc/otelcol/config.yaml path inside the Collector container. This allows you to manage the Collector's behavior from your local project files.

ports: - "4318:4318" and - "4317:4317": These lines expose the standard OTLP (OpenTelemetry Protocol) ports from the Collector container to your host machine. This makes it possible for your backend-flask application (and potentially other services or external tools) to send telemetry data to the Collector. Port 4318 is for OTLP over HTTP, and 4317 is for OTLP over gRPC.

environment: HONEYCOMB_API_KEY: "${HONEYCOMB_API_KEY}": This passes your HONEYCOMB_API_KEY environment variable (which you set on your host machine before running Docker Compose) into the otel-collector container. The Collector's config.yaml then uses this variable to authenticate when forwarding data to Honeycomb.

restart: unless-stopped: This ensures that if the Collector container stops for any reason (e.g., due to an error), Docker will automatically try to restart it, improving the reliability of your observability pipeline.

Modified the backend-flask Service:

OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4318": You've updated the backend-flask service's environment variables. Previously, it might have been configured to send traces directly to Honeycomb. Now, it's explicitly told to send its telemetry data to the otel-collector service (which is reachable by its service name otel-collector within the Docker Compose network) on port 4318.

depends_on: - otel-collector: This instructs Docker Compose to start the otel-collector service before attempting to start the backend-flask service. This helps prevent "connection refused" errors from your Flask app if the Collector isn't ready to receive data yet.

In essence, you've shifted your observability strategy from direct application-to-Honeycomb communication to a more robust architecture where the OpenTelemetry Collector acts as an intermediary. Your Flask application now sends its traces to the local Collector, and the Collector is responsible for processing and securely forwarding that data to Honeycomb. This provides benefits like buffering, batching, and potential future routing to multiple observability backends without changing your application code.

![Open Telemetry added director ](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/_docs/assets/otel-collector%202025-07-08%20123142.png)

## The file above .tar.gz was too large to commit back to my repo so I had to delete it and create a config.yaml file and added it to the otelcol directory set in my main worspace ... that yaml file had the instructions to set the ports for the otlp receiver for the Collector to listen to (port 4318) and and then set the port for the exporter to automatically forward from the Collector to Honeycomb on port 443. I also defined my receiver, processor and exporter in this file...see below

```yaml
# config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318 # Collector listens for OTLP over HTTP on port 4318
      grpc:
        endpoint: 0.0.0.0:4317 # Collector listens for OTLP over gRPC on port 4317

processors:
  batch: # Batches data for efficient export
    send_batch_size: 1000
    timeout: 10s

exporters:
  # This configures the Collector to forward data to Honeycomb
  otlp/honeycomb:
    endpoint: "https://api.honeycomb.io:443"
    headers:
      "x-honeycomb-team": "${env:HONEYCOMB_API_KEY}" # Reads API key from HONEYCOMB_API_KEY env var
    # If you are using a specific dataset (for Honeycomb Classic users), uncomment and set:
    # "x-honeycomb-dataset": "YOUR_DATASET_NAME"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/honeycomb]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/honeycomb]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/honeycomb]
```
