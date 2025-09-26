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
