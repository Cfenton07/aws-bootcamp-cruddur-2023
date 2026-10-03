from lib.db import db

# Likes (backlog #18). Creates the likes table. activities.likes_count already
# exists and is 0 everywhere, so there is nothing to backfill. Folded into
# schema.sql with the stamp bumped to this prefix.
class CreateLikesMigration:
  def migrate_sql():
    data = """
    CREATE TABLE IF NOT EXISTS public.likes (
      user_uuid UUID NOT NULL REFERENCES public.users(uuid) ON DELETE CASCADE,
      activity_uuid UUID NOT NULL REFERENCES public.activities(uuid) ON DELETE CASCADE,
      created_at TIMESTAMP default current_timestamp NOT NULL,
      PRIMARY KEY (user_uuid, activity_uuid)
    );
    """
    return data

  def rollback_sql():
    data = """
    DROP TABLE IF EXISTS public.likes;
    UPDATE public.activities SET likes_count = 0;
    """
    return data

  def migrate():
    db.query_commit(CreateLikesMigration.migrate_sql(), {})

  def rollback():
    db.query_commit(CreateLikesMigration.rollback_sql(), {})
