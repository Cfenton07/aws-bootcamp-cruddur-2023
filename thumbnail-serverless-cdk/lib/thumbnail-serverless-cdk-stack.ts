import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class ThumbnailServerlessCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Environment variables
    const bucketName: string = process.env.THUMBING_BUCKET_NAME as string;
    const functionPath: string = process.env.THUMBING_FUNCTION_PATH as string;
    const folderInput: string = process.env.THUMBING_S3_FOLDER_INPUT as string;
    const folderOutput: string = process.env.THUMBING_S3_FOLDER_OUTPUT as string;
    const webhookUrl: string = process.env.THUMBING_WEBHOOK_URL as string;
    const topicName: string = process.env.THUMBING_TOPIC_NAME as string;

    // Create S3 bucket for avatar images
    const bucket = this.createBucket(bucketName);

    // Create Lambda function for image processing
    const lambdaFunction = this.createLambda(
      functionPath,
      bucketName,
      folderInput,
      folderOutput
    );

    // Create SNS topic and subscription
    const snsTopic = this.createSnsTopic(topicName);
    this.createSnsSubscription(snsTopic, webhookUrl);

    // Wire S3 event notification to Lambda
    this.createS3NotifyToLambda(folderInput, lambdaFunction, bucket);

    // Wire S3 event notification to SNS
    this.createS3NotifyToSns(folderOutput, snsTopic, bucket);

    // Grant Lambda read/write access to the S3 bucket
    this.createPolicyBucketAccess(bucket, lambdaFunction);
  }

  createBucket(bucketName: string): s3.IBucket {
    const bucket = new s3.Bucket(this, 'ThumbingBucket', {
      bucketName: bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    return bucket;
  }

  createLambda(
    functionPath: string,
    bucketName: string,
    folderInput: string,
    folderOutput: string
  ): lambda.IFunction {
    const lambdaFunction = new lambda.Function(this, 'ThumbLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(functionPath),
      environment: {
        DEST_BUCKET_NAME: bucketName,
        FOLDER_INPUT: folderInput,
        FOLDER_OUTPUT: folderOutput,
        PROCESS_WIDTH: '512',
        PROCESS_HEIGHT: '512',
      },
    });
    return lambdaFunction;
  }

  createSnsTopic(topicName: string): sns.ITopic {
    const snsTopic = new sns.Topic(this, 'ThumbingTopic', {
      topicName: topicName,
    });
    return snsTopic;
  }

  createSnsSubscription(snsTopic: sns.ITopic, webhookUrl: string): void {
    snsTopic.addSubscription(
      new subscriptions.UrlSubscription(webhookUrl)
    );
  }

  createS3NotifyToLambda(
    prefix: string,
    lambdaFunction: lambda.IFunction,
    bucket: s3.IBucket
  ): void {
    const destination = new s3n.LambdaDestination(lambdaFunction);
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      destination,
      { prefix: prefix }
    );
  }

  createS3NotifyToSns(
    prefix: string,
    snsTopic: sns.ITopic,
    bucket: s3.IBucket
  ): void {
    const destination = new s3n.SnsDestination(snsTopic);
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      destination,
      { prefix: prefix }
    );
  }

  createPolicyBucketAccess(
    bucket: s3.IBucket,
    lambdaFunction: lambda.IFunction
  ): void {
    const s3ReadWritePolicy = new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`${bucket.bucketArn}/*`],
    });
    lambdaFunction.addToRolePolicy(s3ReadWritePolicy);
  }
}
