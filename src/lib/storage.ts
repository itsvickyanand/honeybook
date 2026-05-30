/**
 * Storage adapter.
 * - In dev (or when STORAGE_DRIVER=local): writes to ./uploads
 * - In prod (STORAGE_DRIVER=s3): uses AWS S3 SDK (also drives MinIO locally)
 *
 * The interface is intentionally narrow so callers don't accidentally rely
 * on one provider's idioms.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { promises as fs } from 'fs';
import path from 'path';

export interface PresignedPut {
  uploadUrl: string;
  publicUrl: string;
  storageKey: string;
  headers?: Record<string, string>;
}

export interface Storage {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  /**
   * Returns a presigned URL the client can PUT directly to.
   * For local driver: returns a same-origin proxy URL handled by /api/files/upload-direct/[key].
   */
  presignPut(key: string, contentType: string, expiresInSeconds?: number): Promise<PresignedPut>;
  /** Build a fetch URL for an object. For private S3 objects, returns a signed URL. */
  publicUrl(key: string): Promise<string>;
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(
    private bucket: string,
    private endpoint: string | undefined,
    private region: string,
    private forcePathStyle: boolean,
    accessKey: string,
    secretKey: string
  ) {
    this.client = new S3Client({
      endpoint: endpoint || undefined,
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle,
      // @aws-sdk v3.729+ injects a CRC32 checksum into presigned PUT URLs by
      // default. A browser PUT that only sends `content-type` then fails the
      // signature check against R2. WHEN_REQUIRED keeps checksums off presigned
      // URLs so direct browser uploads work; R2 also isn't S3-checksum-complete
      // so we relax response validation too.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = out.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignPut(key: string, contentType: string, expiresInSeconds = 900): Promise<PresignedPut> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds }
    );
    return {
      uploadUrl: url,
      publicUrl: await this.publicUrl(key),
      storageKey: key,
      headers: { 'content-type': contentType },
    };
  }

  async publicUrl(key: string): Promise<string> {
    // For MinIO/private buckets, return a signed GET URL (7-day default).
    return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 60 * 60 * 24 * 7 });
  }

  // helper for healthcheck-style probes; not in interface
  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

class LocalStorage implements Storage {
  constructor(private root: string, private publicBase: string) {}

  private resolve(key: string) {
    // Prevent path traversal
    const safe = key.split('/').filter((seg) => seg && seg !== '..').join('/');
    return path.join(this.root, safe);
  }

  async putObject(key: string, body: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return await fs.readFile(this.resolve(key));
  }

  async deleteObject(key: string) {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      /* ignore */
    }
  }

  async presignPut(key: string, contentType: string): Promise<PresignedPut> {
    // No real presigning in local mode — the route handler will accept the upload directly.
    return {
      uploadUrl: `/api/files/upload-direct?key=${encodeURIComponent(key)}`,
      publicUrl: await this.publicUrl(key),
      storageKey: key,
      headers: { 'content-type': contentType },
    };
  }

  async publicUrl(key: string): Promise<string> {
    return `${this.publicBase}/${key}`;
  }
}

let _storage: Storage | null = null;
export function getStorage(): Storage {
  if (_storage) return _storage;
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  if (driver === 's3') {
    _storage = new S3Storage(
      process.env.S3_BUCKET!,
      process.env.S3_ENDPOINT,
      process.env.S3_REGION ?? 'us-east-1',
      process.env.S3_FORCE_PATH_STYLE === 'true',
      process.env.S3_ACCESS_KEY!,
      process.env.S3_SECRET_KEY!
    );
  } else {
    _storage = new LocalStorage(path.join(process.cwd(), 'uploads'), '/uploads');
  }
  return _storage;
}

export function generateStorageKey(tenantId: string, filename: string, prefix = 'files') {
  const ext = path.extname(filename).toLowerCase().slice(0, 8) || '.bin';
  return `tenants/${tenantId}/${prefix}/${nanoid(16)}${ext}`;
}
