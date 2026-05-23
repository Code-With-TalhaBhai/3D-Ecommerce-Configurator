import "server-only";

import { s3Storage } from "./s3";

export type StorageDriver = {
  /**
   * Upload an object. Returns the public URL (via CDN if configured).
   */
  upload(args: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
    cacheControl?: string;
  }): Promise<{ key: string; url: string }>;

  /**
   * Issue a short-lived presigned PUT URL so the browser can upload directly
   * to the storage backend. Used to sidestep Vercel's serverless function
   * request-body cap on large GLB files.
   */
  presignPut(args: {
    key: string;
    contentType: string;
    expiresIn?: number;
  }): Promise<{ key: string; uploadUrl: string }>;

  /** Fetch the bytes of an object server-to-server. */
  getObjectBytes(key: string): Promise<Uint8Array>;

  /** HEAD an object; returns null when the key is missing. */
  headObject(
    key: string,
  ): Promise<{ contentLength: number; contentType?: string } | null>;

  /** Stable public URL for an already-uploaded key. */
  publicUrl(key: string): string;

  /** Remove an object. Best-effort; ignores not-found. */
  remove(key: string): Promise<void>;
};

export const storage: StorageDriver = s3Storage;
