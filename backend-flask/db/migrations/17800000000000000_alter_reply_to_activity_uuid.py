from lib.db import db

class AlterReplyToActivityUuidMigration:
  def migrate_sql():
    data = """
    ALTER TABLE public.activities
      ALTER COLUMN reply_to_activity_uuid TYPE uuid USING NULL::uuid;
    """
    return data

  def rollback_sql():
    data = """
    ALTER TABLE public.activities
      ALTER COLUMN reply_to_activity_uuid TYPE integer USING NULL::integer;
    """
    return data

  def migrate():
    db.query_commit(AlterReplyToActivityUuidMigration.migrate_sql(), {})

  def rollback():
    db.query_commit(AlterReplyToActivityUuidMigration.rollback_sql(), {})