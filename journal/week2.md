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
