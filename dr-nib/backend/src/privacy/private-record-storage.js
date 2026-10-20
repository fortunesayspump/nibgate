import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
/** This adapter receives ciphertext only. It has no parser or key material. */
export function createPrivateRecordStorage(env = process.env) {
    function configured() { return Boolean(env.DRNIB_R2_BUCKET && env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && !(env.DRNIB_R2_BUCKET === env.R2_BUCKET && env.R2_PUBLIC_URL)); }
    function client() { if (!configured())
        throw Error('PRIVATE_STORAGE_UNAVAILABLE'); const endpoint = new URL(env.R2_ENDPOINT); if (endpoint.protocol !== 'https:')
        throw Error('PRIVATE_STORAGE_UNAVAILABLE'); return new S3Client({ region: 'auto', endpoint: endpoint.href, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } }); }
    function key(value) { if (typeof value !== 'string' || !/^client-sealed\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(value))
        throw Error('PRIVATE_STORAGE_UNAVAILABLE'); return value; }
    return { ready: configured, put: async (k, body) => { await client().send(new PutObjectCommand({ Bucket: env.DRNIB_R2_BUCKET, Key: key(k), Body: body, ContentType: 'application/json', CacheControl: 'private, no-store' })); },
        get: async (k) => {
            const out = await client().send(new GetObjectCommand({ Bucket: env.DRNIB_R2_BUCKET, Key: key(k) }));
            const limit=5*1024*1024,chunks=[];let size=0;
            try {
                if(out.ContentLength>limit||!out.Body)throw Error('PRIVATE_STORAGE_UNAVAILABLE');
                for await(const chunk of out.Body){size+=chunk.length;if(size>limit)throw Error('PRIVATE_STORAGE_UNAVAILABLE');chunks.push(Buffer.from(chunk))}
                return Buffer.concat(chunks,size);
            } finally {out.Body?.destroy?.()}
        },
        remove: async (k) => { await client().send(new DeleteObjectCommand({ Bucket: env.DRNIB_R2_BUCKET, Key: key(k) })); } };
}
