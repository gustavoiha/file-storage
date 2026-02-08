import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  UserPool,
  UserPoolClient,
  VerificationEmailStyle
} from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

export class IdentityStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailSubject: 'ArticVault verification code',
        emailBody: 'Your ArticVault code is {####}',
        emailStyle: VerificationEmailStyle.CODE
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true
      }
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true
      },
      generateSecret: false
    });

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId
    });
  }
}
