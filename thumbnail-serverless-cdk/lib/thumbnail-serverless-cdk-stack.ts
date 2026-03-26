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
    const assetsBucketName: string = process.env.THUMBING_BUCKET_NAME as string;
    const uploadsBucketName: string = process.env.THUMBING_UPLOADS_BUCKET_NAME as string;
    const functionPath: string = process.env.THUMBING_FUNCTION_PATH as string;
    const folderInput: string = process.env.THUMBING_S3_FOLDER_INPUT as string;
    const folderOutput: string = process.env.THUMBING_S3_FOLDER_OUTPUT as string;
    const webhookUrl: string = process.env.THUMBING_WEBHOOK_URL as string;
    const topicName: string = process.env.THUMBING_TOPIC_NAME as string;

    // Import existing assets bucket (served via CloudFront, managed outside this stack)
    const assetsBucket = this.importBucket(assetsBucketName);

    // Create uploads bucket (private, CDK-managed — safe to destroy)
    const uploadsBucket = this.createBucket(uploadsBucketName);

    // Create Lambda function for image processing
    const lambdaFunction = this.createLambda(
      functionPath,
      assetsBucketName,
      folderInput,
      folderOutput
    );

    // Create SNS topic and subscription
    const snsTopic = this.createSnsTopic(topicName);
    // TODO: Enable when webhook endpoint is deployed
    // this.createSnsSubscription(snsTopic, webhookUrl);

    // Lambda triggers on uploads to the uploads bucket
    this.createS3NotifyToLambda(folderInput, lambdaFunction, uploadsBucket);

    // SNS triggers when processed images land in the assets bucket
    this.createS3NotifyToSns(folderOutput, snsTopic, assetsBucket);

    // Lambda needs to READ from uploads bucket and WRITE to assets bucket
    this.createPolicyBucketAccess(uploadsBucket, lambdaFunction, ['s3:GetObject']);
    this.createPolicyBucketAccess(assetsBucket, lambdaFunction, ['s3:PutObject']);
  }

  importBucket(bucketName: string): s3.IBucket {
    const bucket = s3.Bucket.fromBucketName(this, 'AssetsBucket', bucketName);
    return bucket;
  }

  createBucket(bucketName: string): s3.IBucket {
    const bucket = new s3.Bucket(this, 'UploadsBucket', {
      bucketName: bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
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
      runtime: lambda.Runtime.NODEJS_20_X,
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
    lambdaFunction: lambda.IFunction,
    actions: string[]
  ): void {
    const policy = new iam.PolicyStatement({
      actions: actions,
      resources: [`${bucket.bucketArn}/*`],
    });
    lambdaFunction.addToRolePolicy(policy);
  }
}