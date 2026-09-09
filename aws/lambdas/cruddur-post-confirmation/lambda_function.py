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
    print('userAttributes')
    print(user)

    try:
        display_name    = user['name']
        email           = user['email']
        handle          = user['preferred_username']
        cognito_user_id = user['sub']
    except KeyError as error:
        print(f"FATAL: missing required Cognito attribute: {error}")
        raise

    sql = """
        INSERT INTO public.users (
            display_name,
            email,
            handle,
            cognito_user_id
        )
        VALUES (%s, %s, %s, %s)
    """
    params = [display_name, email, handle, cognito_user_id]

    # Two attempts: if the cached password was invalidated by the 7-day managed
    # rotation between cold start and now, refresh it once and retry.
    for attempt in (1, 2):
        conn = None
        try:
            conn = _connect()
            with conn.cursor() as cur:
                cur.execute(sql, params)
            conn.commit()
            print(f"Inserted user handle={handle} sub={cognito_user_id}")
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
