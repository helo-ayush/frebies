import { NextRequest, NextResponse } from "next/server";
import { authRequiredResponse, requireAuthenticatedOwner } from "@/lib/auth/owner";
import {
  getUpscaleManager,
  type CreateUpscaleJobInput,
} from "@/lib/image/upscale-manager";
import type {
  UpscaleContentProfile,
  UpscaleEngineModel,
  UpscaleFactor,
  UpscaleFormat,
  UpscaleTargetPreset,
  UpscaleTier,
} from "@/components/tool/upscaler/model";
import { proxyToHfWorker } from "@/lib/worker/hf-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

async function shouldFallbackLocally(response: NextResponse): Promise<boolean> {
  if (response.status === 502 || response.status === 503) return true;
  if (response.status === 404) {
    const body = (await response.clone().json().catch(() => null)) as { error?: string } | null;
    return body?.error === "Worker route not found.";
  }
  return false;
}

function parseBool(value: unknown, fallback?: boolean): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
  }
  return fallback;
}

function parseNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

async function parseCreateUpscaleInput(
  request: Request,
  ownerId: string,
): Promise<CreateUpscaleJobInput> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("Please attach an image file to upscale.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    if (!imageBuffer.length) {
      throw new Error("Uploaded image file is empty.");
    }
    if (imageBuffer.length > MAX_UPLOAD_BYTES) {
      throw new Error("Uploaded image exceeds the 30 MB limit.");
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
    const factorNum = parseNum(pick("factor"));

    return {
      ownerId,
      sourceFileName: file.name || "image.png",
      sourceMimeType: file.type || "image/png",
      imageBuffer,
      originalWidth: parseNum(pick("originalWidth")),
      originalHeight: parseNum(pick("originalHeight")),
      tier: (pick("tier") as UpscaleTier | undefined) ?? undefined,
      engineModel: (pick("engineModel") as UpscaleEngineModel | undefined) ?? undefined,
      profile: (pick("profile") as UpscaleContentProfile | undefined) ?? undefined,
      factor: factorNum === 2 || factorNum === 4 ? (factorNum as UpscaleFactor) : undefined,
      targetPreset: (pick("targetPreset") as UpscaleTargetPreset | undefined) ?? undefined,
      face: parseBool(pick("face")),
      denoise: parseNum(pick("denoise")),
      sharpen: parseNum(pick("sharpen")),
      colorFix: parseBool(pick("colorFix")),
      format: (pick("format") as UpscaleFormat | undefined) ?? undefined,
      quality: parseNum(pick("quality")),
      transparency: parseBool(pick("transparency")),
      backgroundColor: typeof pick("backgroundColor") === "string" ? String(pick("backgroundColor")) : undefined,
      metadata: parseBool(pick("metadata")),
    };
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    throw new Error("Invalid upscale job payload.");
  }
  const b64Raw = String(body.imageBase64 ?? body.image_base64 ?? "");
  const cleanB64 = b64Raw.includes(",") ? b64Raw.split(",").pop() || "" : b64Raw;
  if (!cleanB64) {
    throw new Error("Missing image payload.");
  }
  const imageBuffer = Buffer.from(cleanB64, "base64");
  if (!imageBuffer.length) {
    throw new Error("Decoded image payload is empty.");
  }
  if (imageBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Uploaded image exceeds the 30 MB limit.");
  }

  const factorNum = parseNum(body.factor);

  return {
    ownerId,
    sourceFileName: String(body.sourceFileName || "image.png"),
    sourceMimeType: String(body.sourceMimeType || "image/png"),
    imageBuffer,
    originalWidth: parseNum(body.originalWidth),
    originalHeight: parseNum(body.originalHeight),
    tier: body.tier as UpscaleTier | undefined,
    engineModel: body.engineModel as UpscaleEngineModel | undefined,
    profile: body.profile as UpscaleContentProfile | undefined,
    factor: factorNum === 2 || factorNum === 4 ? (factorNum as UpscaleFactor) : undefined,
    targetPreset: body.targetPreset as UpscaleTargetPreset | undefined,
    face: parseBool(body.face),
    denoise: parseNum(body.denoise),
    sharpen: parseNum(body.sharpen),
    colorFix: parseBool(body.colorFix),
    format: body.format as UpscaleFormat | undefined,
    quality: parseNum(body.quality),
    transparency: parseBool(body.transparency),
    backgroundColor: typeof body.backgroundColor === "string" ? body.backgroundColor : undefined,
    metadata: parseBool(body.metadata),
  };
}

export async function GET(request: NextRequest) {
  const owner = await requireAuthenticatedOwner(request);
  if (!owner) return authRequiredResponse();

  const proxyRes = await proxyToHfWorker(request, {
    path: "/api/image/upscale/jobs",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 25_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  const manager = getUpscaleManager();
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
    path: "/api/image/upscale/jobs",
    ownerId: owner.ownerId,
    isAuthenticated: true,
    timeoutMs: 60_000,
  });

  if (!(await shouldFallbackLocally(proxyRes))) {
    return proxyRes;
  }

  try {
    const input = await parseCreateUpscaleInput(fallbackReq, owner.ownerId);
    const manager = getUpscaleManager();
    const job = await manager.enqueueJob(input);
    return NextResponse.json({ job }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to enqueue upscale job.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
