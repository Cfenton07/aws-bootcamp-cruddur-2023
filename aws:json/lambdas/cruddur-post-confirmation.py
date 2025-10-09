import json
import os
import psycopg2

def lambda_handler(event: dict, context) -> dict:
    user = event['request']['userAttributes']
    print('userAttributes')
    print(user)

    user_display_name = user['name']
    user_email = user['email']
    user_handle = user['preferred_username']
    user_cognito_id = user['sub']
    
    conn = None
    cur = None
    
    try:
        print('entered-try')
        sql = """
            INSERT INTO public.users (
                display_name, 
                email,
                handle, 
                cognito_user_id
            ) 
            VALUES(%s, %s, %s, %s)
        """
        print('SQL Statement ----')
        print(sql)
        
        conn = psycopg2.connect(os.getenv('CONNECTION_URL'))
        cur = conn.cursor()
        
        params = [
            user_display_name,
            user_email,
            user_handle,
            user_cognito_id
        ]
        
        cur.execute(sql, *params)
        conn.commit()

    except psycopg2.DatabaseError as error:
        print(f"Database error: {error}")
    except KeyError as error:
        print(f"Missing user attribute: {error}")
    except Exception as error:
        print(f"Unexpected error: {error}")
    
    finally:
        if cur is not None:
            cur.close()
        if conn is not None:
            conn.close()
            print('Database connection closed.')
    
    return event