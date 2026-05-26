/**
 * Idempotently creates the dev S3 bucket on MinIO.
 * Run once after `docker compose up -d`.
 */
import 'dotenv/config';
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET ?? 'honeybook-dev';
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

async function main() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`✓ bucket exists: ${bucket}`);
    return;
  } catch {
    // not found
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`✓ created bucket: ${bucket}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
