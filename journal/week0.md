# Week 0 — Billing and Architecture
### I installed AWS CLI for my GitPod when it launches

### I installed AWS CLI to use partial autoprompt mode to make it easier to debug CLI commands

### The bash commands that I will use will be the same as the AWS CLI
```bash
 task: 
 name: aws-cli
  env:
    AWS_CLI_AUTO_PROMPT: on-partial
  init: |
    cd /workspace
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install
    cd $THEIA_WORKSPACE_ROOT
```
### I created a logical desgin for my cloud archtecture
![AWS Logical Design](assets/AWS_Fenton_LogicalDiagram%202025-05-14%20191420.png)
[Lucid Charts Share Link](https://lucid.app/lucidchart/851a16af-b649-48c6-85bd-dab2b155625c/edit?viewport_loc=-456%2C-381%2C4173%2C1876%2C0_0&invitationId=inv_f58ad7de-badf-49b5-b3f6-c29148872ed3)

### Overall Architecture Pattern
This diagram represents a modern, multi-tiered web application architecture on AWS, combining both traditional containerized services (ECS) with serverless components (S3, Lambda, API Gateway) for specific tasks. It's designed for scalability, security, and high availability.

#### Main Request Flow (Top Section)
Let's trace a request from the user (Client) to the backend services.

**Client:** This represents the end-user's device, likely a web browser or a mobile app.

**DNS (Route 53):** The request first hits a DNS service, which translates a human-readable domain name (like your-app.com) into an IP address. The Route 53 icon indicates that AWS's managed DNS service is being used.

**AWS WAF (Web Application Firewall):** The request is then filtered by a WAF. This is a crucial security component. It inspects incoming web traffic to protect the application from common web exploits and vulnerabilities (like SQL injection, cross-site scripting) before the traffic even reaches your application servers.

**Authentication:** The request proceeds to an authentication service (e.g., AWS Cognito, or an in-house solution). This component is responsible for verifying the user's identity and ensuring they are authorized to access the application.

**Application Load Balancer (ALB):** After authentication, the traffic hits the ALB. The ALB is a managed service that automatically distributes incoming application traffic across multiple targets, like the containers in your cluster. This provides load balancing to prevent any single container from being overwhelmed and enables high availability.

**Virtual Private Cloud (VPC):** The large purple box represents the VPC, which is your own private, isolated network in the AWS cloud. All your AWS resources within this diagram live inside this private network.

**Availability Zone:** The blue dashed box inside the VPC represents an Availability Zone (AZ). An AZ is a geographically distinct location within an AWS region. Placing resources in multiple AZs ensures that if one location fails, your application remains online. The diagram shows resources deployed in a single AZ for simplicity, but in a real-world production environment, you would replicate them across at least two AZs for fault tolerance.

**ECS Cluster Container:** This is the core of your application's compute layer.

 - ECS (Elastic Container Service) is a container orchestration service that allows you to run, stop, and manage Docker containers on a cluster of EC2 instances or using AWS Fargate.

 - The ECS Cluster Container box represents the entire cluster, which contains your containerized services.

**ECS EC2 Container:** This indicates that the ECS cluster is using EC2 instances as its compute layer, as opposed to the serverless Fargate option. You manage the underlying EC2 instances, giving you more control.

**Front-end and Backend Containers:** Inside the cluster, there are two distinct container services:

 - Front-end (labeled apps): This likely serves the user interface of your application. It could be a Node.js server serving React/Vue/Angular files or a simple web server (like Nginx) serving static assets. It communicates with the backend via the "Rest API" connection.

 - Backend (labeled api): This is the core business logic of your application. It's where the API endpoints live and where data is processed. This is what handles the Rest API requests from the frontend.

#### Data and Storage Components (Right Section)
The backend interacts with several data services:

**Amazon DynamoDB:** This is a fully managed, serverless NoSQL key-value database. It's used for storing data that requires high performance and low latency, such as user profiles, session data, or other key-value pairs.

**AWS AppSync:** This is a managed GraphQL service. It allows you to build a flexible API that can fetch data from multiple sources (like DynamoDB and RDS). The "Direct Messaging Queries" arrow from DynamoDB to AppSync suggests that AppSync is used to handle real-time subscriptions for messaging data, allowing updates to be pushed to clients instantly.

**Amazon RDS (Relational Database Service):** This is a managed relational database service (like MySQL, PostgreSQL, etc.). It's used for structured data that requires a relational schema. The Primary DB Queries arrow from the Backend container to RDS indicates that this is the main transactional database for the application.

**Serverless Cache:** This component, likely Amazon ElastiCache (Redis or Memcached), is used to cache frequently accessed data from the databases. Caching data in memory reduces the load on the database and significantly improves the application's response time for read-heavy workloads. The "queries" arrow from the backend suggests the backend checks the cache before hitting the database.

#### Serverless Image Processing Flow (Bottom Section)
This is a separate, event-driven workflow that runs independently of the main web application's request/response cycle.

**S3 Bucket (PUT/Uploads):** A user or a service uploads a new image file to the PUT/Uploads folder (a specific prefix/path) within an S3 (Simple Storage Service) bucket. S3 is a scalable object storage service used for storing files, static assets, backups, etc.

**Process Image (Lambda Function):** The "PUT/Uploads" arrow indicates that the upload event triggers a Lambda function named Process_Image. This is the core of the serverless workflow. The Lambda function automatically executes code in response to the upload event.

**Processing:** Inside the Process_Image Lambda, the code likely performs tasks like:

 - Reading the uploaded image from S3.

 - Resizing it to different sizes (e.g., thumbnail, medium, large).

 - Adding watermarks or other metadata.

 - Optimizing the image for web delivery.

**S3 Bucket (PUT/renders):** After processing, the Lambda function writes the rendered (processed) image files back to a different folder in the S3 bucket, likely PUT/renders.

**HTTP Notification:** This suggests a notification is sent after the image is processed. This could be an SNS (Simple Notification Service) topic, an SQS (Simple Queue Service) queue, or a direct HTTP call to another service, alerting it that the image is ready.

#### Summary of Component Functions
Client: User device.

- DNS/Route 53: Directs traffic to the application.

- WAF: Provides security against web exploits.

- Authentication: Verifies user identity.

- Application Load Balancer: Distributes traffic and ensures high availability.

- VPC: Isolated private network.

- Availability Zone: Ensures fault tolerance.

- ECS Cluster/Containers: Runs the core frontend and backend logic in a scalable, containerized environment.

- DynamoDB: NoSQL database for flexible, high-performance data.

- RDS: Relational database for structured, transactional data.

- AppSync: GraphQL service for efficient data fetching and real-time updates.

- Serverless Cache: Improves performance by caching frequently accessed data.

- S3: Scalable object storage for raw and processed images.

- Lambda: Serverless compute service that processes images in response to S3 events.

### I created a billing alarm via the AWS CLI via GitPod
```json
 {
"AlarmName": "DailyEstimatedCharges",
"AlarmDescription": "This alarm would be triggered if the daily estimated charges exceeds 1$",
"ActionsEnabled": true,
"AlarmActions": [
"arn:aws:sns:us-east-1:931637612335:fenton-billing-alarm"
],
"EvaluationPeriods": 1,
"DatapointsToAlarm": 1,
"Threshold": 1,
"ComparisonOperator": "GreaterThanOrEqualToThreshold",
"TreatMissingData": "breaching",
"Metrics": [{

		"ID": "m1",
		"MetricStat": {
		"Metric": {
			"Namespace": "AWS/Billing",
			"MetricName": "EstimatedCharges",                                                                                                                                                                                                              
			"Dimensions": [
				{
					"Name": "Currency",
					"Value": "USD"
				}
			]
		},
		"Period": 86400,
		"Stat": "Maximum"
	},
	"ReturnData": false
	},
{
	"Id": "e1",
	"Expression": "IF(RATE(m1)>0,RATE(m1)*86400,0)",
	"Label": "DailyEstimatedCharges",
	"ReturData": true
}]
} 
```
