import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export function sourceStorageConfig() {
  const bucket=process.env.DRNIB_R2_BUCKET;
  if(!bucket || !process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) return null;
  // Never reuse the public export/CDN bucket for original business records.
  if(bucket===process.env.R2_BUCKET && process.env.R2_PUBLIC_URL) return null;
  return {bucket,endpoint:process.env.R2_ENDPOINT};
}
function client() {
  const cfg=sourceStorageConfig();
  if(!cfg) throw new Error('Private R2 source storage is not configured.');
  return {cfg,s3:new S3Client({region:'auto',endpoint:cfg.endpoint,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}})};
}
export async function putSource(key,body) {
  const {cfg,s3}=client();
  await s3.send(new PutObjectCommand({Bucket:cfg.bucket,Key:key,Body:body,ContentType:'application/octet-stream',CacheControl:'private, no-store'}));
}
export async function getSource(key) {
  const {cfg,s3}=client();
  const out=await s3.send(new GetObjectCommand({Bucket:cfg.bucket,Key:key}));
  return Buffer.from(await out.Body.transformToByteArray());
}
export async function deleteSource(key) {
  const {cfg,s3}=client();
  await s3.send(new DeleteObjectCommand({Bucket:cfg.bucket,Key:key}));
}
