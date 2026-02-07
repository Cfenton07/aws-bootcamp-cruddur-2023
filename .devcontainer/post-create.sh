#!/bin/bash
# ========================================
# POST-CREATE SETUP SCRIPT
# ========================================
# This script runs ONCE when the Codespace is first created
# Equivalent to the "init" tasks in your .gitpod.yml
#
# Purpose: Install all dependencies and tools needed for development
# When it runs: Only on first creation (not on restart)
# ========================================

# Exit immediately if any command fails (safety measure)
set -e

echo "============================================"
echo "🚀 Codespaces Post-Create Setup"
echo "============================================"

# ========================================
# INSTALL POSTGRESQL CLIENT
# ========================================
# This matches the "postgres" task in your .gitpod.yml
# Required for: connecting to database, running bin/db-* scripts

echo "📦 Installing PostgreSQL client..."

# Add PostgreSQL's official GPG key (for secure package installation)
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg

# Add PostgreSQL's package repository to apt sources
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# Update package list to include PostgreSQL packages
sudo apt update

# Install PostgreSQL client v13 and development libraries
# postgresql-client-13: Command-line tool (psql) for connecting to databases
# libpq-dev: Development files needed by Python's psycopg2 package
sudo apt install -y postgresql-client-13 libpq-dev

# ========================================
# INSTALL AWS SESSION MANAGER PLUGIN
# ========================================
# Required for: ECS Exec - shell into running Fargate containers
# This matches the "fargate" task in .gitpod.yml
# Use case: Debug containers with `aws ecs execute-command`

echo "📦 Installing AWS Session Manager Plugin..."

# Download the Session Manager plugin for Ubuntu
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"

# Install the plugin
sudo dpkg -i session-manager-plugin.deb

# Clean up the downloaded file
rm session-manager-plugin.deb

# Verify installation
echo "Session Manager Plugin version: $(session-manager-plugin --version)"

# ========================================
# INSTALL FRONTEND DEPENDENCIES
# ========================================
# This matches the "react-js" task in your .gitpod.yml
# Required for: running the React frontend application

echo "📦 Installing frontend dependencies..."

# Navigate to frontend directory
cd frontend-react-js

# Install all npm packages listed in package.json
# This downloads React, dependencies, and dev tools
npm install

# Return to root directory
cd ..

# ========================================
# INSTALL BACKEND DEPENDENCIES
# ========================================
# Python packages needed by Flask backend
# Required for: Flask, PostgreSQL driver (psycopg2), AWS SDK (boto3), etc.

echo "📦 Installing backend dependencies..."

# Navigate to backend directory
cd backend-flask

# Create virtual environment
python3 -m venv venv

# Activate it for subsequent commands
source venv/bin/activate

# Install all Python packages listed in requirements.txt
# Includes: Flask, psycopg2, boto3, and other dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Return to root directory
cd ..

# ========================================
# SETUP BASH SCRIPTS
# ========================================
# Make all database management scripts executable
# Required for: running bin/db-create, bin/db-drop, etc.

echo "🔧 Setting up bash scripts..."

# Add execute permission to all scripts in backend-flask/bin/
# chmod +x = add execute permission
# * = all files in the directory
chmod +x backend-flask/bin/*

# Also make ECS deployment scripts executable
if [ -d "bin/ecs" ]; then
  chmod +x bin/ecs/*
fi

# ========================================
# COMPLETION MESSAGE
# ========================================

echo "============================================"
echo "✅ Post-create setup complete!"
echo ""
echo "Installed:"
echo "  - PostgreSQL client (psql)"
echo "  - AWS Session Manager Plugin (for ECS Exec)"
echo "  - Frontend dependencies (npm packages)"
echo "  - Backend dependencies (pip packages)"
echo "  - Database management scripts"
echo ""
echo "Next: The post-start script will update RDS security group"
echo "============================================"