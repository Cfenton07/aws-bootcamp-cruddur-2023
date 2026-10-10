from lib.db import db

# Backlog #50: one public.users row per Cognito account. A password reset
# fired the post-confirmation trigger and inserted a second row for the same
# cognito_user_id (incident 2026-10-07). The Lambda now skips non-sign-up
# triggers; this constraint makes a duplicate impossible at the database.
# Fails loudly (and is not recorded) if duplicates already exist - run the
# duplicate check first. Folded into schema.sql with the stamp bumped.
class UniqueUsersCognitoUserIdMigration:
  def migrate_sql():
    data = """
    ALTER TABLE public.users
      ADD CONSTRAINT users_cognito_user_id_key UNIQUE (cognito_user_id);
    """
    return data

  def rollback_sql():
    data = """
    ALTER TABLE public.users
      DROP CONSTRAINT IF EXISTS users_cognito_user_id_key;
    """
    return data

  def migrate():
    db.query_commit(UniqueUsersCognitoUserIdMigration.migrate_sql(), {})

  def rollback():
    db.query_commit(UniqueUsersCognitoUserIdMigration.rollback_sql(), {})
