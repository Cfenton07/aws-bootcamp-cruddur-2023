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
