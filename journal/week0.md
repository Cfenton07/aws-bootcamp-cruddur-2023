# Week 0 — Billing and Architecture
### I installed AWS CLI for my GitPod when it launches

### I installed AWS CLI to use partial autoprompt mode to make it easier to debug CLI commands

### The bash commands that I will use will be the same as the AWS CLI

### I created a logical desgin for my cloud archtecture
![AWS Logical Design](assets/AWS_Fenton_LogicalDiagram%202025-05-14%20191420.png)
[Lucid Charts Share Link](https://lucid.app/lucidchart/851a16af-b649-48c6-85bd-dab2b155625c/edit?viewport_loc=-456%2C-381%2C4173%2C1876%2C0_0&invitationId=inv_f58ad7de-badf-49b5-b3f6-c29148872ed3)
### I created a billing alarm via the AWS CLI via GitPod
```
>** task: **
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
> {
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
>} 

