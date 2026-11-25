/**
 * Plays the interface sounds: short recordings in `public/sounds` (see its
 * LICENSE.txt). Nothing is fetched while sound is off, and nothing can start
 * before the visitor's first press.
 */

type Take = { file: string; gain?: number; rate?: number; delay?: number };
type Cue = {
  /** Different recordings of the same thing. Never the same one twice running. */
  takes: (string | Take[])[];
  gain: number;
  /** Random pitch spread in cents, so repeats do not sound copied. */
  spread?: number;
};

const CUES = {
  // keys
  tap: { takes: ["tap-1", "tap-2", "tap-3", "tap-4"], gain: 0.5, spread: 60 },
  select: { takes: ["select-1", "select-2", "select-3"], gain: 0.4, spread: 60 },
  on: { takes: ["on"], gain: 0.5, spread: 30 },
  off: { takes: ["off"], gain: 0.45, spread: 30 },
  tick: { takes: ["tick-1", "tick-2"], gain: 0.3, spread: 90 },
  key: { takes: ["key-1", "key-2"], gain: 0.45, spread: 120 },
  hover: { takes: ["hover"], gain: 0.12, spread: 160 },
  zoom: { takes: ["zoom-1", "zoom-2"], gain: 0.34, spread: 50 },
  mute: { takes: ["mute"], gain: 0.55 },
  blocked: { takes: ["thud-1", "thud-2"], gain: 0.5, spread: 60 },

  // moving around
  nav: { takes: ["nav-1", "nav-2", "nav-3"], gain: 0.5, spread: 70 },
  open: { takes: ["open"], gain: 0.5, spread: 50 },
  close: { takes: ["close"], gain: 0.5, spread: 50 },
  strip: { takes: ["strip-1", "strip-2"], gain: 0.5, spread: 110 },
  page: { takes: ["page-1", "page-2", "page-3"], gain: 0.42, spread: 60 },
  place: { takes: ["close"], gain: 0.55, spread: 80 },
  remove: { takes: ["remove"], gain: 0.4, spread: 60 },
  clear: { takes: ["clear"], gain: 0.5, spread: 40 },

  // a file lands
  "drop-image": { takes: ["drop-image-1", "drop-image-2"], gain: 0.6, spread: 50 },
  "drop-document": { takes: ["drop-doc-1", "drop-doc-2"], gain: 0.6, spread: 50 },
  "drop-audio": { takes: ["drop-audio"], gain: 0.6, spread: 30 },
  "drop-video": { takes: ["drop-video"], gain: 0.6, spread: 30 },

  // the big key
  run: { takes: ["run"], gain: 0.6, spread: 20 },
  "run-convert": { takes: ["run-convert"], gain: 0.6, spread: 20 },
  "run-compress": { takes: ["run-compress"], gain: 0.7, spread: 20 },
  "run-resize": { takes: ["run-resize"], gain: 0.55, spread: 20 },
  "run-to-pdf": { takes: ["run-to-pdf"], gain: 0.65, spread: 20 },
  "run-upscale": { takes: ["run-upscale"], gain: 0.65, spread: 20 },
  "run-merge": { takes: ["run-merge"], gain: 0.55, spread: 20 },
  "run-split": { takes: ["run-split"], gain: 0.5, spread: 20 },
  "run-to-jpg": { takes: ["run-to-jpg"], gain: 0.5, spread: 20 },
  "run-audio": { takes: ["run-audio"], gain: 0.55, spread: 20 },
  "run-trim": { takes: ["run-trim"], gain: 0.5, spread: 20 },
  "run-speech": { takes: ["run-speech"], gain: 0.6, spread: 20 },
  "run-vocal": { takes: ["run-vocal"], gain: 0.5, spread: 20 },
  "run-dub": { takes: ["run-dub"], gain: 0.6, spread: 20 },

  // taking it away
  "save-image": { takes: ["save-image"], gain: 0.55, spread: 30 },
  "save-document": { takes: ["save-doc"], gain: 0.65, spread: 30 },
  "save-audio": { takes: ["save-audio"], gain: 0.5, spread: 30 },
  "save-video": { takes: ["save-video"], gain: 0.5, spread: 30 },

  // how it went
  success: {
    takes: [
      [
        { file: "done-glass", gain: 0.5, rate: 1 },
        { file: "done", gain: 0.5, rate: 1.5, delay: 0.07 },
      ],
    ],
    gain: 0.55,
  },
  error: {
    takes: [
      [
        { file: "knock-1", rate: 1 },
        { file: "knock-2", rate: 0.84, delay: 0.13 },
      ],
    ],
    gain: 0.6,
  },
  warning: { takes: ["knock-light"], gain: 0.55 },
} satisfies Record<string, Cue>;

export type SoundName = keyof typeof CUES;
export const isSoundName = (name: string): name is SoundName => name in CUES;

