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
import { resolveWebAppOrigins } from '../config/web-origins.js';

interface BackendStackProps extends StackProps {
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  table: Table;
  bucket: Bucket;
  entitledGroupName: string;
  deploymentEnvironment: string;
}

export class BackendStack extends Stack {
  public readonly api: HttpApi;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);
    const webAppOrigins = resolveWebAppOrigins(props.deploymentEnvironment);

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
      createDockspace: createHandler('createDockspace'),
      listDockspaces: createHandler('listDockspaces'),
      createFolder: createHandler('createFolder'),
      renameFolder: createHandler('renameFolder'),
      createUploadSession: createHandler('createUploadSession'),
      startMultipartUpload: createHandler('startMultipartUpload'),
      getMultipartPartUrls: createHandler('getMultipartPartUrls'),
      completeMultipartUpload: createHandler('completeMultipartUpload'),
      abortMultipartUpload: createHandler('abortMultipartUpload'),
      createDownloadSession: createHandler('createDownloadSession'),
      confirmUpload: createHandler('confirmUpload'),
      listFolderChildren: createHandler('listFolderChildren'),
      renameFile: createHandler('renameFile'),
      moveFiles: createHandler('moveFiles'),
      moveToTrash: createHandler('moveToTrash'),
      restoreFile: createHandler('restoreFile'),
      purgeFileNow: createHandler('purgeFileNow'),
      listTrash: createHandler('listTrash'),
      listPurged: createHandler('listPurged'),
      listMedia: createHandler('listMedia'),
      createAlbum: createHandler('createAlbum'),
      listAlbums: createHandler('listAlbums'),
      renameAlbum: createHandler('renameAlbum'),
      deleteAlbum: createHandler('deleteAlbum'),
      assignAlbumMedia: createHandler('assignAlbumMedia'),
      removeAlbumMedia: createHandler('removeAlbumMedia'),
      listAlbumMedia: createHandler('listAlbumMedia'),
      listMediaAlbums: createHandler('listMediaAlbums')
    };

    const purgeReconciliation = createHandler('purgeReconciliation');

    props.table.grantReadWriteData(handlers.createDockspace);
    props.table.grantReadWriteData(handlers.listDockspaces);
    props.table.grantReadWriteData(handlers.createFolder);
    props.table.grantReadWriteData(handlers.renameFolder);
    props.table.grantReadWriteData(handlers.createUploadSession);
    props.table.grantReadWriteData(handlers.startMultipartUpload);
    props.table.grantReadWriteData(handlers.completeMultipartUpload);
    props.table.grantReadData(handlers.createDownloadSession);
    props.table.grantReadWriteData(handlers.confirmUpload);
    props.table.grantReadWriteData(handlers.listFolderChildren);
    props.table.grantReadWriteData(handlers.renameFile);
    props.table.grantReadWriteData(handlers.moveFiles);
    props.table.grantReadWriteData(handlers.moveToTrash);
    props.table.grantReadWriteData(handlers.restoreFile);
    props.table.grantReadWriteData(handlers.purgeFileNow);
    props.table.grantReadWriteData(handlers.listTrash);
    props.table.grantReadWriteData(handlers.listPurged);
    props.table.grantReadWriteData(handlers.listMedia);
    props.table.grantReadWriteData(handlers.createAlbum);
    props.table.grantReadWriteData(handlers.listAlbums);
    props.table.grantReadWriteData(handlers.renameAlbum);
    props.table.grantReadWriteData(handlers.deleteAlbum);
    props.table.grantReadWriteData(handlers.assignAlbumMedia);
    props.table.grantReadWriteData(handlers.removeAlbumMedia);
    props.table.grantReadWriteData(handlers.listAlbumMedia);
    props.table.grantReadWriteData(handlers.listMediaAlbums);
    props.table.grantReadWriteData(purgeReconciliation);

    props.bucket.grantReadWrite(handlers.createUploadSession);
    props.bucket.grantReadWrite(handlers.startMultipartUpload);
    props.bucket.grantReadWrite(handlers.getMultipartPartUrls);
    props.bucket.grantReadWrite(handlers.completeMultipartUpload);
    props.bucket.grantReadWrite(handlers.abortMultipartUpload);
    props.bucket.grantRead(handlers.createDownloadSession);
    props.bucket.grantReadWrite(handlers.confirmUpload);
    props.bucket.grantReadWrite(handlers.moveToTrash);
    props.bucket.grantReadWrite(handlers.restoreFile);
    props.bucket.grantReadWrite(handlers.purgeFileNow);
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
        allowOrigins: webAppOrigins
      }
    });

    const authorizer = new HttpUserPoolAuthorizer('UserPoolAuthorizer', props.userPool, {
      userPoolClients: [props.userPoolClient]
    });

    this.api.addRoutes({
      path: '/dockspaces',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListDockspacesIntegration', handlers.listDockspaces),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateDockspaceIntegration', handlers.createDockspace),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/folders/{parentFolderNodeId}/children',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'ListFolderChildrenIntegration',
        handlers.listFolderChildren
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/folders',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateFolderIntegration', handlers.createFolder),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/folders/rename',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('RenameFolderIntegration', handlers.renameFolder),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/upload-session',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateUploadSessionIntegration',
        handlers.createUploadSession
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/multipart/start',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'StartMultipartUploadIntegration',
        handlers.startMultipartUpload
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/multipart/part-urls',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'GetMultipartPartUrlsIntegration',
        handlers.getMultipartPartUrls
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/multipart/complete',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CompleteMultipartUploadIntegration',
        handlers.completeMultipartUpload
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/multipart/abort',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'AbortMultipartUploadIntegration',
        handlers.abortMultipartUpload
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/{fileNodeId}/download-session',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'CreateDownloadSessionIntegration',
        handlers.createDownloadSession
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/confirm-upload',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ConfirmUploadIntegration', handlers.confirmUpload),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/rename',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('RenameFileIntegration', handlers.renameFile),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/move',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('MoveFilesIntegration', handlers.moveFiles),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/trash',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('MoveToTrashIntegration', handlers.moveToTrash),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/restore',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RestoreFileIntegration', handlers.restoreFile),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/files/purge',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PurgeFileNowIntegration', handlers.purgeFileNow),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/trash',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListTrashIntegration', handlers.listTrash),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/purged',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListPurgedIntegration', handlers.listPurged),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/media',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListMediaIntegration', handlers.listMedia),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/albums',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateAlbumIntegration', handlers.createAlbum),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/albums',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListAlbumsIntegration', handlers.listAlbums),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/albums/{albumId}',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('RenameAlbumIntegration', handlers.renameAlbum),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/albums/{albumId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteAlbumIntegration', handlers.deleteAlbum),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/albums/{albumId}/media',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'AssignAlbumMediaIntegration',
        handlers.assignAlbumMedia
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/albums/{albumId}/media',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListAlbumMediaIntegration', handlers.listAlbumMedia),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/albums/{albumId}/media/{fileNodeId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration(
        'RemoveAlbumMediaIntegration',
        handlers.removeAlbumMedia
      ),
      authorizer
    });

    this.api.addRoutes({
      path: '/dockspaces/{dockspaceId}/media/{fileNodeId}/albums',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'ListMediaAlbumsIntegration',
        handlers.listMediaAlbums
      ),
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
