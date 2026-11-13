import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const ROOT = process.cwd();
const VOICES_DIR = path.join(ROOT, "lib", "audio", "voices");
const MANIFEST_PATH = path.join(VOICES_DIR, "manifest.json");

function firstEnv(...names) {
  for (const name of names) {
    const val = (process.env[name] ?? "").trim();
    if (val) return val;
  }
  return "";
}

function createStorageClient() {
  const accessKeyId = firstEnv("S3_ACCESS_KEY_ID", "TIGRIS_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv(
    "S3_SECRET_ACCESS_KEY",
    "TIGRIS_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  );
  const bucketName = firstEnv("S3_BUCKET_NAME", "TIGRIS_BUCKET_NAME", "R2_BUCKET_NAME");
  const endpoint =
    firstEnv("S3_ENDPOINT", "TIGRIS_ENDPOINT", "R2_ENDPOINT", "AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL") ||
    "https://t3.storage.dev";
  const region = firstEnv("S3_REGION", "R2_REGION", "AWS_REGION") || "auto";
  const forcePathStyleRaw = firstEnv("S3_FORCE_PATH_STYLE", "R2_FORCE_PATH_STYLE").toLowerCase();
  const forcePathStyle = forcePathStyleRaw === "1" || forcePathStyleRaw === "true";

  if (!accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Missing S3/Tigris credentials in environment. Run with: node --env-file=.env.local scripts/sync-voices.mjs");
  }

  const client = new S3Client({
    region,
    endpoint: endpoint.replace(/\/+$/, ""),
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return { client, bucketName };
}

function encodePreviewMp3(inputWavPath) {
  const tmpOut = path.join(os.tmpdir(), `voice-sample-${process.pid}-${Date.now()}.mp3`);
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", inputWavPath, "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k", tmpOut],
      { stdio: "pipe" },
    );
    return fs.readFileSync(tmpOut);
  } finally {
    if (fs.existsSync(tmpOut)) {
      fs.unlinkSync(tmpOut);
    }
  }
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found: ${MANIFEST_PATH}`);
  }

  const force = process.argv.includes("--force");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const { client, bucketName } = createStorageClient();

  const entries = Object.values(manifest);
  console.log(`Syncing ${entries.length} preset voices to bucket "${bucketName}"...`);

  for (const entry of entries) {
    const wavPath = path.join(VOICES_DIR, entry.file);
    if (!fs.existsSync(wavPath)) {
      console.warn(`Skipping ${entry.id}: missing ${wavPath}`);
      continue;
    }

    const refKey = `voices/refs/${entry.id}.wav`;
    const sampleKey = `voices/samples/${entry.id}.mp3`;

    let refExists = false;
    let sampleExists = false;
    if (!force) {
      refExists = await client
        .send(new HeadObjectCommand({ Bucket: bucketName, Key: refKey }))
        .then(() => true)
        .catch(() => false);
      sampleExists = await client
        .send(new HeadObjectCommand({ Bucket: bucketName, Key: sampleKey }))
        .then(() => true)
        .catch(() => false);
    }

    if (!refExists || force) {
      const wavBuf = fs.readFileSync(wavPath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: refKey,
          Body: wavBuf,
          ContentType: "audio/wav",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      console.log(`  uploaded ${refKey} (${wavBuf.length} bytes)`);
    } else {
      console.log(`  exists   ${refKey}`);
    }

    if (!sampleExists || force) {
      const mp3Buf = encodePreviewMp3(wavPath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: sampleKey,
          Body: mp3Buf,
          ContentType: "audio/mpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      console.log(`  uploaded ${sampleKey} (${mp3Buf.length} bytes)`);
    } else {
      console.log(`  exists   ${sampleKey}`);
    }
  }

  console.log("Voice sync complete.");
}

main().catch((err) => {
  console.error("Sync failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

