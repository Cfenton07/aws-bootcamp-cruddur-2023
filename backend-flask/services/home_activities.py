from datetime import datetime, timedelta, timezone
from opentelemetry import trace
import logging

from lib.db import pool, query_wrap_object, query_wrap_array

tracer = trace.get_tracer("home.activities")
# Setting up a logger specifically for this module
LOGGER = logging.getLogger(__name__)

class HomeActivities:
  def run(self, cognito_user_id=None):
    LOGGER.info("HomeActivities")
    with tracer.start_as_current_span("home-activities-mock-data"):
      span = trace.get_current_span()
      now = datetime.now(timezone.utc).astimezone()
      span.set_attribute("app.now", now.isoformat())
    # prepare to auth
      
     
      sql = query_wrap_array("""
      SELECT
        activities.uuid,
        users.display_name,
        users.handle,
        activities.message,
        activities.replies_count,
        activities.reposts_count,
        activities.likes_count,
        activities.reply_to_activity_uuid,
        activities.expires_at,
        activities.created_at
      FROM public.activities
      LEFT JOIN public.users ON users.uuid = activities.user_uuid
      ORDER BY activities.created_at DESC
      """)
      print(sql)
      with pool.connection() as conn:
        with conn.cursor() as cur:
          cur.execute(sql)
          # this will return a tuple
          # the first field being the data
          json = cur.fetchone()
      return json[0]