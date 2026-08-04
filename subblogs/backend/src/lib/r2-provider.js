const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

function createR2Provider(config) {
  let s3 = null;

  function client() {
    if (!s3) {
      s3 = new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        }
      });
    }
    return s3;
  }

  return {
    name: 'nibgate',
    maxBytes: null,

    async put({ key, data, contentType = 'application/octet-stream', cacheControl }) {
      await client().send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        CacheControl: cacheControl || 'public, max-age=31536000, immutable'
      }));
      return { storageRef: key, url: `${config.publicUrl}/${key}` };
    },

    async get({ storageRef }) {
      const res = await client().send(new GetObjectCommand({ Bucket: config.bucket, Key: storageRef }));
      return Buffer.from(await res.Body.transformToByteArray());
    },

    async delete({ storageRef }) {
      await client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageRef }));
    }
  };
}

module.exports = { createR2Provider };
