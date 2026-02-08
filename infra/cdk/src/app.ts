import 'source-map-support/register.js';
import { App } from 'aws-cdk-lib';
import { BackendStack } from './stacks/backend-stack.js';
import { FrontendHostingStack } from './stacks/frontend-hosting-stack.js';
import { IdentityStack } from './stacks/identity-stack.js';
import { StorageStack } from './stacks/storage-stack.js';

const app = new App();

const env =
  process.env.CDK_DEFAULT_ACCOUNT && process.env.CDK_DEFAULT_REGION
    ? {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
      }
    : undefined;

const stackProps = env ? { env } : {};

const identity = new IdentityStack(app, 'ArticVaultIdentity', stackProps);
const storage = new StorageStack(app, 'ArticVaultStorage', stackProps);

new BackendStack(app, 'ArticVaultBackend', {
  ...stackProps,
  userPool: identity.userPool,
  userPoolClient: identity.userPoolClient,
  table: storage.metadataTable,
  bucket: storage.fileBucket
});

new FrontendHostingStack(app, 'ArticVaultFrontendHosting', stackProps);
