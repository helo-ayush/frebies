import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { AudioSelection } from "../AudioPlayer";
import type { TrimFormat, TrimSettings } from "./model";
import {
  ConversionCancelled,
  encodeWav,
  encodeWithFfmpeg,
  ensureEngine,
  type ConversionResult,
  type EncodeOptions,
} from "../converter/engine";

const MIME: Record<TrimFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

export async function trimAudio(
  source: AudioBuffer,
  selection: AudioSelection,
  settings: TrimSettings,
  title: string,
  onProgress: (value: number, label: string) => void,
  isCancelled: () => boolean,
): Promise<ConversionResult> {
  const needsEngine = settings.format !== "wav";
  const ffmpeg = needsEngine
    ? await ensureEngine((value, label) => onProgress(value * 0.35, label))
    : null;

  if (isCancelled()) throw new ConversionCancelled();

  onProgress(0.35, "Slicing the selection…");
  const sampleRate = source.sampleRate;
  const startFrame = Math.max(0, Math.round(selection.start * sampleRate));
  const endFrame = Math.min(source.length, Math.round(selection.end * sampleRate));
  const length = Math.max(1, endFrame - startFrame);

  const channels = Array.from({ length: source.numberOfChannels }, (_, channel) =>
    source.getChannelData(channel).slice(startFrame, endFrame),
  );

  const requestedFadeFrames = (settings.fadeIn + settings.fadeOut) * sampleRate;
  const fadeScale = requestedFadeFrames > length ? length / requestedFadeFrames : 1;
  const fadeInFrames = Math.round(settings.fadeIn * sampleRate * fadeScale);
  const fadeOutFrames = Math.round(settings.fadeOut * sampleRate * fadeScale);

  for (let index = 0; index < fadeInFrames; index += 1) {
    const gain = 0.5 * (1 - Math.cos((Math.PI * index) / fadeInFrames));
    for (const channel of channels) channel[index] *= gain;
  }
  for (let index = 0; index < fadeOutFrames; index += 1) {
    const gain = 0.5 * (1 + Math.cos((Math.PI * index) / fadeOutFrames));
    const frame = length - fadeOutFrames + index;
    for (const channel of channels) channel[frame] *= gain;
  }

  if (isCancelled()) throw new ConversionCancelled();

  onProgress(0.52, `Writing ${settings.format.toUpperCase()}…`);
  if (settings.format === "wav") {
    const blob = encodeWav(
      channels,
      sampleRate,
      16,
      settings.metadata ? { title, artist: "" } : undefined,
    );
    onProgress(1, "Done");
    return { blob, mime: MIME.wav };
  }

  const inputWav = encodeWav(channels, sampleRate, 16);
  const options: EncodeOptions = {
    bitrate: settings.bitrate,
    vbr: false,
    metadata: settings.metadata,
    title,
    artist: "",
  };
  const blob = await encodeWithFfmpeg(
    ffmpeg as FFmpeg,
    inputWav,
    settings.format,
    options,
    (value, label) => onProgress(0.52 + value * 0.48, label),
  );
  onProgress(1, "Done");
  return { blob, mime: MIME[settings.format] };
}
