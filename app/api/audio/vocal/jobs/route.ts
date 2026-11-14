import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import { getVocalManager, type CreateVocalJobInput } from "@/lib/audio/vocal-manager";
import type {
  VocalBitrate,
  VocalChannelMode,
  VocalEngineModel,
  VocalOutputFormat,
  VocalSampleRate,
  VocalStemOutputMode,
} from "@/components/tool/audio/vocal/model";
import { proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

async function shouldFallbackLocally(response: NextResponse): Promise<boolean> {
  if (response.status === 502 || response.status === 503) return true;
  if (response.status === 404) {
    const body = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    return body?.error === "Worker route not found.";
  }
  return false;
}

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
  }
  return undefined;
}

function parseNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

async function parseCreateVocalInput(
  request: Request,
  ownerId: string,
): Promise<CreateVocalJobInput> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("Please attach an audio or video file to separate.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    if (!audioBuffer.length) {
      throw new Error("Uploaded audio file is empty.");
    }
    if (audioBuffer.length > MAX_UPLOAD_BYTES) {
      throw new Error("Uploaded audio exceeds the 60 MB limit.");
    }

    const rawSettings = form.get("settings");
    let settingsObj: Record<string, unknown> = {};
    if (typeof rawSettings === "string" && rawSettings.trim()) {
      try {
        settingsObj = JSON.parse(rawSettings) as Record<string, unknown>;
      } catch {
        settingsObj = {};
      }
    }

    const pick = (key: string) => form.get(key) ?? settingsObj[key];
    const sr = parseNum(pick("sampleRate"));
    const br = parseNum(pick("bitrate"));

    return {
      ownerId,
      sourceFileName: file.name || "audio-track.mp3",
      sourceMimeType: file.type || "audio/mpeg",
      audioBuffer,
      engineModel: pick("engineModel") as VocalEngineModel | undefined,
      stems: pick("stems") as VocalStemOutputMode | undefined,
      sampleRate:
        sr === 24000 || sr === 44100 || sr === 48000 ? (sr as VocalSampleRate) : undefined,
      channelMode: pick("channelMode") as VocalChannelMode | undefined,
      debleed: parseBool(pick("debleed")),
      normalize: parseBool(pick("normalize")),
      keepBacking: parseBool(pick("keepBacking")),
      format: pick("format") as VocalOutputFormat | undefined,
      bitrate: br === 192 || br === 256 || br === 320 ? (br as VocalBitrate) : undefined,
      metadata: parseBool(pick("metadata")),
    };
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    throw new Error("Invalid vocal separation job payload.");
  }
  const b64Raw = String(body.audioBase64 ?? body.audio_base64 ?? "");
  const cleanB64 = b64Raw.includes(",") ? b64Raw.split(",").pop() || "" : b64Raw;
  if (!cleanB64) {
    throw new Error("Missing audio payload.");
  }
  const audioBuffer = Buffer.from(cleanB64, "base64");
  if (!audioBuffer.length) {
    throw new Error("Decoded audio payload is empty.");
  }
  if (audioBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Uploaded audio exceeds the 60 MB limit.");
  }

  const sr = parseNum(body.sampleRate);
  const br = parseNum(body.bitrate);

  return {
    ownerId,
    sourceFileName: String(body.sourceFileName || "audio-track.mp3"),
    sourceMimeType: String(body.sourceMimeType || "audio/mpeg"),
    audioBuffer,
    engineModel: body.engineModel as VocalEngineModel | undefined,
    stems: body.stems as VocalStemOutputMode | undefined,
    sampleRate: sr === 24000 || sr === 44100 || sr === 48000 ? (sr as VocalSampleRate) : undefined,
    channelMode: body.channelMode as VocalChannelMode | undefined,
    debleed: parseBool(body.debleed),
    normalize: parseBool(body.normalize),
    keepBacking: parseBool(body.keepBacking),
    format: body.format as VocalOutputFormat | undefined,
    bitrate: br === 192 || br === 256 || br === 320 ? (br as VocalBitrate) : undefined,
    metadata: parseBool(body.metadata),
  };
}

export async function GET(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  const proxyRes = await proxyToHfWorker(request, {
    path: "/api/audio/vocal/jobs",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  const manager = getVocalManager();
  const [jobs, storage, status] = await Promise.all([
    manager.listJobsAsync(owner.ownerId),
    manager.getStorageStats(owner.ownerId),
    manager.getStatusSnapshot(),
  ]);

  return NextResponse.json({ jobs, storage, status });
}

export async function POST(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  const fallbackReq = request.clone();
  const proxyRes = await proxyToHfWorker(request, {
    path: "/api/audio/vocal/jobs",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 90_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  try {
    const input = await parseCreateVocalInput(fallbackReq, owner.ownerId);
    const manager = getVocalManager();
    const job = await manager.enqueueJob(input);
    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enqueue vocal separation job.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
