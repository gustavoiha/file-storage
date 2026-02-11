import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  UserPool,
  UserPoolClient,
  VerificationEmailStyle
} from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

const DEFAULT_ALLOWLIST_PARAMETER_NAME = '/dockspace/auth/allowed-signup-emails';
const DEFAULT_ENTITLED_GROUP_NAME = 'entitled-users';

export class IdentityStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly entitledGroupName: string;
  public readonly allowlistParameterName: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.entitledGroupName = DEFAULT_ENTITLED_GROUP_NAME;
    this.allowlistParameterName = DEFAULT_ALLOWLIST_PARAMETER_NAME;

    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    const triggerRoot = path.resolve(currentDir, '../../../../packages/backend/src/triggers');

    const preSignUpAllowlistFn = new NodejsFunction(this, 'PreSignUpAllowlistFn', {
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(triggerRoot, 'preSignUpAllowlist.ts'),
      handler: 'handler',
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: {
        ALLOWLIST_SSM_PARAMETER_NAME: this.allowlistParameterName
      }
    });

    const postConfirmationAssignGroupFn = new NodejsFunction(this, 'PostConfirmationAssignGroupFn', {
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(triggerRoot, 'postConfirmationAssignGroup.ts'),
      handler: 'handler',
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: {
        ENTITLED_GROUP_NAME: this.entitledGroupName
      }
    });

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailSubject: 'Dockspace verification code',
        emailBody: 'Your Dockspace code is {####}',
        emailStyle: VerificationEmailStyle.CODE
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true
      },
      lambdaTriggers: {
        preSignUp: preSignUpAllowlistFn,
        postConfirmation: postConfirmationAssignGroupFn
      }
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true
      },
      generateSecret: false
    });

    new CfnUserPoolGroup(this, 'EntitledUsersGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: this.entitledGroupName,
      description: 'Entitled users allowed to access Dockspace APIs.'
    });

    const allowlistParameterArn = this.formatArn({
      service: 'ssm',
      resource: 'parameter',
      resourceName: this.allowlistParameterName.replace(/^\//, '')
    });

    preSignUpAllowlistFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [allowlistParameterArn]
      })
    );

    postConfirmationAssignGroupFn.addToRolePolicy(
      new PolicyStatement({
        actions: ['cognito-idp:AdminAddUserToGroup'],
        resources: [
          this.formatArn({
            service: 'cognito-idp',
            resource: 'userpool',
            resourceName: '*'
          })
        ]
      })
    );

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId
    });

    new CfnOutput(this, 'EntitledGroupName', {
      value: this.entitledGroupName
    });

    new CfnOutput(this, 'AllowlistParameterName', {
      value: this.allowlistParameterName
    });
  }
}
