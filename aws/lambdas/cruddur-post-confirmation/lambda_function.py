import json
import os

import boto3
import psycopg2

# Cached for the life of the execution environment, so the secret is fetched
# once per cold start rather than once per signup.
_credentials = None


def _load_credentials() -> dict:
    global _credentials
    if _credentials is None:
        client = boto3.client('secretsmanager')
        raw = client.get_secret_value(SecretId=os.environ['DB_SECRET_ARN'])
        _credentials = json.loads(raw['SecretString'])
    return _credentials


def _clear_credentials() -> None:
    global _credentials
    _credentials = None


def _connect():
    creds = _load_credentials()
    # connect_timeout turns an unreachable database into a fast, labelled
    # failure instead of a silent hang that ends as a Lambda timeout.
    return psycopg2.connect(
        host=os.environ['PG_HOST'],
        port=int(os.environ.get('PG_PORT', '5432')),
        dbname=os.environ.get('PG_DATABASE', 'cruddur'),
        user=creds['username'],
        password=creds['password'],
        connect_timeout=5,
    )


def lambda_handler(event: dict, context) -> dict:
    user = event['request']['userAttributes']
    trigger = event.get('triggerSource')
    # Audit HIGH-02: userAttributes holds email and name. Log the sub only.
    print(f"PostConfirmation {trigger} for sub={user.get('sub')}")

    # Backlog #50: Cognito fires PostConfirmation for a confirmed SIGN-UP
    # (PostConfirmation_ConfirmSignUp) AND for a confirmed PASSWORD RESET
    # (PostConfirmation_ConfirmForgotPassword). Only a sign-up creates a user.
    # Return the event (do not raise) so the password reset completes.
    if trigger != 'PostConfirmation_ConfirmSignUp':
        print(f"Skipping {trigger}: only a sign-up creates a public.users row")
        return event

    try:
        display_name    = user['name']
        email           = user['email']
        handle          = user['preferred_username']
        cognito_user_id = user['sub']
    except KeyError as error:
        print(f"FATAL: missing required Cognito attribute: {error}")
        raise

    # Insert only if this Cognito account has no row yet (backlog #50).
    # WHERE NOT EXISTS works with or without the unique constraint added by
    # migration 17800000000000003, so deploy order does not matter. The
    # constraint is the backstop for two simultaneous invocations; that case
    # is handled by name below.
    sql = """
        INSERT INTO public.users (
            display_name,
            email,
            handle,
            cognito_user_id
        )
        SELECT %s, %s, %s, %s
        WHERE NOT EXISTS (
            SELECT 1 FROM public.users WHERE cognito_user_id = %s
        )
    """
    params = [display_name, email, handle, cognito_user_id, cognito_user_id]

    # Two attempts: if the cached password was invalidated by the 7-day managed
    # rotation between cold start and now, refresh it once and retry.
    for attempt in (1, 2):
        conn = None
        try:
            conn = _connect()
            with conn.cursor() as cur:
                cur.execute(sql, params)
                inserted = cur.rowcount
            conn.commit()
            if inserted == 1:
                print(f"Inserted user handle={handle} sub={cognito_user_id}")
            else:
                # Already has a row (e.g. Cognito retried the trigger). The
                # goal - exactly one row per account - is met. Not an error.
                print(f"User row already exists for sub={cognito_user_id}; nothing inserted")
            return event

        except psycopg2.OperationalError as error:
            message = str(error).lower()
            if attempt == 1 and 'authentication failed' in message:
                print("Cached credentials rejected; refreshing secret and retrying once.")
                _clear_credentials()
                continue
            print(f"FATAL: could not connect to the database: {error}")
            raise

        except psycopg2.Error as error:
            # The ONE unique violation that means "row already exists": a
            # concurrent invocation inserted it first. Matched by constraint
            # NAME so any other violation (e.g. a future unique handle) still
            # raises below instead of silently skipping the insert.
            diag = getattr(error, 'diag', None)
            if (getattr(error, 'pgcode', None) == '23505'
                    and getattr(diag, 'constraint_name', None) == 'users_cognito_user_id_key'):
                print(f"User row already exists for sub={cognito_user_id} (concurrent insert); nothing inserted")
                return event
            # Do NOT swallow. The row is a precondition for the application
            # working, not an optional side effect. A swallowed failure is what
            # let the August 2026 incident run undetected.
            print(f"FATAL: insert into public.users failed: {error}")
            raise

        finally:
            if conn is not None:
                conn.close()
                print('Database connection closed.')

    return event
