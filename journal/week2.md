# Week 2 — Distributed Tracing
## Added yaml code to connect my container to Opentelemetry collector so that my backend-falsk can cend traces to the Collector and then forward them to Honeycomb.
### See code changes to my Docker-Compose file below
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

##I also had to download the OpenTelemetry tar.gz file since I kepts getting an connection refused issue with an initial setup for sending traces to Honeycomb.
###(OpenTelemetry Collector, the .tar.gz file is used to distribute the pre-built executable binary along with any other necessary supporting files (though often it's just the single executable).

Instead of downloading many individual files, I download one compressed .tar.gz file. Once downloaded, I use a command like tar -xvf to extract the actual executable (e.g., otelcol-contrib) from within it. I then run this extracted executable.

So, its purpose is to provide a convenient and compressed way to package and distribute the OpenTelemetry Collector software for Linux systems.)

![Open Telemetry ".tar.gz" file](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/_docs/assets/Opentelemetry_Collector_2025-07-08%20122133.png)

##Here's an explanation of what you've done in the docker-compose.yml file:

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
