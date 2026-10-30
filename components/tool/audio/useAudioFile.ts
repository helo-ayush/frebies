"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

export type AudioItem = {
  id: string;
  file: File;
  url: string;
  name: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
  channelPeaks: number[][];
  decoding: boolean;
  buffer?: AudioBuffer;
};

const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/ogg",
];
const AUDIO_EXTENSION = /\.(mp3|wav|m4a|ogg)$/i;
const BARS = 80;

function isAudioFile(file: File) {
  return AUDIO_TYPES.includes(file.type) || AUDIO_EXTENSION.test(file.name);
}

function fallbackPeaks(file: File): number[] {
  const seed = (file.size % 997) + file.name.length;
  return Array.from({ length: BARS }, (_, index) => {
    const wave =
      Math.abs(Math.sin(index * 0.42 + seed * 0.13)) *
      (0.55 + 0.45 * Math.abs(Math.sin(index * 0.11 + seed * 0.07)));
    return Math.max(0.07, Math.min(1, wave));
  });
}

function computePeaks(data: Float32Array, bars = BARS): number[] {
  const block = Math.max(1, Math.floor(data.length / bars));
  const peaks: number[] = [];
  for (let index = 0; index < bars; index += 1) {
    let max = 0;
    const start = index * block;
    const end = Math.min(data.length, start + block);
    for (let cursor = start; cursor < end; cursor += 1) {
      const value = Math.abs(data[cursor]);
      if (value > max) max = value;
    }
    peaks.push(max);
  }
  const loudest = Math.max(...peaks, 0.0001);
  return peaks.map((peak) =>
    Math.max(0.06, Math.min(1, Math.pow(peak / loudest, 0.72))),
  );
}

export { computePeaks };

export function useAudioFile({
  maxSizeMB = 50,
  maxDurationMin = 30,
}: {
  maxSizeMB?: number;
  maxDurationMin?: number;
} = {}) {
  const [item, setItem] = useState<AudioItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<AudioItem | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  useEffect(
    () => () => {
      if (itemRef.current) URL.revokeObjectURL(itemRef.current.url);
    },
    [],
  );

  const clear = useCallback(() => {
    if (itemRef.current) URL.revokeObjectURL(itemRef.current.url);
    setItem(null);
    setError(null);
  }, []);

  const accept = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;
      const file = files[0];

      if (!isAudioFile(file)) {
        setError("Choose an MP3, WAV, M4A or OGG audio file.");
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`That file is larger than ${maxSizeMB} MB.`);
        return;
      }

      if (itemRef.current) URL.revokeObjectURL(itemRef.current.url);
      idRef.current += 1;
      const id = `audio-${idRef.current}`;
      const url = URL.createObjectURL(file);
      const peaks = fallbackPeaks(file);

      setError(null);
      setItem({
        id,
        file,
        url,
        name: file.name,
        size: file.size,
        duration: 0,
        sampleRate: 0,
        channels: 0,
        peaks,
        channelPeaks: [peaks],
        decoding: true,
      });

      const probe = new Audio();
      probe.preload = "metadata";
      probe.addEventListener(
        "loadedmetadata",
        () => {
          const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
          if (maxDurationMin && duration > maxDurationMin * 60) {
            clear();
            setError(
              `That clip runs ${Math.round(duration / 60)} minutes — the limit is ${maxDurationMin} minutes.`,
            );
            return;
          }
          setItem((current) =>
            current?.id === id ? { ...current, duration: duration || current.duration } : current,
          );
        },
        { once: true },
      );
      probe.src = url;

      void (async () => {
        try {
          const buffer = await file.arrayBuffer();
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!AudioContextClass) throw new Error("no audio context");
          const context = new AudioContextClass();
          const decoded = await context.decodeAudioData(buffer.slice(0));
          const decodedPeaks = computePeaks(decoded.getChannelData(0));
          const channelPeaks = Array.from(
            { length: Math.min(2, decoded.numberOfChannels) },
            (_, channel) => computePeaks(decoded.getChannelData(channel)),
          );
          setItem((current) =>
            current?.id === id
              ? {
                  ...current,
                  peaks: decodedPeaks,
                  channelPeaks,
                  duration: decoded.duration || current.duration,
                  sampleRate: decoded.sampleRate,
                  channels: decoded.numberOfChannels,
                  decoding: false,
                  buffer: decoded,
                }
              : current,
          );
          await context.close();
        } catch {
          setItem((current) =>
            current?.id === id ? { ...current, decoding: false } : current,
          );
        }
      })();
    },
    [clear, maxDurationMin, maxSizeMB],
  );

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    accept(event.target.files);
    event.target.value = "";
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files);
  }

  return {
    item,
    error,
    setError,
    dragging,
    inputRef,
    openPicker,
    onPick,
    onDragOver,
    onDragLeave,
    onDrop,
    clear,
  };
}