/** What each tool's big key sounds like. */
const RUN: Record<string, SoundName> = {
  "/image/convert": "run-convert",
  "/image/compress": "run-compress",
  "/image/resize": "run-resize",
  "/image/to-pdf": "run-to-pdf",
  "/image/upscaler": "run-upscale",
  "/document/edit-pdf": "run-merge",
  "/document/merge-pdf": "run-merge",
  "/document/split-pdf": "run-split",
  "/document/pdf-to-jpg": "run-to-jpg",
  "/audio/convert": "run-audio",
  "/audio/trim": "run-trim",
  "/audio/text-to-speech": "run-speech",
  "/audio/vocal-remover": "run-vocal",
  "/video/dubbing": "run-dub",
};

type Family = "image" | "document" | "audio" | "video";

function family(): Family {
  const name = window.location.pathname.split("/")[1];
  return name === "document" || name === "audio" || name === "video" ? name : "image";
}

export const runSound = (): SoundName => RUN[window.location.pathname] ?? "run";
export const dropSound = (): SoundName => `drop-${family()}`;
export const saveSound = (): SoundName => `save-${family()}`;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.5;
let live = 0;
const MAX_LIVE = 10;

type Clip = { buffer: AudioBuffer; start: number };
const clips = new Map<string, Promise<Clip | null>>();
const ready = new Map<string, Clip>();
const last = new Map<string, number>();

const filesOf = (name: SoundName) =>
  (CUES[name] as Cue).takes.flatMap((take) => (typeof take === "string" ? [take] : take.map((part) => part.file)));

/** MP3 files open with a few silent milliseconds; a key has to answer at once. */
function firstSound(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > 0.004) return Math.max(0, i / buffer.sampleRate - 0.001);
  return 0;
}

function load(file: string): Promise<Clip | null> {
  const known = clips.get(file);
  if (known) return known;
  const job = (async () => {
    try {
      const response = await fetch(`/sounds/${file}.mp3`);
      if (!response.ok) return null;
      // An offline context can decode before the first press, when a live one may not exist yet.
      const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await response.arrayBuffer());
      const clip = { buffer, start: firstSound(buffer) };
      ready.set(file, clip);
      return clip;
    } catch {
      clips.delete(file);
      return null;
    }
  })();
  clips.set(file, job);
  return job;
}

export function preloadSounds(names: SoundName[]) {
  if (muted) return;
  for (const name of names) for (const file of filesOf(name)) void load(file);
}

export function setSoundOutput(next: { muted: boolean; volume: number }) {
  muted = next.muted;
  volume = next.volume;
  if (master && context) master.gain.setTargetAtTime(muted ? 0 : volume * 2, context.currentTime, 0.01);
}

function output(): { context: AudioContext; master: GainNode } | null {
  if (!context) {
    // Only after a press: browsers refuse to start audio before one.
    if (!navigator.userActivation?.hasBeenActive) return null;
    try {
      context = new AudioContext({ latencyHint: "interactive" });
    } catch {
      return null;
    }
    master = context.createGain();
    master.gain.value = volume * 2;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.09;
    master.connect(limiter).connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return master ? { context, master } : null;
}

function start(clip: Clip, gain: number, rate: number, delay: number) {
  const out = output();
  if (!out || live >= MAX_LIVE) return;
  const source = out.context.createBufferSource();
  const level = out.context.createGain();
  source.buffer = clip.buffer;
  source.playbackRate.value = rate;
  level.gain.value = gain;
  source.connect(level).connect(out.master);
  live += 1;
  source.onended = () => {
    live -= 1;
    level.disconnect();
  };
  source.start(out.context.currentTime + delay, clip.start);
}

export function playSound(name: SoundName, options: { velocity?: number; detune?: number } = {}) {
  if (muted || !navigator.userActivation?.hasBeenActive) return;
  const cue: Cue = CUES[name];
  let at = Math.floor(Math.random() * cue.takes.length);
  if (cue.takes.length > 1 && at === last.get(name)) at = (at + 1) % cue.takes.length;
  last.set(name, at);
  const take = cue.takes[at];
  const parts: Take[] = typeof take === "string" ? [{ file: take }] : take;
  const cents = (options.detune ?? 0) + (Math.random() * 2 - 1) * (cue.spread ?? 0);
  const pitch = 2 ** (cents / 1200);
  const force = cue.gain * (options.velocity ?? 1) * (0.92 + Math.random() * 0.08);
  for (const part of parts) {
    const begin = (clip: Clip) => start(clip, force * (part.gain ?? 1), pitch * (part.rate ?? 1), part.delay ?? 0);
    const clip = ready.get(part.file);
    if (clip) {
      begin(clip);
      continue;
    }
    // Not here yet. Late sounds are worse than none, so a slow one only loads.
    const asked = performance.now();
    void load(part.file).then((late) => {
      if (late && performance.now() - asked < 180) begin(late);
    });
  }
}
