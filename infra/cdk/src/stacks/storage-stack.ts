import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { BlockPublicAccess, Bucket, StorageClass } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

interface StorageStackProps extends StackProps {
  deploymentEnvironment: string;
}

export class StorageStack extends Stack {
  public readonly fileBucket: Bucket;
  public readonly metadataTable: Table;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const fileBucketName = `articvault-files-${this.account}-${this.region}-${props.deploymentEnvironment}`;
    const metadataTableName = `articvault-metadata-${props.deploymentEnvironment}`;

    this.fileBucket = new Bucket(this, 'FileBucket', {
      bucketName: fileBucketName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          id: 'DefaultIntelligentTiering',
          transitions: [
            {
              storageClass: StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(0)
            }
          ]
        },
        {
          id: 'TrashPurgeLifecycle',
          tagFilters: {
            state: 'TRASH'
          },
          expiration: Duration.days(30)
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

    new CfnOutput(this, 'BucketName', {
      value: this.fileBucket.bucketName
    });

    new CfnOutput(this, 'TableName', {
      value: this.metadataTable.tableName
    });
  }
}
