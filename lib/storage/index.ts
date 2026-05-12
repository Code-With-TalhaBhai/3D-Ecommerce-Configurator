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

  /** Stable public URL for an already-uploaded key. */
  publicUrl(key: string): string;

  /** Remove an object. Best-effort; ignores not-found. */
  remove(key: string): Promise<void>;
};

export const storage: StorageDriver = s3Storage;
