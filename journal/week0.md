# Week 0 — Billing and Architecture
### I am going to install AWS CLI for my GitPod when it launches

### I am going to install AWS CLI to use partial autoprompt mode to make it easier to debug CLI commands

### The bash commands that I will use will be the same as the AWS CLI

>***task:
>- name: aws-cli
>  env:
>    AWS_CLI_AUTO_PROMPT: on-partial
>  init: |
>    cd /workspace
>    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
>    unzip awscliv2.zip
>    sudo ./aws/install
>    cd $THEIA_WORKSPACE_ROOT
** Created a cloud watch billing alarm **
>  {
>"AlarmName": "DailyEstimatedCharges",
>"AlarmDescription": "This alarm would be triggered if the daily estimated charges exceeds 1$",
>"ActionsEnabled": true,
>"AlarmActions": [
>"arn:aws:sns:us-east-1:931637612335:fenton-billing-alarm"
>],
>"EvaluationPeriods": 1,
>"DatapointsToAlarm": 1,
>"Threshold": 1,
>"ComparisonOperator": "GreaterThanOrEqualToThreshold",
>"TreatMissingData": "breaching",
>"Metrics": [{
>
>		"ID": "m1",
>		"MetricStat": {
>		"Metric": {
>			"Namespace": "AWS/Billing",
>			"MetricName": "EstimatedCharges",                                                                                                                                                                                                                      >                                                                                                                                                                                                                                              
>			"Dimensions": [
>				{
>					"Name": "Currency",
>					"Value": "USD"
>				}
>			]
>		},
>		"Period": 86400,
>		"Stat": "Maximum"
>	},
>	"ReturnData": false
>	},
>{
>	"Id": "e1",
>	"Expression": "IF(RATE(m1)>0,RATE(m1)*86400,0)",
>	"Label": "DailyEstimatedCharges",
>	"ReturData": true
>}
>} ***

