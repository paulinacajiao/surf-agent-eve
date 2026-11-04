import { LambdaClient } from "@aws-sdk/client-lambda";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/**
 * The boundary into the customer's AWS world.
 *
 * DECISION: no AWS access keys live in Vercel. The function presents its Vercel
 * OIDC token to AWS STS (AssumeRoleWithWebIdentity) and gets short-lived
 * credentials for one IAM role. That role's trust policy accepts only tokens
 * for this Vercel project, and its only permission is lambda:InvokeFunction
 * on the surf_report function.
 *
 * Fallback: with no AWS_ROLE_ARN set (e.g. running locally without `eve link`),
 * the SDK default chain is used (AWS_PROFILE etc.).
 *
 * DECISION: the region is pinned with SURF_AWS_REGION rather than AWS_REGION,
 * because Vercel sets AWS_REGION to the function's execution region.
 */
export const AWS_REGION = process.env.SURF_AWS_REGION ?? "us-east-1";
export const SURF_LAMBDA = process.env.SURF_LAMBDA_NAME ?? "surf_report";

let client: LambdaClient | undefined;

export function lambda(): LambdaClient {
  client ??= new LambdaClient({
    region: AWS_REGION,
    maxAttempts: 3,
    credentials: process.env.AWS_ROLE_ARN
      ? awsCredentialsProvider({ roleArn: process.env.AWS_ROLE_ARN, clientConfig: { region: AWS_REGION } })
      : undefined,
  });
  return client;
}
