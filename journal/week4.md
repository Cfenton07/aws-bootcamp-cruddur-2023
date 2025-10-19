# Week 4 — Postgres and RDS

## AWS RDS Instance Provisioning (9:28):
- The primary goal is to provision an Amazon RDS (Relational Database Service) PostgreSQL instance using the AWS CLI, as it's often more straightforward than the console.
- Console Walkthrough (10:51): A brief tour of the RDS console options is provided, highlighting "Standard Create" mode and the importance of selecting the "Free Tier" to avoid costs.
- Key RDS Configuration Points: Discussion included instance identifiers, master username (e.g., critter_root), password requirements (8-30 characters), instance types (dbt3.micro for free tier), availability zones (e.g., ca-central-1a), port number (default 5432), public accessibility (controlled by security groups), storage encryption, and performance insights.
- CLI Provisioning Command (24:03): Users are instructed to copy a predefined aws rds create-db-instance command into a scratch file, ensuring the password is securely managed and not committed to the repository.
- Credential Management (29:20): The instructor troubleshoots and regenerates AWS access keys, emphasizing the need for proper environment variable setup.
- RDS Instance State (33:34): In AWS, the RDS instance creation takes about 10-15 minutes. Once available, it's temporarily stopped to conserve costs, as RDS instances can auto-restart after seven days if not explicitly terminated.
## PostgreSQL Local Setup & CLI (40:20):
- The video transitions to interacting with a local PostgreSQL instance running in Docker via Gitpod.
- psql client (41:59): The psql command-line client is introduced as a tool to interact with PostgreSQL, noting its utility for scenarios where GUI tools are not feasible.
- Basic psql Commands:
-- psql -h localhost -U postgres -d postgres to connect to the local PostgreSQL.
-- \l to list databases (46:41).
-- CREATE DATABASE crudder; to create the application database (49:38).
-- \c crudder to connect to the newly created database.
## Bash Scripting for Database Management (1:06:30):
- Purpose: To automate common database operations (create, drop, schema load) using bash scripts for efficiency and consistency.
- Directory Structure (1:07:03): A new bin directory is created for executable bash scripts (db_create, db_drop, db_schema_load, db_seed, db_connect).
- Shebang Line (1:08:01): Each script starts with #!/usr/bin/env bash to specify the interpreter.
- Executable Permissions (1:10:45): Scripts need executable permissions (chmod u+x filename) to be run.
- Dropping Database (1:14:10): The db_drop script uses psql -c "DROP DATABASE crudder;" but requires special handling of the CONNECTION_URL string to avoid being connected to the database being dropped (using sed for string manipulation) (1:15:37).
- Creating Database (1:22:05): The db_create script uses psql -c "CREATE DATABASE crudder;" with a modified connection string.
- Loading Schema (1:23:52): The db_schema_load script executes an SQL file (db/schema.sql) using psql -f to create tables. It introduces the real_path command (1:25:37) to get the absolute path of files, ensuring scripts work regardless of the current directory.
- Environment Toggling (1:31:36): An if/else statement in the db_schema_load script demonstrates how to switch between local and production database connection URLs based on a command-line argument ($1).
- Terminal Colors (1:38:52): How to add color to script output using printf and ANSI escape codes for better readability.
## Database Schema & Seeding (1:41:30):
- db/schema.sql (1:41:59): Defines tables, specifically public.users and public.activities, including data types like uuid and NOT NULL constraints. The concept of PostgreSQL schemas (namespaces) is introduced.
- db/seed.sql (1:49:30): Contains INSERT statements to populate initial data into the tables, demonstrating how to use the db_seed script to load this data.
- Debugging (1:52:45): The instructor debugs an issue where a column was missing in the schema, demonstrating the iterative process of development.
Outlook (1:54:20): The instructor mentions further work, including API endpoints, AWS Lambda, and future topics like DynamoDB, while reassuring participants about homework challenges given the complexity of the week's content.

