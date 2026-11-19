import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { resolveWebAppOrigins } from '../config/web-origins.js';

interface FrontendHostingStackProps extends StackProps {
  deploymentEnvironment: string;
  /** ACM certificate (us-east-1) for the web app domain; without it the site is only served on the CloudFront domain. */
  siteCertificateArn?: string;
}

export class FrontendHostingStack extends Stack {
  public readonly siteBucket: Bucket;
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: FrontendHostingStackProps) {
    super(scope, id, props);

    const siteBucketName = `dockspace-site-${this.account}-${this.region}-${props.deploymentEnvironment}`;

    this.siteBucket = new Bucket(this, 'SiteBucket', {
      bucketName: siteBucketName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    const [siteOrigin] = resolveWebAppOrigins(props.deploymentEnvironment);
    const siteDomainName = siteOrigin ? new URL(siteOrigin).hostname : undefined;
    const customDomain =
      props.siteCertificateArn && siteDomainName
        ? {
            domainNames: [siteDomainName],
            certificate: Certificate.fromCertificateArn(
              this,
              'SiteCertificate',
              props.siteCertificateArn
            )
          }
        : {};

    this.distribution = new Distribution(this, 'SiteDistribution', {
      ...customDomain,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        }
      ]
    });

    new CfnOutput(this, 'SiteBucketName', {
      value: this.siteBucket.bucketName
    });

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName
    });

    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId
    });

    if (props.siteCertificateArn && siteDomainName) {
      new CfnOutput(this, 'SiteDomainName', {
        value: siteDomainName,
        description: 'Create a CNAME for this name pointing at CloudFrontDomainName'
      });
    }
  }
}
