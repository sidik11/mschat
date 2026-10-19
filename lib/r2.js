import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export function r2Client() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    const error = new Error('Cloudflare R2 is not configured'); error.code = 'CONFIG_MISSING'; throw error;
  }
  return { client: new S3Client({ region: 'auto', endpoint: 'https://' + R2_ACCOUNT_ID + '.r2.cloudflarestorage.com', forcePathStyle: true, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } }), bucket: R2_BUCKET_NAME };
}
export async function signPut(client, bucket, key, contentType = 'application/octet-stream') {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 300 });
}
export async function signGet(client, bucket, key, contentType = 'application/octet-stream') {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: contentType }), { expiresIn: 180 });
}
export async function objectExists(client, bucket, key) {
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}