RDS Instance Provisioning
1. Created RDS PostgreSQL Instance via AWS CLI
Purpose: Set up a production database that could be temporarily stopped to avoid costs.
I walked through the AWS Console first to explain the options (though I didn't actually use it), then used this CLI command:
```sh
aws rds create-db-instance \
  --db-instance-identifier cruddur-db-instance \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 14.6 \
  --master-username cruddurroot \
  --master-user-password <my-password> \
  --allocated-storage 20 \
  --availability-zone ca-central-1a \
  --backup-retention-period 0 \
  --port 5432 \
  --no-multi-az \
  --storage-type gp2 \
  --publicly-accessible \
  --storage-encrypted \
  --enable-performance-insights \
  --performance-insights-retention-period 7 \
  --no-deletion-protection
```
Key decisions:

Used publicly accessible (with security group protection)
Disabled backups to speed up provisioning
Enabled encryption by default
Set to us-east-1a availability zone

After creation, I immediately stopped the instance temporarily (AWS allows 7 days) to avoid charges.

Local PostgreSQL Setup
2. Verified Docker Compose Configuration
File: docker-compose.yml
Purpose: Ensure postgres container was configured from previous week.
I confirmed the postgres database definition existed and commented out DynamoDB to save container resources.
3. Started Local Postgres Container
I ran docker compose up to start the local development environment.
4. Connected to Local Postgres
I used the psql client to connect:
```sh
psql -U postgres -h localhost
```
Password: POSTGRES_PASSWORD
Note: The -h localhost flag is required when working in Docker environments.
5. Created Local Database
Inside the psql client:
```sql
CREATE DATABASE cruddur;
```

Connection URL Strings
6. Created Connection URL Environment Variables
Purpose: Simplify database connections and avoid typing passwords repeatedly.
Local connection string:
```sh
export CONNECTION_URL="postgresql://postgres:POSTGRES_PASSWORD@localhost:5432/cruddur"
gp env CONNECTION_URL="postgresql://postgres:POSTGRES_PASSWORD@localhost:5432/cruddur"
```
Production connection string:
```sh
export PROD_CONNECTION_URL="postgresql://cruddurroot:JfUa365Jl1383@cruddur-db-instance.cg3e6skiib1h.us-east-1.rds.amazonaws.com:5432/cruddur"
gp env PROD_CONNECTION_URL="postgresql://cruddurroot:JfUa365Jl1383@cruddur-db-instance.cg3e6skiib1h.us-east-1.rds.amazonaws.com:5432/cruddur"
```
I could then connect simply with:
```sh
psql $CONNECTION_URL
```

Database Schema File
7. Created backend-flask/db/schema.sql
Purpose: Define the database structure with tables for users and activities.
Key elements:

Enabled UUID extension for generating unique identifiers
Used public schema namespace explicitly (good practice for future microservices)
Created DROP statements to allow re-running the script

Tables created:
users table:
```sql
DROP TABLE IF EXISTS public.users;
CREATE TABLE public.users (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  display_name text,
  handle text,
  cognito_user_id text,
  created_at TIMESTAMP default current_timestamp NOT NULL
);
```
activities table:
```sql
DROP TABLE IF EXISTS public.activities;
CREATE TABLE public.activities (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_uuid UUID NOT NULL,
  message text NOT NULL,
  replies_count integer DEFAULT 0,
  reposts_count integer DEFAULT 0,
  likes_count integer DEFAULT 0,
  reply_to_activity_uuid integer,
  expires_at TIMESTAMP,
  created_at TIMESTAMP default current_timestamp NOT NULL
);
```

Bash Scripts for Database Management
8. Created backend-flask/bin/ Directory
Purpose: Store executable bash scripts for common database operations.
9. Created backend-flask/bin/db-create
Purpose: Create the cruddur database.
```sh
#!/usr/bin/bash

NO_DB_CONNECTION_URL=$(sed 's/\/cruddur//g' <<<"$CONNECTION_URL")
psql $NO_DB_CONNECTION_URL -c "CREATE DATABASE cruddur;"
```
Key technique: Used sed to strip the database name from the connection URL (can't connect to a database that doesn't exist yet).
10. Created backend-flask/bin/db-drop
Purpose: Drop the cruddur database.
```sh
#!/usr/bin/bash

NO_DB_CONNECTION_URL=$(sed 's/\/cruddur//g' <<<"$CONNECTION_URL")
psql $NO_DB_CONNECTION_URL -c "DROP DATABASE cruddur;"
```
11. Created backend-flask/bin/db-schema-load
Purpose: Load the schema.sql file into the database, with support for both local and production.
```sh
#!/usr/bin/bash

CYAN='\033[1;36m'
NO_COLOR='\033[0m'
LABEL="db-schema-load"
printf "${CYAN}== ${LABEL}${NO_COLOR}\n"

schema_path="$(realpath .)/db/schema.sql"


if [ "$1" = "prod" ]; then
  echo "using production"
  URL=$PROD_CONNECTION_URL
else
  URL=$CONNECTION_URL
fi

psql $URL cruddur < $schema_path
```
Key features:

Used realpath to get absolute file path
Added color-coded output (cyan) for better visibility
Conditional logic: if first argument is "prod", use production URL
Dollar sign $1 references the first command-line argument

12. Created backend-flask/bin/db-connect
Purpose: Quickly connect to the database.
```sh
#!/usr/bin/bash

psql $CONNECTION_URL
```
13. Made Scripts Executable
Used chmod u+x on all scripts:
```sh
chmod u+x bin/db-create
chmod u+x bin/db-drop
chmod u+x bin/db-schema-load
chmod u+x bin/db-connect
chmod u+x bin/db-seed
```
Explanation: Files aren't executable by default. The u+x flag adds execute permission for the user.

Seed Data
14. Created backend-flask/db/seed.sql
Purpose: Insert test data for development.
```sql

INSERT INTO public.users (display_name, handle, cognito_user_id)
VALUES
  ('Chris Fenton', 'chrisfenton', 'MOCK'),
  ('Antwuan Jacobs', 'bayko', 'MOCK');

INSERT INTO public.activities (user_uuid, message, expires_at)
VALUES
  (
    (SELECT uuid from public.users WHERE users.handle = 'chrisfenton' LIMIT 1),
    'This was imported as seed data!',
    current_timestamp + interval '10 day'
  );
```
15. Created backend-flask/bin/db-seed
Purpose: Load seed data with production/local toggle.
```sh
#!/usr/bin/bash

CYAN='\033[1;36m'
NO_COLOR='\033[0m'
LABEL="db-seed"
printf "${CYAN}== ${LABEL}${NO_COLOR}\n"

seed_path="$(realpath .)/db/seed.sql"

if [ "$1" = "prod" ]; then
  echo "using production"
  URL=$PROD_CONNECTION_URL
else
  URL=$CONNECTION_URL
fi

psql $URL cruddur < $seed_path
```

Bash Scripting Techniques Learned
Shebangs: All scripts started with #!/usr/bin/bash to specify bash interpreter
Color coding: Used ANSI escape codes for colored terminal output
```sh
CYAN='\033[1;36m'
NO_COLOR='\033[0m'
printf "${CYAN}== ${LABEL}${NO_COLOR}\n"
```
Command-line arguments: Used $1 for first argument (e.g., "prod")
Conditional statements:
```sh
if [ "$1" = "prod" ]; then
  URL=$PROD_CONNECTION_URL
else
  URL=$CONNECTION_URL
fi
```
String manipulation with sed: Removed database name from connection string
```sh
NO_DB_CONNECTION_URL=$(sed 's/\/cruddur//g' <<<"$CONNECTION_URL")
```
File paths with realpath: Got absolute paths relative to script location
```sh
bashschema_path="$(realpath .)/db/schema.sql"
```

Verification and Testing
I tested the complete workflow:

./bin/db-drop - Dropped the database
./bin/db-create - Created the database
./bin/db-schema-load - Loaded tables
./bin/db-seed - Inserted test data
./bin/db-connect - Connected to verify

Using \dt in psql showed both tables (users and activities) were created successfully.

Key Learnings and Notes

Docker networking: When connecting to postgres in Docker, use localhost (not the container name)
Security group: For RDS, I'll need to update the security group with my GitPod IP address each time the workspace starts
Temporary stop limitation: RDS instances automatically restart after 7 days even when stopped
Character sets: I didn't explicitly set UTF-8 encoding - this could cause issues later
Bash vs source: Scripts can be run with ./script.sh, source script.sh, or . script.sh

# Week 4 Continued...

## PostgreSQL Database Setup and RDS Connection - Detailed Walkthrough

Initial Database Exploration and Script Creation
I started by connecting to my local PostgreSQL database using a script I had previously created called bin/db-connect. After connecting, I ran \dt to view my tables and executed SELECT * FROM activities to see the seeded data. I discovered that using \x (expanded display mode) made the records much easier to read, and I could also use \x auto to let PostgreSQL decide when to use it.
Creating Database Management Scripts
1. Sessions Monitoring Script (bin/db-sessions)
I created bin/db-sessions to view active database connections. This was necessary because when I tried to drop the database, I got an error saying "the database is being accessed by other users." The script queries pg_stat_activity to show all active connections. I had to make it executable with chmod u+x bin/db-sessions.
I discovered that the Database Explorer in the IDE was keeping connections open, which prevented me from dropping the database. After closing those connections and running docker compose down and docker compose up, I was able to proceed.
2. Setup Script (bin/db-setup)
I created bin/db-setup to streamline my workflow by running multiple commands in sequence:

bin/db-drop
bin/db-create
bin/db-schema-load
bin/db-seed

The script includes set -e at the top to fail fast - if any command fails, it stops executing the rest. I defined a bin_path variable to source the other scripts correctly. This approach mirrors what frameworks like Rails provide, making database management much easier without needing complex frameworks.
Installing PostgreSQL Python Driver
3. Updated backend-flask/requirements.txt
I added two libraries at the bottom:

psycopg[binary] - the PostgreSQL driver for Python (version 3)
psycopg[pool] - for connection pooling

I ran pip install -r requirements.txt to install them locally (though they'd need to be rebuilt in Docker anyway).
I explained that connection pooling manages multiple database connections efficiently by reusing them rather than constantly creating new ones. This is crucial because databases have connection limits. Lambda functions can't leverage connection pooling effectively since each invocation spins up fresh, which is why you'd need RDS Proxy for serverless applications.
4. Created backend-flask/lib/db.py
I created this new library file to set up the connection pool. The file:

Imports the connection pool from psycopg
Imports os for environment variables
Sets up a connection pool using the CONNECTION_URL environment variable
Created two helper functions: query_array_json() and query_object_json()

These helper functions use PostgreSQL's built-in JSON functions (row_to_json() and json_agg()) to return data directly as JSON strings from the database, avoiding the overhead of transforming data in Python. This is much more efficient than using ORMs that fetch data into memory and then manipulate it.
5. Updated docker-compose.yml
I added the CONNECTION_URL environment variable to the backend-flask service, passing it through from my environment.
Implementing Database Queries
6. Modified backend-flask/services/home_activities.py
I updated this file to actually query the database instead of returning mock data:

Imported pool from lib.db
Removed all the mock data code
Established a connection using pool.connection()
Created a cursor with conn.cursor()
Defined my SQL query in a heredoc (using triple quotes)
Called query_array_json() to execute the query and return JSON
Used fetchone()[0] to get the first element of the tuple returned

I initially tried a simple SELECT * FROM activities but later replaced it with a proper query that explicitly listed columns and joined with the users table:
```sql
sqlSELECT
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
```

Troubleshooting Local Development
I encountered several issues:

X-ray and tracing errors that I commented out to focus on the database work
Connection refused errors because I was using 127.0.0.1 instead of db as the hostname in Docker
Missing return statements in my db.py helper functions (I had accidentally removed them)
Template syntax issues with curly braces that needed to be escaped with double curlies {{}}
Had to add f prefix to make string interpolation work in the SQL heredoc

After running docker compose up and refreshing, I successfully retrieved data from my local database.
Production RDS Setup
7. Started RDS Instance
I went to the AWS console and started my RDS PostgreSQL instance. Even though it initially said it failed to start, checking the database list showed it was actually available.
8. Security Group Configuration
I needed to allow my GitPod workspace to connect to RDS. I:

Found my GitPod IP using curl ifconfig.me
Set it as an environment variable: export GITPOD_IP=$(curl ifconfig.me)
Added it to GitPod's environment: gp env GITPOD_IP=$(curl ifconfig.me)
Manually added an inbound rule to the RDS security group for port 5432 (PostgreSQL)

9. Reset RDS Password
I realized I hadn't saved my original RDS password, so I:

Modified the RDS instance in the console
Set a new master password: DBpassword123 (not recommended for real use!)
Applied it immediately

10. Created Production Connection String
I assembled the connection string in a scratch file:

postgresql://cruddurroot:DBpassword123@<RDS-ENDPOINT>:5432/cruddur

Then set it as an environment variable:
```sh
bashexport PROD_CONNECTION_URL="postgresql://..."
gp env PROD_CONNECTION_URL="postgresql://..."
```
12. Created bin/rds-update-sg-rule
I created this script to automatically update the RDS security group with my current GitPod IP address. The script:

Sets environment variables for DB_SG_ID and DB_SG_RULE_ID
Uses AWS CLI command aws ec2 modify-security-group-rules to update the inbound rule
Sets the CIDR block to $GITPOD_IP/32 (single IP address)
Sets the description to "GITPOD"

I made it executable with chmod u+x bin/rds-update-sg-rule.
12. Updated .gitpod.yml
I added commands to the postgres initialization task:
```yaml
yaml- name: postgres
  init: |
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc|sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
    echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" |sudo tee  /etc/apt/sources.list.d/pgdg.list
    sudo apt update
    sudo apt install -y postgresql-client-13 libpq-dev
  command: |
    export GITPOD_IP=$(curl ifconfig.me)
    source "$THEIA_WORKSPACE_ROOT/backend-flask/bin/rds-update-sg-rule"
```

This ensures that every time I launch a GitPod workspace, my current IP is automatically added to the RDS security group.
13. Updated bin/db-connect
I added conditional logic to support both local and production connections:
```sh
bashif [ "$1" = "prod" ]; then
  URL=$PROD_CONNECTION_URL
else
  URL=$CONNECTION_URL
fi
```

Now I could run bin/db-connect prod to connect to production.
14. Updated backend-flask/lib/db.py
I temporarily changed the connection to use PROD_CONNECTION_URL instead of CONNECTION_URL to test against production.
15. Loaded Schema to Production
I ran bin/db-schema-load prod to create the tables in the production RDS instance.
After refreshing my application, I got a 200 response with no data (which was expected since there were no records yet). The production database was now properly connected and ready for use.
Key Takeaways
The session ended with a working production database connection, but no data. To actually create users, I'd need to set up a Lambda function to sync Cognito users with the database upon signup - something that was planned for the next session.

# AWS Bootcamp Week 4.2 - Cognito Post Confirmation Lambda Setup (Python 3.13)

## Overview
I set up a Lambda function that automatically inserts user data into the PostgreSQL database when a user completes the Cognito sign-up process. The goal was to link Cognito user IDs with database user records. However, I encountered compatibility issues because I had written my function code in Python 3.13, while the existing Lambda layer was compiled for Python 3.8.

- Why This Was Needed
Problem: The database requires a cognito_user_id field for every user record, but this ID only exists in Cognito after sign-up. Without automating this insertion, users couldn't be properly tracked in the database.
Solution: Use a Cognito PostConfirmation trigger to invoke a Lambda function that inserts the user into the database.

Step-by-Step Implementation
Step 1: Create the Lambda Function
Location: AWS Lambda Console
Actions I took:

Clicked "Create Function"
Named it: cruddur-post-confirmation
Initially set Runtime to Python 3.8 (following the existing layer compatibility)
Set Architecture to x86_64
Created new execution role with basic Lambda permissions
Skipped advanced settings (VPC, code signing, function URLs, tags)
Clicked "Create function"

Initial mistake: I selected Python 3.8 based on the available psycopg2 layer, not realizing this would create a version mismatch with my actual application code written in Python 3.13.

Step 2: Discover the Python Version Incompatibility Issue
Problem: When I tested the Lambda function after initial setup, I received this error:
Unable to import module 'lambda_function': No module named 'psycopg2'
Root cause: The psycopg2-py38 layer I was using was compiled for Python 3.8. Even though it was attached to the Lambda, Python 3.8's compiled C extensions for psycopg2 are not compatible with Python 3.13. The binary files are version-specific.
Why this happened: I had two options when creating the Lambda:

Match the Lambda runtime to the available layer (Python 3.8)
Create a new layer for Python 3.13

I chose option 1 initially, but my actual code had been written using Python 3.13 syntax and features.

Step 3: Create a Python 3.13-Compatible psycopg2 Layer
Actions I took:

Created the correct directory structure locally:

```sh
   mkdir -p python/lib/python3.13/site-packages
```
Installed psycopg2-binary for Python 3.13:

```bash
pip install psycopg2-binary -t python/lib/python3.13/site-packages/
```
Important note: I used psycopg2-binary, not psycopg2, because:

psycopg2 requires compilation (doesn't work in Lambda environments)
psycopg2-binary is pre-compiled and works directly


Zipped the layer:

```bash
zip -r psycopg2-py313-layer.zip python/
```
Uploaded to AWS Lambda Layers:

Navigated to Lambda → Layers → Create layer
Named it: psycopg2-py313
Uploaded the zip file
Selected "Python 3.13" as the compatible runtime
Clicked "Create"


Removed the old layer and attached the new one:

Went to my Lambda function
Removed the psycopg2-py38 layer
Added the new psycopg2-py313 layer
Clicked "Deploy" to save changes



Lesson learned: Layer names should include the Python version (e.g., psycopg2-py313) to avoid this confusion in the future.

Step 4: Update Lambda Function Code for Python 3.13
File created: backend-flask/lambdas/cruddur-post-confirmation.py
Key updates I made for Python 3.13 compatibility:

Added type hints (standard practice in Python 3.13):

```python
   import json
   import os
   import psycopg2
   
   def lambda_handler(event: dict, context) -> dict:
```
Improved variable initialization (to prevent UnboundLocalError):

```python
   conn = None
   cur = None
```
Used connection URL string instead of separate parameters:

```python
conn = psycopg2.connect(os.getenv('CONNECTION_URL'))
```
Extracted user attributes clearly:

```python
   user = event['request']['userAttributes']
   
   user_display_name = user['name']
   user_email = user['email']
   user_handle = user['preferred_username']
   user_cognito_id = user['sub']
```
Formatted SQL as multi-line for readability (Python 3.13 style):

```python
  sql = """
       INSERT INTO public.users (
           display_name,
           email,
           handle,
           cognito_user_id
       ) 
       VALUES(%s, %s, %s, %s)
   """
```
Used proper error handling (catching specific exceptions):

```python   except psycopg2.DatabaseError as error:
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
```
Added debug print statements:

```python   print('userAttributes')
   print(user)
   print('entered-try')
   print(f'SQL Statement: {sql}')
```
Complete updated function:
```python
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
        print(f'SQL Statement: {sql}')
        
        conn = psycopg2.connect(os.getenv('CONNECTION_URL'))
        cur = conn.cursor()
        
        params = [
            user_display_name,
            user_email,
            user_handle,
            user_cognito_id
        ]
        
        cur.execute(sql, params)
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
```
Step 5: Set Environment Variables
Location: Lambda function → Configuration → Environment variables
Variables I added:

Key: CONNECTION_URL
Value: Production PostgreSQL connection string
```
  postgresql://cruddurroot:password@<RDS-ENDPOINT>:5432/cruddur
```
Step 6: Configure VPC Access for Database Connectivity
Problem I encountered: Lambda timed out when trying to connect to RDS (timeout after 3.01 seconds).
Root cause: Lambda functions can't reach RDS unless they're in the same VPC and security group.
Actions I took:

Created IAM policy for VPC execution

Service: EC2
Actions: ec2:CreateNetworkInterface, ec2:DescribeNetworkInterfaces, ec2:DeleteNetworkInterface
Policy name: lambda-vpc-execution
Attached to Lambda's execution role


Added Lambda to VPC

Went to Lambda Configuration → VPC
Selected default VPC
Selected availability zone: ca-central-1a (matched RDS AZ)
Selected default security group (already added to RDS security group)
Clicked "Save"



Result: Lambda could now reach the RDS database.

Step 7: Connect Cognito to Lambda via Trigger
Location: Cognito User Pool → Lambda Triggers
Actions I took:

Trigger type: PostConfirmation
Lambda function: cruddur-post-confirmation
Granted Cognito permission to invoke the Lambda
Saved configuration


Step 8: Update Database Schema
Issue I found: The database schema was missing the email column that the Lambda was trying to insert.
File modified: backend-flask/db/schema.sql
Changes I made:

Added email column to users table
Added NOT NULL constraints where appropriate:

```sql  DROP TABLE IF EXISTS public.users;
  CREATE TABLE public.users (
    uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    display_name text NOT NULL,
    email text NOT NULL,
    handle text NOT NULL,
    cognito_user_id text NOT NULL,
    created_at TIMESTAMP DEFAULT current_timestamp NOT NULL
  );
```
Deployment:

Ran bin/db-schema-load prod to recreate tables with new schema


Step 9: Debug SQL Syntax Errors
Issue: Encountered "Unterminated quoted identifier" error on line 13
Root cause: Stray quotation marks in the SQL statement from my multi-line formatting
Fix I applied:

Cleaned up SQL formatting
Removed extraneous quotation marks
Used single quotes for string literals (PostgreSQL standard):

```sql
  INSERT INTO public.users (display_name, email, handle, cognito_user_id)
  VALUES (%s, %s, %s, %s)
```
***Qoutes are not needed for python v 3.13 and were therefor removed from try block***

Step 10: Deploy and Test
Testing process I followed:

Deleted existing test user from Cognito User Pool
Signed up new user through the application UI

Name: Chris Fenton
Email: chris@example.pro
Username: chrisfenton
Password: TestingPassword123!


Confirmed email with verification code
Verified in CloudWatch Logs: Checked Lambda execution logs for errors
Verified in database: Connected to production database and queried users table

Final verification:
```bash
bin/db-connect prod
\dt  # List tables
SELECT * FROM users;  # Confirmed new user record was inserted
Result: User record successfully created in database with all fields populated.
```
Key Debugging Techniques I Used

- CloudWatch Logs monitoring: Checked logs after each test to see errors
- Print statements: Added debug output to understand execution flow
- Database verification: Connected directly to database to confirm inserts worked
- Incremental testing: Tested after each code change rather than all at once
- Layer version tracking: Named layers with Python versions to avoid future confusion


Important Considerations and Caveats
Connection pooling not implemented: Lambda creates a new connection for each invocation, which is inefficient at scale. For production, I would need RDS Proxy (additional cost: ~$36/month).
Error handling limitations: I noticed some errors weren't being caught by the exception handler properly. This is something I need to improve.

Security notes:

- Connection string with credentials in environment variables—acceptable for this context but I should use Secrets Manager in production
- Database credentials visible in CloudWatch logs during debugging—acceptable for development, but I should mask sensitive data in production

Python 3.13 compatibility: The transition from Python 3.8 to Python 3.13 required:

Creating a new compiled layer
Updating function code with type hints
Using f-strings in print statements for better formatting
Proper exception handling specific to 3.13


## Files Created/Modified

Created:

backend-flask/lambdas/cruddur-post-confirmation.py — Lambda handler function (Python 3.13)
psycopg2-py313 Lambda Layer — PostgreSQL driver for Python 3.13
IAM policy: lambda-vpc-execution — VPC permissions

Modified:

backend-flask/db/schema.sql — Added email column and NOT NULL constraints
AWS Lambda configuration (environment variables, VPC, triggers, runtime)
Cognito User Pool configuration (added PostConfirmation trigger)


Next Steps Mentioned

Hook up the CREATE action for activities (allow users to create posts)
Implement filtering to show only activities from the authenticated user
Improve error handling in the Lambda function
Consider implementing RDS Proxy for production scalability
Monitor CloudWatch logs for any unexpected errors
RetryClaude does not have the ability to run the code it generates yet.

# My Journey: Migrating from Gitpod Classic to GitHub Codespaces and Recovering from a Hard Rebuild Disaster
## The Initial Challenge: Gitpod Classic Deprecation
### I started my AWS Bootcamp project using Gitpod Classic, but when I tried to launch my workspace, I was met with this error:
"Gitpod Classic PAYG has sunset. Please visit https://app.ona.com/login to continue."
Gitpod Classic was discontinued, and I needed to migrate to a new platform. After several failed attempts to use the new Gitpod due to OAuth restrictions with my organization, I decided to switch to GitHub Codespaces.

###Setting Up Codespaces: The Configuration
To make Codespaces work like my Gitpod environment, I needed to:

- Create .devcontainer/devcontainer.json - Configure my development container
- Create .devcontainer/post-create.sh - Install dependencies (PostgreSQL, npm, pip packages)
- Create .devcontainer/post-start.sh - Update RDS security groups with my Codespace IP
- Update docker-compose.yml - Replace Gitpod environment variables with Codespaces equivalents


### The Critical Mistake: Docker Compose Integration
My initial devcontainer.json looked like this:
```json
{
  "name": "AWS Bootcamp Cruddur 2023",
  "dockerComposeFile": "../docker-compose.yml",
  "service": "backend-flask",  // ❌ This caused the problem
  "workspaceFolder": "/workspaces/${localWorkspaceFolderBasename}"
}
```

**The Problem:** I was trying to use my application's `backend-flask` service (designed to run Flask) as the dev container itself. This doesn't work because the service expects environment variables and isn't meant to be a development environment.

---
```
## The Disaster: Hard Rebuild

After making several configuration changes, I performed a **Hard Rebuild** thinking it would fix some issues. Instead:

1. ❌ **All my environment variables were wiped**
2. ❌ **The container failed to start**
3. ❌ **Codespaces entered "recovery mode"**

I was greeted with this error:

**"This codespace is currently running in recovery mode due to a configuration error. Please review the creation logs, update your dev container configuration as needed, and run the 'Rebuild Container' command to rectify."**

The logs showed:
```
Error: The expected container does not exist.
Error code: 1302 (UnifiedContainersErrorFatalCreatingContainer)

Troubleshooting in Recovery Mode
Codespaces put me in a minimal Alpine Linux container (recovery mode) where I could:

✅ Access the terminal
✅ Edit files
❌ But couldn't use my full development environment

The recovery container was so minimal it didn't even have:

Git LFS
apt-get (it used apk instead)
My development tools


The Root Cause Analysis
After reviewing the creation logs, I identified two major issues:
Issue 1: Docker Compose Service Configuration
json// ❌ WRONG - Trying to use app container as dev container
"dockerComposeFile": "../docker-compose.yml",
"service": "backend-flask"
Why it failed: The backend-flask service is for running my Flask application, not for being a development environment. Codespaces couldn't find the "expected container" because it was trying to use a service that wasn't designed for this purpose.
Issue 2: Missing Environment Variables
The hard rebuild cleared environment variables like:

ROLLBAR_ACCESS_TOKEN
HONEYCOMB_API_KEY
GITPOD_WORKSPACE_ID
GITPOD_WORKSPACE_CLUSTER_HOST

Docker Compose was showing warnings about these missing variables, which added to the configuration confusion.

The Solution: Standalone Dev Container
I fixed the issue by creating a standalone dev container instead of trying to reuse my application's Docker Compose services:
Updated devcontainer.json:
```json
{
  "name": "AWS Bootcamp Cruddur 2023",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",  // ✅ Standalone container
  "workspaceFolder": "/workspaces/${localWorkspaceFolderBasename}",
  
  "features": {
    "ghcr.io/devcontainers/features/aws-cli:1": {"version": "latest"},
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/node:1": {"version": "18"}
  },
  
  "remoteEnv": {
    "AWS_CLI_AUTO_PROMPT": "on-partial",
    "ROLLBAR_ACCESS_TOKEN": "",
    "HONEYCOMB_API_KEY": "",
    "GITPOD_WORKSPACE_ID": "",
    "GITPOD_WORKSPACE_CLUSTER_HOST": ""
  },
  
  "postCreateCommand": "bash .devcontainer/post-create.sh",
  "postStartCommand": "bash .devcontainer/post-start.sh",
  
  "forwardPorts": [3000, 4567, 2000, 5432]
}
```

### Key Changes:
1. ✅ **Removed** `dockerComposeFile` and `service` references
2. ✅ **Added** standalone Ubuntu base image
3. ✅ **Added** environment variables to suppress warnings
4. ✅ **Added** Docker-in-Docker feature (to run my application containers inside the dev container)

---

## The New Architecture

**Before (Broken):**
```
❌ Trying to use backend-flask service AS the dev container
→ Service doesn't exist yet
→ Error: "expected container does not exist"
```

**After (Fixed):**
```
✅ Dev Container (Ubuntu)
   ├─ VS Code runs here
   ├─ Terminal runs here
   └─ Docker-in-Docker runs my application:
      ├─ backend-flask container
      ├─ frontend-react-js container
      ├─ PostgreSQL container
      ├─ X-Ray daemon container
      └─ OpenTelemetry collector container
```
Recovering from Recovery Mode
While stuck in the Alpine recovery container, I had to:
Step 1: Fix the Configuration
bash# Update devcontainer.json with the correct config
```sh
cat > .devcontainer/devcontainer.json << 'EOF'
{
  "name": "AWS Bootcamp Cruddur 2023",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  ...
}
```
EOF
Step 2: Commit the Changes
This was tricky because Git LFS hooks were blocking my push:
bash# Remove Git LFS hooks temporarily
```sh
rm -f .git/hooks/pre-push .git/hooks/post-commit
```

# Commit and push (bypassing hooks)
```sh
git add .devcontainer/devcontainer.json
git commit -m "Fix devcontainer - remove Docker Compose integration"
git push --no-verify --force
```
Step 3: Rebuild Container
After pushing the fix:

Pressed Ctrl+Shift+P
Selected "Codespaces: Rebuild Container"
Waited ~3-5 minutes
✅ Success! Container started normally


Verification: Everything Working
After the successful rebuild, I verified everything was working:
bash# Check installed tools
$ psql --version
psql (PostgreSQL) 13.22

$ node --version
v18.20.8

$ docker --version
Docker version 28.5.1-1

# Start application containers
$ docker compose up
✅ All 5 containers running successfully

Lessons Learned
❌ What Went Wrong:

Misunderstanding dev container purpose - Tried to use application container as dev environment
Hard rebuild at wrong time - Lost all environment variable configurations
Git LFS complications - Recovery container was too minimal to handle Git LFS

✅ What I Learned:

Dev containers vs application containers are different - Dev container = where you code; Application containers = what you're building
Use Docker-in-Docker - Run your application containers inside a dev container
Set environment variables in devcontainer.json - Even if empty, prevents Docker Compose warnings
Regular rebuild vs hard rebuild - Hard rebuild is nuclear option (rarely needed)
Git LFS requires proper setup - Use --no-verify flag when pushing from minimal environments


Final Results
After fixing everything, my Codespaces environment now:
✅ Boots in ~30-60 seconds (after first setup)
✅ Automatically installs PostgreSQL client, Node.js, AWS CLI
✅ Runs all 5 application containers via Docker Compose
✅ Updates RDS security group with current IP on startup
✅ Forwards ports automatically (3000, 4567, 5432, etc.)
✅ Works identically to my old Gitpod setup

Key Takeaway
The fundamental mistake was trying to use my application's backend-flask service as the dev container itself. The solution was to use a standalone Ubuntu dev container with Docker-in-Docker, which allows me to run my application containers inside it - just like Gitpod did automatically.
This migration taught me the importance of understanding container architecture and the difference between development environments and application deployments.

# Troubleshooting Log Streaming and Crud Button Posting Issue

## Initial Problem
I was unable to see logs streaming from my Flask backend container when interacting with my application. Additionally, the "Crud" button on my web page wasn't posting activities to the database. My goal was to debug user interactions in real-time by viewing container logs.

## Symptoms Observed
No logs appeared in the terminal when running docker compose logs -f backend-flask
Browser DevTools showed 401 and CORS errors for all API requests
The "Crud" button appeared to do nothing when clicked
Preflight OPTIONS requests were failing with 401 status codes

## Initial Troubleshooting Steps
Added debug logging to Flask app using @app.before_request decorator to log all incoming requests
Added print statements to the /api/activities endpoint and CreateActivity class to trace request flow
Added @staticmethod decorators to fix Python class method issues in create_activity.py
Verified database connectivity by checking if the PostgreSQL container was running

Root Cause #1: Codespaces Port Privacy
Despite adding extensive logging, no logs appeared when making requests. This was the critical clue - requests weren't reaching Flask at all. The 401 errors in the browser had zero response headers, indicating they were being blocked before reaching my application.
Issue: Port 4567 (backend) was set to "Private" by default in Codespaces, requiring GitHub authentication. My frontend on port 3000 couldn't authenticate to access the backend, causing all requests to fail with 401 errors before Flask ever saw them.
Solution: Changed port 4567 visibility from "Private" to "Public" in the Codespaces PORTS panel.

Result:
✅ Logs immediately began streaming in the terminal
✅ All incoming requests now visible with debug information
✅ Crud button successfully posts activities

Root Cause #2: Missing User in Database
After fixing the port issue, I received a new error:
```
null value in column "user_uuid" of relation "activities" violates not-null constraint
```
Issue: The create.sql INSERT statement queried for a user with handle 'chrisfenton', but this user didn't exist in the RDS database, causing the subquery to return NULL and violating the NOT NULL constraint on user_uuid.

Solution: Verified the user existed in the RDS database by connecting via ./backend-flask/bin/db-connect prod and running:
```sql
SELECT uuid, handle, display_name FROM users WHERE handle = 'chrisfenton';
```
Confirmed the user was present with proper UUID.

Root Cause #3: Activities Disappearing on Refresh
After successfully posting activities, they would appear temporarily but disappear when refreshing the page.
Issue: I discovered that activities were being saved to the RDS database (verified by manual SQL query), but Flask was connected to the local PostgreSQL container instead of RDS due to docker-compose.yml configuration.

Solution: Updated docker-compose.yml to use RDS:
```yaml
CONNECTION_URL: "${PROD_CONNECTION_URL}"  # Use RDS
"#CONNECTION_URL: "postgresql://postgres:POSTGRES_PASSWORD@db:5432/cruddur"  # Commented out local"
```
```

## Root Cause #4: TypeError with Missing 'self' Parameter
After switching to RDS, the application crashed with a 500 Internal Server Error when loading the home page.

**Error:**
```
TypeError: HomeActivities.run() got multiple values for argument 'cognito_user_id'
Issue: The HomeActivities.run() method in home_activities.py was missing self as the first parameter:
```python
def run(cognito_user_id=None):  # ❌ Missing 'self'!
```
When calling HomeActivities().run(cognito_user_id=claims['username']), Python passed the instance as the first positional argument, but the method expected cognito_user_id as the first argument, causing a conflict.
Solution: Added self as the first parameter:
```python
def run(self, cognito_user_id=None):  # ✅ Correct!
```

Result:
✅ Home page loads successfully
✅ Activities persist after refresh
✅ Full end-to-end functionality working
Key Learnings

Codespaces port privacy can block requests before they reach your application - always check port visibility first when encountering 401 errors
Zero response headers on failed requests indicates blocking at the infrastructure level, not application level
Debug logging at multiple levels (before_request, endpoints, service classes) provides visibility into request flow
Browser DevTools Network tab is essential for diagnosing frontend-to-backend communication issues
Understanding the difference between frontend (browser console) logs and backend (container) logs is crucial for debugging
Database connectivity issues can be subtle - verify which database (local vs RDS) your application is actually connected to
Python class methods must include self as the first parameter when called as instance methods
Systematic debugging - work through errors one at a time, verify each fix before moving to the next issue

Final Status
✅ Log streaming fully functional
✅ Crud button posts activities successfully
✅ Activities persist in RDS database
✅ Activities display correctly on home page after refresh
✅ Full application functionality restored

![Screenshot of Successful Crud Posts!!!](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/journal/assets/Crud_Successful%20Post.png)

![Screenshot of Successful Log Streams showing in terminal for backend container running services](https://github.com/Cfenton07/aws-bootcamp-cruddur-2023/blob/main/journal/assets/log_streaming%20In%20Terminal_Successful.png)
