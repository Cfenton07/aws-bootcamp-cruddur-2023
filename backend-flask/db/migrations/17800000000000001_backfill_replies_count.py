from lib.db import db

class BackfillRepliesCountMigration:
  def migrate_sql():
    data = """
    UPDATE public.activities p
    SET replies_count = (
      SELECT COUNT(*)
      FROM public.activities c
      WHERE c.reply_to_activity_uuid = p.uuid
    )
    WHERE p.reply_to_activity_uuid IS NULL;
    """
    return data

  def rollback_sql():
    data = """
    UPDATE public.activities
    SET replies_count = 0
    WHERE reply_to_activity_uuid IS NULL;
    """
    return data

  def migrate():
    db.query_commit(BackfillRepliesCountMigration.migrate_sql(), {})

  def rollback():
    db.query_commit(BackfillRepliesCountMigration.rollback_sql(), {})
