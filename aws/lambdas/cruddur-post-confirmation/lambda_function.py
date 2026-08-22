import os
import psycopg2

def lambda_handler(event: dict, context) -> dict:
    user = event['request']['userAttributes']
    print('userAttributes')
    print(user)

    try:
        user_display_name = user['name']
        user_email        = user['email']
        user_handle       = user['preferred_username']
        user_cognito_id   = user['sub']
    except KeyError as error:
        print(f"FATAL: missing required Cognito attribute: {error}")
        raise

    connection_url = os.getenv('CONNECTION_URL')
    if not connection_url:
        print("FATAL: CONNECTION_URL is not set. Refusing to continue.")
        raise RuntimeError("CONNECTION_URL is not set")

    sql = """
        INSERT INTO public.users (
            display_name,
            email,
            handle,
            cognito_user_id
        )
        VALUES(%s, %s, %s, %s)
    """

    conn = None
    cur = None

    try:
        conn = psycopg2.connect(connection_url)
        cur = conn.cursor()
        cur.execute(sql, [
            user_display_name,
            user_email,
            user_handle,
            user_cognito_id,
        ])
        conn.commit()
        print(f"Inserted user handle={user_handle} sub={user_cognito_id}")

    except psycopg2.Error as error:
        # Do NOT swallow. A failed insert leaves a Cognito user with no row in
        # public.users: they authenticate fine but cannot message and do not
        # appear in the people directory. Swallowing this is what let the
        # August 2026 incident run undetected. Raising surfaces the failure to
        # Cognito and to the Lambda error metric.
        print(f"FATAL: insert into public.users failed: {error}")
        raise

    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()
            print('Database connection closed.')

    return event
