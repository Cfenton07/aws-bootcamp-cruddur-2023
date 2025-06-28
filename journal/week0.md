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
Tracing the request from the user (Client) to the backend services.

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

### What if my ALB was only connected to my front end? Would the front end still be able to communicate with the back end via the rest api? is this still scalable?


Of course. Let's analyze that architectural change.

If your Application Load Balancer (ALB) was only connected to the frontend, the front end could still communicate with the backend via the REST API, but it would require a different architectural setup.

Here’s a breakdown of how it would work and the implications for scalability.

**Scenario 1:** Backend is in the same VPC but private
In this scenario, your backend is not publicly exposed to the internet. This is a very common and more secure approach.

How it works:

User Request: A user makes a request to your application's domain name, e.g., https://your-app.com.

ALB Routes to Frontend: The ALB, which is configured to be internet-facing, receives the request and routes it to your public-facing frontend containers. The ALB's target group would only include the frontend containers.

Frontend Serves UI: The frontend container serves the HTML, CSS, and JavaScript files to the user's browser.

Client-Side API Call: Once the JavaScript is running in the user's browser, it needs to make an API call to get data.

Where does it call? It can't call a private backend directly. The user's browser is on the public internet.

Solution: The backend would need its own separate, internet-facing API endpoint. This would typically be a second ALB or an API Gateway instance configured to route to the backend containers. This endpoint would have its own domain name, for example, https://api.your-app.com.

Communication: The frontend JavaScript would be configured to make fetch or axios requests to https://api.your-app.com/users to get data. The API calls would travel from the user's browser, over the public internet, to the separate backend endpoint.

**Is it scalable?**

Yes, this setup is very scalable. You can independently scale both your frontend and backend. The backend would have its own ALB, allowing you to add more backend containers as traffic increases, just as the frontend can scale.

**Pros:**

 - Security: The backend has a dedicated, public-facing entry point. You can apply different WAF rules, rate limiting, and security policies specifically for your API traffic.

 - Decoupling: The frontend and backend are completely decoupled at the network level. They can be deployed and scaled independently without affecting each other's traffic paths.

 - Clear Separation: It enforces a clean separation of concerns: one entry point for the UI assets and another for the data API.

**Cons:**

 - Higher Cost: You would need a second ALB, which doubles the cost of your load balancers.

 - Increased Complexity: You have two public endpoints and need to manage DNS, certificates, and security for both.

**Scenario 2:** Backend is completely private, and the Frontend acts as a proxy
This is a more complex but less common setup for a pure client-side application.

How it works:

User Request: The user requests https://your-app.com.

ALB Routes to Frontend: The ALB routes the request to the frontend containers.

Frontend Serves UI: The frontend serves the static files (HTML, CSS, JS) to the user's browser.

Client-Side API Call: When the JavaScript in the browser needs to make an API call, it sends the request back to the same frontend server, e.g., https://your-app.com/api/users.

Frontend Proxies the Request: The frontend server (e.g., a Node.js/Express server or an Nginx server) receives the API request. It doesn't process the data itself. Instead, it acts as a reverse proxy. It forwards the request internally within the VPC to the backend service. The backend service would have an internal ALB or a private DNS name, and it is not exposed to the internet.

Backend Processes: The backend processes the request and sends the data back to the frontend proxy.

Frontend Sends Response: The frontend proxy sends the data back to the user's browser.

**Is it scalable?**

This can be scalable, but it adds more complexity to your frontend. The frontend now has a dual responsibility: serving static files and acting as a proxy. This means the frontend could become a bottleneck if it's not scaled to handle both tasks.

