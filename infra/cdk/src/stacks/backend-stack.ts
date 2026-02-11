import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  HttpMethod,
  HttpApi,
  CorsHttpMethod
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import type { Bucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

interface BackendStackProps extends StackProps {
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  table: Table;
  bucket: Bucket;
  entitledGroupName: string;
}

export class BackendStack extends Stack {
  public readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    const backendRoot = path.resolve(currentDir, '../../../../packages/backend/src/handlers');

    const createHandler = (name: string): NodejsFunction =>
      new NodejsFunction(this, `${name}Fn`, {
        runtime: Runtime.NODEJS_22_X,
        entry: path.join(backendRoot, `${name}.ts`),
        handler: 'handler',
        timeout: Duration.seconds(30),
        memorySize: 512,
        environment: {
          TABLE_NAME: props.table.tableName,
          BUCKET_NAME: props.bucket.bucketName,
          TRASH_RETENTION_DAYS: '30',
          ENTITLED_GROUP_NAME: props.entitledGroupName
        }
      });

    const handlers = {
      createVault: createHandler('createVault'),
      listVaults: createHandler('listVaults'),
      createFolder: createHandler('createFolder'),
      renameFolder: createHandler('renameFolder'),
      createUploadSession: createHandler('createUploadSession'),
      confirmUpload: createHandler('confirmUpload'),
      listFolderChildren: createHandler('listFolderChildren'),
      renameFile: createHandler('renameFile'),
      moveToTrash: createHandler('moveToTrash'),
      restoreFile: createHandler('restoreFile'),
      listTrash: createHandler('listTrash'),
      listPurged: createHandler('listPurged')
    };

    const purgeReconciliation = createHandler('purgeReconciliation');

    props.table.grantReadWriteData(handlers.createVault);
    props.table.grantReadWriteData(handlers.listVaults);
    props.table.grantReadWriteData(handlers.createFolder);
    props.table.grantReadWriteData(handlers.renameFolder);
    props.table.grantReadWriteData(handlers.createUploadSession);
    props.table.grantReadWriteData(handlers.confirmUpload);
    props.table.grantReadWriteData(handlers.listFolderChildren);
    props.table.grantReadWriteData(handlers.renameFile);
    props.table.grantReadWriteData(handlers.moveToTrash);
    props.table.grantReadWriteData(handlers.restoreFile);
    props.table.grantReadWriteData(handlers.listTrash);
    props.table.grantReadWriteData(handlers.listPurged);
    props.table.grantReadWriteData(purgeReconciliation);

    props.bucket.grantReadWrite(handlers.createUploadSession);
    props.bucket.grantReadWrite(handlers.confirmUpload);
    props.bucket.grantReadWrite(handlers.moveToTrash);
    props.bucket.grantReadWrite(handlers.restoreFile);
    props.bucket.grantReadWrite(purgeReconciliation);

    this.api = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['*'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS
        ],
        allowOrigins: ['*']
      }
    });

    const authorizer = new HttpUserPoolAuthorizer('UserPoolAuthorizer', props.userPool, {
      userPoolClients: [props.userPoolClient]
    });

    this.api.addRoutes({
      path: '/vaults',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListVaultsIntegration', handlers.listVaults),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateVaultIntegration', handlers.createVault),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/folders/{parentFolderNodeId}/children',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'ListFolderChildrenIntegration',
        handlers.listFolderChildren
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/folders',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateFolderIntegration', handlers.createFolder),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/folders/rename',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('RenameFolderIntegration', handlers.renameFolder),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/files/upload-session',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateUploadSessionIntegration',
        handlers.createUploadSession
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/files/confirm-upload',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ConfirmUploadIntegration', handlers.confirmUpload),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/files/rename',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('RenameFileIntegration', handlers.renameFile),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/files/trash',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('MoveToTrashIntegration', handlers.moveToTrash),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/files/restore',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RestoreFileIntegration', handlers.restoreFile),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/trash',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListTrashIntegration', handlers.listTrash),
      authorizer
    });

    this.api.addRoutes({
      path: '/vaults/{vaultId}/purged',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListPurgedIntegration', handlers.listPurged),
      authorizer
    });

    new Rule(this, 'PurgeReconciliationRule', {
      schedule: Schedule.rate(Duration.days(1)),
      targets: [new LambdaFunction(purgeReconciliation)]
    });

    new CfnOutput(this, 'ApiUrl', {
      value: this.api.url ?? ''
    });
  }
}
