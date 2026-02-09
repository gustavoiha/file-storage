import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';

const dynamo = new DynamoDBClient({});
export const dynamoDoc = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

export const s3Client = new S3Client({});
export const ssmClient = new SSMClient({});
export const cognitoIdentityProviderClient = new CognitoIdentityProviderClient({});
