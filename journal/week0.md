# Week 0 — Billing and Architecture
I am going to install AWS CLI for my GitPod when it launches

I am going to install AWS CLI to use partial autoprompt mode to make it easier to debug CLI commands

The bash commands that I will use will be the same as the AWS CLI

task:
- name: aws-cli
  env:
    AWS_CLI_AUTO_PROMPT: on-partial
  init: |
    cd /workspace
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install
    cd $THEIA_WORKSPACE_ROOT
