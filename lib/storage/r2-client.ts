import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2Config = {
  configured: boolean;
  providerLabel: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  publicUrl: string | null;
};

export type R2ListedObject = {
  key: string;
  size: number;
  lastModified: number;
};

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function getR2Config(): R2Config {
  const accountId = firstEnv("R2_ACCOUNT_ID");
  const accessKeyId = firstEnv("S3_ACCESS_KEY_ID", "TIGRIS_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv(
    "S3_SECRET_ACCESS_KEY",
    "TIGRIS_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  );
  const bucketName = firstEnv("S3_BUCKET_NAME", "TIGRIS_BUCKET_NAME", "R2_BUCKET_NAME");
  const explicitEndpoint = firstEnv(
    "S3_ENDPOINT",
    "TIGRIS_ENDPOINT",
    "R2_ENDPOINT",
    "AWS_ENDPOINT_URL_S3",
    "AWS_ENDPOINT_URL",
  ).replace(/\/+$/, "");
  const hasTigrisSpecificEnv = Boolean(
    firstEnv("TIGRIS_ACCESS_KEY_ID", "TIGRIS_SECRET_ACCESS_KEY", "TIGRIS_BUCKET_NAME", "TIGRIS_ENDPOINT") ||
      accessKeyId.startsWith("tid_"),
  );
  const endpoint =
    explicitEndpoint ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "") ||
    (hasTigrisSpecificEnv ? "https://t3.storage.dev" : "");

  const region = firstEnv("S3_REGION", "R2_REGION", "AWS_REGION") || "auto";
  const forcePathStyleRaw = firstEnv("S3_FORCE_PATH_STYLE", "R2_FORCE_PATH_STYLE").toLowerCase();
  const forcePathStyle = forcePathStyleRaw === "1" || forcePathStyleRaw === "true";

  const publicUrlRaw = firstEnv("S3_PUBLIC_URL", "R2_PUBLIC_URL").replace(/\/+$/, "");
  const publicUrl = publicUrlRaw || null;

  const providerLabel = endpoint.includes("storage.dev") || endpoint.includes("tigris")
    ? "Tigris"
    : endpoint.includes("r2.cloudflarestorage.com")
      ? "Cloudflare R2"
      : "S3-compatible";

  const configured = Boolean(endpoint && accessKeyId && secretAccessKey && bucketName);

  return {
    configured,
    providerLabel,
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    region,
    forcePathStyle,
    publicUrl,
  };
}

let cachedSignature = "";
let cachedClient: S3Client | null = null;

function getS3Client(config: R2Config): S3Client {
  const sig = `${config.endpoint}|${config.region}|${config.forcePathStyle}|${config.accessKeyId}|${config.secretAccessKey}`;
  if (cachedClient && cachedSignature === sig) {
    return cachedClient;
  }

  cachedSignature = sig;
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Avoid sending extra checksum headers unsupported by Tigris / S3-compatible setups
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cachedClient;
}

export async function r2PutObject(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}): Promise<void> {
  const cfg = getR2Config();
  if (!cfg.configured) {
    throw new Error("Object storage is not configured.");
  }
  const client = getS3Client(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucketName,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl ?? "private, max-age=86400",
      Metadata: params.metadata,
    }),
  );
}

export async function r2GetObjectBuffer(key: string): Promise<{
  buffer: Buffer;
  contentType: string | null;
  contentLength: number;
} | null> {
  const cfg = getR2Config();
  if (!cfg.configured) return null;
  const client = getS3Client(cfg);
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: cfg.bucketName,
        Key: key,
      }),
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    const buffer = Buffer.from(bytes);
    return {
      buffer,
      contentType: res.ContentType ?? null,
      contentLength: res.ContentLength ?? buffer.length,
    };
  } catch (err) {
    const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (code === "NoSuchKey" || status === 404) {
      return null;
    }
    throw err;
  }
}

export async function r2GetObjectText(key: string): Promise<string | null> {
  const res = await r2GetObjectBuffer(key);
  if (!res) return null;
  return res.buffer.toString("utf-8");
}

export async function r2DeleteObject(key: string): Promise<void> {
  const cfg = getR2Config();
  if (!cfg.configured || !key) return;
  const client = getS3Client(cfg);
  await client.send(
    new DeleteObjectCommand({
      Bucket: cfg.bucketName,
      Key: key,
    }),
  );
}

export async function r2DeleteObjects(keys: string[]): Promise<void> {
  const cfg = getR2Config();
  const unique = Array.from(new Set(keys.filter(Boolean)));
  if (!cfg.configured || unique.length === 0) return;
  const client = getS3Client(cfg);

  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: cfg.bucketName,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

export async function r2ListObjects(prefix = ""): Promise<R2ListedObject[]> {
  const cfg = getR2Config();
  if (!cfg.configured) return [];
  const client = getS3Client(cfg);

  const items: R2ListedObject[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucketName,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      items.push({
        key: obj.Key,
        size: Number(obj.Size ?? 0),
        lastModified: obj.LastModified ? obj.LastModified.getTime() : Date.now(),
      });
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

export async function r2CreateSignedDownloadUrl(
  key: string,
  opts?: { expiresInSeconds?: number; fileName?: string; download?: boolean },
): Promise<string | null> {
  const cfg = getR2Config();
  if (!cfg.configured || !key) return null;

  const client = getS3Client(cfg);
  const disposition = opts?.download ? "attachment" : "inline";
  const safeName = opts?.fileName ? opts.fileName.replace(/["\r\n]/g, "") : undefined;
  const command = new GetObjectCommand({
    Bucket: cfg.bucketName,
    Key: key,
    ...(safeName ? { ResponseContentDisposition: `${disposition}; filename="${safeName}"` } : {}),
  });

  const expiresIn = Math.min(24 * 3600, Math.max(60, opts?.expiresInSeconds ?? 3600));
  return getSignedUrl(client, command, { expiresIn });
}

export async function r2CheckHealth(): Promise<{ ok: boolean; error?: string }> {
  const cfg = getR2Config();
  if (!cfg.configured) {
    return { ok: false, error: "Object storage credentials not configured" };
  }
  try {
    const client = getS3Client(cfg);
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucketName }));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Failed to reach ${cfg.providerLabel} bucket`,
    };
  }
}

