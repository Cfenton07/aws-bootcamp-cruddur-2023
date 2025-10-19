# Import datetime utilities for handling timestamps and time calculations
from datetime import datetime, timedelta, timezone
# Import the trace module from OpenTelemetry for distributed tracing/observability
from opentelemetry import trace

# Import the database utility object for executing SQL queries
from lib.db import db

# ============================================================
# COMMENTED OUT: OpenTelemetry Tracer Initialization
# ============================================================
# This would create a tracer object specifically for tracking home activities operations
# OpenTelemetry traces help monitor application performance and track requests across services
# Currently disabled - likely because AWS X-Ray is being used for tracing instead
# If enabled, this would allow measuring how long home activities queries take
#tracer = trace.get_tracer("home.activities")

class HomeActivities:
  def run(self, cognito_user_id=None):
    """
    Retrieves all activities for the home feed
    
    Args:
        self: Instance reference (required for all instance methods)
        cognito_user_id: Optional AWS Cognito user ID for personalized feeds
                        - If provided: Could filter activities for specific user
                        - If None: Shows all public activities
    
    Returns:
        JSON array of activity objects containing posts/activities for the home feed
    """
    
    # ============================================================
    # COMMENTED OUT: Application Logging
    # ============================================================
    # Would log an info-level message when HomeActivities is called
    # Useful for debugging and monitoring which services are being accessed
    # Currently disabled to reduce log verbosity
    #logger.info("HomeActivities")
    
    # ============================================================
    # COMMENTED OUT: OpenTelemetry Distributed Tracing Span
    # ============================================================
    # This block would create a performance monitoring span for the home activities operation
    # Benefits of this code when enabled:
    # - Tracks how long it takes to fetch home activities
    # - Records the current timestamp as a span attribute
    # - Helps identify performance bottlenecks in distributed systems
    # - Integrates with observability platforms like Honeycomb or Jaeger
    # Currently disabled, likely because AWS X-Ray middleware handles tracing instead
    #with tracer.start_as_current_span("home-activites-mock-data"):
    #  span = trace.get_current_span()  # Get reference to current trace span
    #  now = datetime.now(timezone.utc).astimezone()  # Get current timestamp
    #  span.set_attribute("app.now", now.isoformat())  # Add timestamp as span metadata
    
    # ============================================================
    # LOAD SQL TEMPLATE
    # ============================================================
    # Load the SQL query from backend-flask/db/sql/activities/home.sql
    # This keeps SQL separate from Python code for better organization and reusability
    # The template contains a SELECT query that fetches activities with user info
    sql = db.template('activities','home')
    
    # ============================================================
    # EXECUTE QUERY AND RETURN RESULTS
    # ============================================================
    # Execute the SQL query and convert results to JSON array format
    # db.query_array_json() performs these steps:
    # 1. Wraps the SQL in array_to_json() and row_to_json() functions
    # 2. Executes the query against the database
    # 3. Fetches all matching rows
    # 4. Converts them to a JSON array
    # 5. Returns the array (or empty array [] if no results found)
    #
    # NOTE: Currently not passing cognito_user_id as a parameter
    # If you need to filter activities by user, you would use:
    # results = db.query_array_json(sql, {'cognito_user_id': cognito_user_id})
    results = db.query_array_json(sql)
    
    # Return the JSON array of activities to the Flask endpoint
    # This will be sent as the HTTP response to the frontend
    return results