import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AllowedMethods,
  CachePolicy,
  CacheQueryStringBehavior,
  CachedMethods,
  Distribution,
  KeyGroup,
  OriginRequestCookieBehavior,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  OriginRequestQueryStringBehavior,
  PublicKey,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { BlockPublicAccess, Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { resolveWebAppOrigins } from '../config/web-origins.js';

interface StorageStackProps extends StackProps {
  deploymentEnvironment: string;
  fileReadPublicKeyPem: string;
}

export class StorageStack extends Stack {
  public readonly fileBucket: Bucket;
  public readonly metadataTable: Table;
  public readonly fileReadDistribution: Distribution;
  public readonly fileReadDistributionDomainName: string;
  public readonly fileReadKeyPairId: string;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);
    const webAppOrigins = resolveWebAppOrigins(props.deploymentEnvironment);

    const fileBucketName = `dockspace-files-${this.account}-${this.region}-${props.deploymentEnvironment}`;
    const metadataTableName = `dockspace-metadata-${props.deploymentEnvironment}`;

    this.fileBucket = new Bucket(this, 'FileBucket', {
      bucketName: fileBucketName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: webAppOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000
        }
      ],
      lifecycleRules: [
        {
          id: 'TrashPurgeLifecycle',
          tagFilters: {
            state: 'TRASH'
          },
          expiration: Duration.days(30)
        },
        {
          id: 'TrashNoncurrentVersionLifecycle',
          tagFilters: {
            state: 'TRASH'
          },
          noncurrentVersionExpiration: Duration.days(30)
        },
        {
          id: 'NoncurrentVersionLifecycle',
          noncurrentVersionExpiration: Duration.days(90)
        },
        {
          id: 'DeleteMarkerCleanup',
          expiredObjectDeleteMarker: true
        },
        {
          id: 'AbortIncompleteMultipart',
          abortIncompleteMultipartUploadAfter: Duration.days(1)
        }
      ]
    });

    this.metadataTable = new Table(this, 'MetadataTable', {
      tableName: metadataTableName,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: RemovalPolicy.RETAIN
    });

    this.metadataTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'GSI1SK',
        type: AttributeType.STRING
      }
    });

    const normalizedPublicKey = props.fileReadPublicKeyPem.replace(/\\n/g, '\n').trim();
    const fileReadPublicKey = new PublicKey(this, 'FileReadPublicKey', {
      encodedKey: normalizedPublicKey,
      comment: `Dockspace file read key (${props.deploymentEnvironment})`
    });
    const fileReadKeyGroup = new KeyGroup(this, 'FileReadKeyGroup', {
      items: [fileReadPublicKey],
      comment: `Dockspace file read key group (${props.deploymentEnvironment})`
    });

    const fileReadCachePolicy = new CachePolicy(this, 'FileReadCachePolicy', {
      defaultTtl: Duration.days(1),
      maxTtl: Duration.days(7),
      minTtl: Duration.seconds(0),
      queryStringBehavior: CacheQueryStringBehavior.allowList('response-content-disposition'),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true
    });

    const fileReadOriginRequestPolicy = new OriginRequestPolicy(this, 'FileReadOriginRequestPolicy', {
      cookieBehavior: OriginRequestCookieBehavior.none(),
      headerBehavior: OriginRequestHeaderBehavior.none(),
      queryStringBehavior: OriginRequestQueryStringBehavior.allowList('response-content-disposition')
    });

    const fileReadResponseHeadersPolicy = new ResponseHeadersPolicy(
      this,
      'FileReadResponseHeadersPolicy',
      {
        corsBehavior: {
          accessControlAllowCredentials: false,
          accessControlAllowHeaders: ['*'],
          accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
          accessControlAllowOrigins: webAppOrigins,
          accessControlExposeHeaders: ['Accept-Ranges', 'Content-Length', 'Content-Range', 'ETag'],
          accessControlMaxAge: Duration.seconds(3000),
          originOverride: true
        }
      }
    );

    this.fileReadDistribution = new Distribution(this, 'FileReadDistribution', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.fileBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        cachePolicy: fileReadCachePolicy,
        originRequestPolicy: fileReadOriginRequestPolicy,
        responseHeadersPolicy: fileReadResponseHeadersPolicy,
        trustedKeyGroups: [fileReadKeyGroup]
      },
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021
    });
    this.fileReadDistributionDomainName = this.fileReadDistribution.distributionDomainName;
    this.fileReadKeyPairId = fileReadPublicKey.publicKeyId;

    new CfnOutput(this, 'BucketName', {
      value: this.fileBucket.bucketName
    });

    new CfnOutput(this, 'TableName', {
      value: this.metadataTable.tableName
    });

    new CfnOutput(this, 'FileReadDistributionDomainName', {
      value: this.fileReadDistributionDomainName
    });

    new CfnOutput(this, 'FileReadKeyPairId', {
      value: this.fileReadKeyPairId
    });
  }
}
