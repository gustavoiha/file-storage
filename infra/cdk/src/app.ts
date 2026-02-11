import 'source-map-support/register.js';
import { App, type StackProps } from 'aws-cdk-lib';
import { BackendStack } from './stacks/backend-stack.js';
import { FrontendHostingStack } from './stacks/frontend-hosting-stack.js';
import { IdentityStack } from './stacks/identity-stack.js';
import { StorageStack } from './stacks/storage-stack.js';

const app = new App();

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const deploymentEnvironment = requiredEnv('ENVIRONMENT');

interface BaseStackProps extends StackProps {
  deploymentEnvironment: string;
}

const stackProps: BaseStackProps = {
  ...(process.env.CDK_DEFAULT_ACCOUNT && process.env.CDK_DEFAULT_REGION
    ? {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT,
          region: process.env.CDK_DEFAULT_REGION
        }
      }
    : {}),
  deploymentEnvironment
};

const identity = new IdentityStack(app, 'DockspaceIdentity', stackProps);
const storage = new StorageStack(app, 'DockspaceStorage', stackProps);

new BackendStack(app, 'DockspaceBackend', {
  ...stackProps,
  userPool: identity.userPool,
  userPoolClient: identity.userPoolClient,
  entitledGroupName: identity.entitledGroupName,
  table: storage.metadataTable,
  bucket: storage.fileBucket
});

new FrontendHostingStack(app, 'DockspaceFrontendHosting', stackProps);
