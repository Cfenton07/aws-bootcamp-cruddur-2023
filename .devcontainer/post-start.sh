#!/bin/bash
# ========================================
# POST-START SETUP SCRIPT
# ========================================
# This script runs EVERY TIME the Codespace starts or restarts
# Equivalent to the "command" section in your .gitpod.yml postgres task
#
# Purpose: Update RDS security group with current Codespace IP address
# When it runs: Every start, restart, or wake from sleep
# Why needed: Codespaces get different IP addresses each time they start
# ========================================

echo "============================================"
echo "🌐 Updating RDS Security Group with Codespace IP"
echo "============================================"

# ========================================
# GET CURRENT CODESPACE IP ADDRESS
# ========================================
# Each Codespace has a unique public IP address
# We need to tell AWS RDS to allow connections from this IP

# Use ifconfig.me service to get our public IP address
# -s flag = silent (no progress bar)
# This replaces $GITPOD_IP from your .gitpod.yml
export CODESPACE_IP=$(curl -s ifconfig.me)

echo "Current Codespace IP: $CODESPACE_IP"

# ========================================
# CHECK AWS CREDENTIALS
# ========================================
# Verify that AWS access keys are available as environment variables
# These should be set in GitHub Codespaces Secrets

if [ -z "$AWS_ACCESS_KEY_ID" ]; then
  # -z checks if variable is empty/unset
  echo "⚠️  AWS credentials not found in environment"
  echo ""
  echo "To fix this:"
  echo "1. Go to: https://github.com/settings/codespaces"
  echo "2. Add these secrets:"
  echo "   - AWS_ACCESS_KEY_ID"
  echo "   - AWS_SECRET_ACCESS_KEY"
  echo "   - AWS_DEFAULT_REGION"
  echo "3. Rebuild your Codespace"
  echo ""
  # Exit gracefully (don't fail the entire startup)
  exit 0
fi

# ========================================
# CHECK IF RDS UPDATE SCRIPT EXISTS
# ========================================
# Your bootcamp includes a script at backend-flask/bin/rds-update-sg-rule
# This script uses AWS CLI to update the security group

if [ ! -f "backend-flask/bin/rds-update-sg-rule" ]; then
  # -f checks if file exists
  echo "⚠️  RDS update script not found at backend-flask/bin/rds-update-sg-rule"
  echo "Skipping security group update"
  exit 0
fi

# ========================================
# UPDATE RDS SECURITY GROUP
# ========================================
# Your existing rds-update-sg-rule script uses $GITPOD_IP
# We need to replace it with $CODESPACE_IP for Codespaces

echo "Running RDS security group update script..."

# Create a temporary version of the script with modifications:
# 1. Replace GITPOD_IP with CODESPACE_IP (for compatibility)
# 2. Replace $THEIA_WORKSPACE_ROOT with $(pwd) (Codespaces uses different workspace var)
sed "s/GITPOD_IP/CODESPACE_IP/g" backend-flask/bin/rds-update-sg-rule > /tmp/rds-update-temp.sh
sed -i "s/\$THEIA_WORKSPACE_ROOT/\$(pwd)/g" /tmp/rds-update-temp.sh

# Make the temporary script executable
chmod +x /tmp/rds-update-temp.sh

# Execute the modified script
if bash /tmp/rds-update-temp.sh; then
  # If script succeeds (exit code 0)
  echo "✅ Security group updated successfully!"
  echo "Your RDS database now allows connections from: $CODESPACE_IP"
else
  # If script fails (non-zero exit code)
  echo "❌ Failed to update security group"
  echo "Check that your AWS credentials are correct"
  echo "Check that DB_SG_ID and DB_SG_RULE_ID are set in the script"
fi

# Clean up temporary file
rm -f /tmp/rds-update-temp.sh

# ========================================
# HELPFUL TIPS
# ========================================

echo "============================================"
echo "💡 Helpful Tips:"
echo ""
echo "To manually update security group:"
echo "  export CODESPACE_IP=\$(curl ifconfig.me)"
echo "  ./backend-flask/bin/rds-update-sg-rule"
echo ""
echo "To connect to production database:"
echo "  ./backend-flask/bin/db-connect prod"
echo ""
echo "To start the application:"
echo "  docker compose up"
echo "============================================"