**Pros:**

 - Security: Your backend is never exposed to the public internet, making it highly secure. All traffic is funneled through the proxy layer.

 - Single Endpoint: You only have one public endpoint (https://your-app.com), which simplifies DNS and SSL certificate management.

 - CORS Issues: It avoids cross-origin resource sharing (CORS) issues because all calls originate from the same domain.

**Cons:**

 - Frontend Bottleneck: The frontend must handle both UI traffic and API proxy traffic. This adds more load and requires careful scaling.

 - Increased Complexity: You need to configure the frontend server to act as a proxy, which requires additional logic (e.g., using a library like http-proxy-middleware in Node.js).

 - Latency: There is a small amount of added latency because every API call has to pass through the frontend server first.

**Conclusion**
In your diagram, the ALB is connected to both the frontend and backend to use path-based routing. This is generally the most straightforward and cost-effective approach for this type of architecture.

If you connected the ALB only to the frontend, you would need to choose between the two scenarios above:

A separate public endpoint for the backend (recommended for security and scalability). This means you would need a second ALB.

Using the frontend as a proxy (simpler endpoint, but more complex frontend).

So, yes, it's still scalable in both scenarios, but the single-ALB-with-path-based-routing shown in your original diagram is often considered a great balance of simplicity, cost, and scalability for a multi-tiered web application.


### So this current diagram has a potential security risk due to the ALB being public facing and connected to both the front end and back end; therefore it is a potential attack vector for bad actors to expose?


Excellent question. It's a very sharp observation and a critical consideration for any security-conscious architecture.

Let's clarify this point: The design in the diagram is not inherently insecure, but it absolutely requires proper configuration and security controls to mitigate potential risks.

You are correct that the public-facing ALB is a potential attack vector, as it's the first point of entry for all internet traffic.

Here's a breakdown of the potential risks and, more importantly, the security layers already present in the diagram to defend against them.

**Potential Security Risks (The Attack Vector)**
 1 Direct API Access: A malicious actor could try to directly access your backend API endpoints (e.g., your-app.com/api/create-user) without going through your frontend application. They could use tools like cURL or Postman to try and manipulate your data.

 2 Denial of Service (DoS) / DDoS: A massive flood of traffic could be sent to your ALB to overwhelm your backend services and make your application unavailable.

 3 Application Layer Attacks: Malicious payloads (e.g., SQL injection, cross-site scripting) could be sent to exploit vulnerabilities in your backend code.

 4 Unauthenticated Access: An attacker could try to access endpoints that are meant to be secured without a valid user token or session.

**How the Diagram's Architecture Mitigates These Risks**
The diagram includes several components specifically designed to address these exact risks. This shows that the architecture is designed with security in mind, even though the entry point is public.

 1 AWS WAF (Web Application Firewall): This is your first line of defense at the application layer. This is the single most important component for mitigating the risks you're asking about. The WAF sits in front of the ALB and inspects every single request. It can:

  - Block common attacks: It has managed rules to protect against SQL injection, XSS, and other OWASP Top 10 vulnerabilities.

  - Rate limiting: It can block or throttle IP addresses that send a suspiciously high number of requests, protecting against DDoS attacks.

  - Geographic restrictions: It can block traffic from specific countries.

  - Custom rules: You can create custom rules to block specific IP addresses or request patterns.

 2 Authentication: The diagram shows an Authentication component before the ALB. This is a bit unusual in its placement (typically, it's a service the backend calls), but it implies that authentication is a critical step. For a REST API, this would mean:

  - Token-based Authentication: The API Gateway or Backend would require a valid JWT (JSON Web Token) or other access token for most, if not all, API endpoints.

  - Unauthorized Access: If a bad actor tries to call /api/users directly without a valid token, the backend would simply return a 401 Unauthorized or 403 Forbidden error. This is a fundamental security practice for APIs.

 3 Application Load Balancer (ALB): The ALB itself offers security features. It can handle SSL/TLS termination, ensuring all traffic between the user and the ALB is encrypted. It also prevents the attacker from ever seeing the private IP addresses of your backend containers.

 4 VPC & Subnets: The backend containers live inside a VPC and are not directly exposed to the internet. They can only receive traffic from the ALB. This means there is no direct public route to the containers, which is a key security measure.

 5 Backend Container Logic: The logic within your backend application itself is the final line of defense.

  - Input Validation: All data received from the frontend (or a malicious actor) must be sanitized and validated to prevent injection attacks.

  - Least Privilege: The backend should only have the minimum necessary permissions to interact with the databases and other services.

**Conclusion**
You are right to be concerned about the public-facing nature of the ALB. It is a potential attack vector.

However, the architecture diagram also shows that it is a controlled and defended attack vector. The presence of AWS WAF and a dedicated Authentication layer, combined with the logic of the backend and the security of the VPC, means that the design is structured to funnel all traffic through a secure, monitored, and filtered entry point.

A well-configured WAF and a robust authentication system transform the ALB from a vulnerability into a fortified gate. The real security of this architecture depends on the implementation of these security components and the code in your backend.

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
