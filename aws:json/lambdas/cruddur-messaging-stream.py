#!/usr/bin/env python3

import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr

# =============================================================================
# CONFIGURATION
# =============================================================================
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
DDB_TABLE_NAME = os.environ.get('DDB_TABLE_NAME', 'cruddur-messages')

attrs = {'region_name': AWS_REGION}
dynamodb = boto3.resource('dynamodb', **attrs)


def lambda_handler(event, context):
    """
    Lambda function triggered by DynamoDB Streams.
    """
    
    # =========================================================================
    # DEBUG: Log the raw event immediately
    # =========================================================================
    print("=== RAW EVENT ===")
    print(json.dumps(event))
    
    # =========================================================================
    # EXTRACT EVENT DATA
    # =========================================================================
    print("=== EXTRACTING KEYS ===")
    pk = event['Records'][0]['dynamodb']['Keys']['pk']['S']
    sk = event['Records'][0]['dynamodb']['Keys']['sk']['S']
    print(f"PK ===> {pk}")
    print(f"SK ===> {sk}")
    
    # =========================================================================
    # FILTER: ONLY PROCESS MESSAGE RECORDS
    # =========================================================================
    print(f"=== CHECKING IF PK STARTS WITH MSG# ===")
    print(f"pk.startswith('MSG#') = {pk.startswith('MSG#')}")
    
    if not pk.startswith('MSG#'):
        print(f"SKIPPING - pk does not start with MSG#")
        return {'statusCode': 200, 'body': 'Not a message record, skipping'}
    
    # =========================================================================
    # PARSE MESSAGE DATA
    # =========================================================================
    message_group_uuid = pk.replace("MSG#", "")
    message = event['Records'][0]['dynamodb']['NewImage']['message']['S']
    print(f"GROUP ===> {message_group_uuid}, message: {message}")
    
    # =========================================================================
    # QUERY MESSAGE GROUP RECORDS
    # =========================================================================
    table = dynamodb.Table(DDB_TABLE_NAME)
    index_name = 'message-group-sk-index'
    
    print(f"=== QUERYING GSI: {index_name} ===")
    data = table.query(
        IndexName=index_name,
        KeyConditionExpression=Key('message_group_uuid').eq(message_group_uuid)
    )
    print(f"RESP ===> {data['Items']}")
    print(f"Found {len(data['Items'])} items to update")
    
    # =========================================================================
    # UPDATE MESSAGE GROUP RECORDS
    # =========================================================================
    for item in data['Items']:
        delete_response = table.delete_item(
            Key={'pk': item['pk'], 'sk': item['sk']}
        )
        print(f"DELETE ===> {delete_response}")
        
        put_response = table.put_item(
            Item={
                'pk': item['pk'],
                'sk': sk,
                'message_group_uuid': item['message_group_uuid'],
                'message': message,
                'user_display_name': item['user_display_name'],
                'user_handle': item['user_handle'],
                'user_uuid': item['user_uuid']
            }
        )
        print(f"CREATE ===> {put_response}")
    
    return {'statusCode': 200, 'body': f'Processed {len(data["Items"])} items'}