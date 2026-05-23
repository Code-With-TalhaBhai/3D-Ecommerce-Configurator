import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
    // AWS SDK v3 (>= 3.730) defaults to adding an `x-amz-checksum-crc32` query
    // parameter to presigned PUT URLs. The browser cannot recompute that CRC32
    // against the file body, so the signed URL rejects every browser PUT. Opt
    // back into "only checksum when S3 actually requires it" so direct-to-S3
    // uploads from the new-product form work.
    requestChecksumCalculation: "WHEN_REQUIRED",
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

  async presignPut({ key, contentType, expiresIn }) {
    const { bucket } = readEnv();
    const client = getClient();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: expiresIn ?? 900,
    });
    return { key, uploadUrl };
  },

  async getObjectBytes(key) {
    const { bucket } = readEnv();
    const client = getClient();
    const out = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!out.Body) throw new Error(`Empty body for key ${key}`);
    return out.Body.transformToByteArray();
  },

  async headObject(key) {
    const { bucket } = readEnv();
    const client = getClient();
    try {
      const out = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        contentLength: out.ContentLength ?? 0,
        contentType: out.ContentType ?? undefined,
      };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
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
