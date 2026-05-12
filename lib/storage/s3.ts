import "server-only";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { StorageDriver } from "./index";

function readEnv() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 storage is not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.",
    );
  }
  return { region, bucket, accessKeyId, secretAccessKey };
}

let clientSingleton: S3Client | null = null;
function getClient() {
  if (clientSingleton) return clientSingleton;
  const { region, accessKeyId, secretAccessKey } = readEnv();
  clientSingleton = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return clientSingleton;
}

export const s3Storage: StorageDriver = {
  async upload({ key, body, contentType, cacheControl }) {
    const { bucket } = readEnv();
    const client = getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl ?? "public, max-age=31536000, immutable",
      }),
    );
    return { key, url: this.publicUrl(key) };
  },

  publicUrl(key) {
    const { region, bucket } = readEnv();
    const cdn = process.env.AWS_CLOUDFRONT_URL;
    if (cdn) return `${cdn.replace(/\/$/, "")}/${key}`;
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  },

  async remove(key) {
    const { bucket } = readEnv();
    const client = getClient();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      // best-effort
    }
  },
};
