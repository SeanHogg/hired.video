/**
 * Unified TTS engine facade.
 *
 * This module is the single entry point that the studio uses to play text
 * as speech. It dispatches across four engines:
 *
 *   - "web-speech"  Built-in browser speechSynthesis. Free, instant, no
 *                   download. Voices depend on the OS / browser. Audio
 *                   cannot be captured into an exportable buffer.
 *
 *   - "kokoro"      Kokoro-82M, a small WebGPU TTS model loaded via
 *                   transformers.js / kokoro-js from a CDN ESM bundle.
 *                   ~80MB download on first use, cached in IndexedDB.
 *                   Produces a Float32Array PCM buffer that we play via
 *                   Web Audio AND can export into the rendered video.
 *
 *   - "piper"       Piper TTS via piper-tts-web ESM bundle from CDN.
 *                   Smaller per-voice models (20–60MB), wider voice
 *                   library, slightly more "synthetic" sound. Same PCM
 *                   output shape as Kokoro.
 *
 *   - "vibevoice"   Microsoft VibeVoice for voice cloning. Takes a
 *                   reference audio sample (a creator's licensed clone
 *                   from the Voice Marketplace) and synthesizes new
 *                   speech in that voice. Heavier model than Kokoro,
 *                   loaded the same way (CDN ESM dynamic import).
 *
 * Design notes:
 *
 *   • Engines are loaded lazily on first use. Picking a different engine
 *     in the UI does not download anything until the user actually plays.
 *
 *   • CDN ESM imports are written so a build-time bundler does not try to
 *     resolve them locally — see the `/* @vite-ignore *⁠/` annotations.
 *     This is what lets us add WebGPU TTS without changing package.json.
 *
 *   • All engines fail soft. If a model can't load (no WebGPU, network
 *     error, CDN down) the facade reports an error and the studio falls
 *     back to the always-available Web Speech engine.
 *
 *   • Voice cloning is gated by license: VibeVoice voices are sourced
 *     from /api/studio/voice-clones/library, which only returns clones
 *     the caller owns or has purchased.
 */

import {
  estimateWordTimestamps,
  getBrowserVoices,
  speak as webSpeak,
  stopSpeaking as webStop,
} from "./browser-tts";
import type { TTSVoice } from "./studio-features-service";
import { acquireSharedAudioContext } from "@/lib/audio/live-audio-context";

// ---------------------------------------------------------------------------
// Engine identity + descriptors
// ---------------------------------------------------------------------------

export type TtsEngineId = "web-speech" | "kokoro" | "piper" | "vibevoice";

export interface TtsEngineDescriptor {
  id: TtsEngineId;
  label: string;
  /** One-line pitch shown next to the engine option in the picker. */
  description: string;
  /** Approximate first-load download in megabytes. 0 = nothing to download. */
  modelSizeMb: number;
  /** Whether the engine needs a WebGPU adapter. */
  requiresWebGPU: boolean;
  /** Whether the engine produces PCM audio that can be muxed into exports. */
  exportable: boolean;
  /** Whether the engine supports user-supplied reference voices (cloning). */
  supportsCloning: boolean;
}

export const TTS_ENGINES: TtsEngineDescriptor[] = [
  {
    id: "web-speech",
    label: "Browser (Web Speech)",
    description: "Built-in OS voices. Instant, no download. Not exportable.",
    modelSizeMb: 0,
    requiresWebGPU: false,
    exportable: false,
    supportsCloning: false,
  },
  {
    id: "kokoro",
    label: "Kokoro (WebGPU)",
    description: "High-quality 82M-param WebGPU TTS. ~80MB first load.",
    modelSizeMb: 80,
    requiresWebGPU: true,
    exportable: true,
    supportsCloning: false,
  },
  {
    id: "piper",
    label: "Piper (WebGPU)",
    description: "Lightweight per-voice models. ~30MB per voice.",
    modelSizeMb: 30,
    requiresWebGPU: true,
    exportable: true,
    supportsCloning: false,
  },
  {
    id: "vibevoice",
    label: "VibeVoice (Cloning)",
    description: "Synthesize speech in a licensed creator voice. WebGPU.",
    modelSizeMb: 350,
    requiresWebGPU: true,
    exportable: true,
    supportsCloning: true,
  },
];

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean((navigator as any).gpu);
}

/** True if the engine can be used in this environment without further setup. */
export function isEngineAvailable(engine: TtsEngineId): boolean {
  return getEngineUnavailableReason(engine) === null;
}

/**
 * Single source of truth for why an engine can't be used right now. Returns
 * null when the engine is usable. Callers (picker badges, error messages,
 * fallback decisions) should never branch on the engine id themselves —
 * they should call this and react to the reason string.
 */
export function getEngineUnavailableReason(engine: TtsEngineId): string | null {
  switch (engine) {
    case "web-speech":
      return typeof window !== "undefined" && "speechSynthesis" in window
        ? null
        : "Browser speech synthesis not supported";
    case "kokoro":
    case "piper":
      return isWebGPUAvailable() ? null : "Needs WebGPU (use Chrome/Edge on desktop)";
    case "vibevoice":
      if (!VIBEVOICE_AVAILABLE || !VIBEVOICE_CDN) return "Coming soon";
      if (!isWebGPUAvailable()) return "Needs WebGPU (use Chrome/Edge on desktop)";
      return null;
    default:
      return "Unknown engine";
  }
}

// ---------------------------------------------------------------------------
// CDN import targets
//
// Pinned to specific versions so a CDN side-step doesn't break us silently.
// Bump these intentionally; do not float on @latest.
// ---------------------------------------------------------------------------

const KOKORO_CDN = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";
const PIPER_CDN = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm";
// VibeVoice doesn't have a stable npm package yet; we expect a hosted ESM
// bundle. This URL is a placeholder pinned to a specific revision so it can
// be swapped without touching call sites.
// VibeVoice has no published web ESM bundle yet. When a stable hosted bundle
// becomes available, set this URL and flip VIBEVOICE_AVAILABLE to true.
const VIBEVOICE_CDN = "";
const VIBEVOICE_AVAILABLE = false;

// ---------------------------------------------------------------------------
// Internal: lazily-resolved engine instances
// ---------------------------------------------------------------------------

interface KokoroInstance {
  generate: (text: string, opts?: { voice?: string; speed?: number }) => Promise<{
    audio: Float32Array;
    sampling_rate: number;
  }>;
  voices?: Record<string, { name: string; language?: string; gender?: string }>;
}
interface PiperInstance {
  predict: (text: string, opts?: { voiceId?: string; speed?: number }) => Promise<{
    audio: Float32Array;
    sampleRate: number;
  }>;
  voices: () => Promise<Array<{ id: string; name: string; language?: string }>>;
}
interface VibeVoiceInstance {
  synthesize: (params: {
    text: string;
    referenceAudio: ArrayBuffer;
    speed?: number;
  }) => Promise<{ audio: Float32Array; sampleRate: number }>;
}

let kokoroInstance: KokoroInstance | null = null;
let piperInstance: PiperInstance | null = null;
let vibevoiceInstance: VibeVoiceInstance | null = null;

async function loadKokoro(): Promise<KokoroInstance> {
  if (kokoroInstance) return kokoroInstance;
  if (!isWebGPUAvailable()) throw new Error("Kokoro requires WebGPU");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* @vite-ignore */ KOKORO_CDN)) as any;
  const KokoroTTS = mod.KokoroTTS ?? mod.default;
  if (!KokoroTTS) throw new Error("kokoro-js: KokoroTTS export not found");
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
    device: "webgpu",
  });
  kokoroInstance = tts;
  return tts;
}

async function loadPiper(): Promise<PiperInstance> {
  if (piperInstance) return piperInstance;
  if (!isWebGPUAvailable()) throw new Error("Piper requires WebGPU");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* @vite-ignore */ PIPER_CDN)) as any;
  const tts = mod.default ?? mod;
  piperInstance = tts;
  return tts;
}

async function loadVibeVoice(): Promise<VibeVoiceInstance> {
  if (vibevoiceInstance) return vibevoiceInstance;
  if (!isWebGPUAvailable()) throw new Error("VibeVoice requires WebGPU");
  if (!VIBEVOICE_AVAILABLE || !VIBEVOICE_CDN) {
    throw new Error("VibeVoice is not yet available — no hosted ESM bundle published.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* @vite-ignore */ VIBEVOICE_CDN)) as any;
  const VibeVoice = mod.VibeVoice ?? mod.default;
  if (!VibeVoice) throw new Error("vibevoice: VibeVoice export not found");
  const inst = await VibeVoice.fromPretrained("microsoft/VibeVoice-1.5B", { device: "webgpu" });
  vibevoiceInstance = inst;
  return inst;
}

// ---------------------------------------------------------------------------
// Voice listing per engine
// ---------------------------------------------------------------------------

/**
 * Curated default voices Kokoro ships with. We don't load the model just to
 * enumerate voices — these match the public Kokoro-82M voice keys.
 */
const KOKORO_VOICES: TTSVoice[] = [
  { voice_id: "af_heart",   name: "Heart (US Female)",   category: "kokoro", labels: { lang: "en-US", gender: "female" } },
  { voice_id: "af_bella",   name: "Bella (US Female)",   category: "kokoro", labels: { lang: "en-US", gender: "female" } },
  { voice_id: "af_nicole",  name: "Nicole (US Female)",  category: "kokoro", labels: { lang: "en-US", gender: "female" } },
  { voice_id: "am_adam",    name: "Adam (US Male)",      category: "kokoro", labels: { lang: "en-US", gender: "male" } },
  { voice_id: "am_michael", name: "Michael (US Male)",   category: "kokoro", labels: { lang: "en-US", gender: "male" } },
  { voice_id: "bf_emma",    name: "Emma (UK Female)",    category: "kokoro", labels: { lang: "en-GB", gender: "female" } },
  { voice_id: "bm_george",  name: "George (UK Male)",    category: "kokoro", labels: { lang: "en-GB", gender: "male" } },
];

/** Piper voice list — fetched lazily from the model index. */
const PIPER_VOICES_FALLBACK: TTSVoice[] = [
  { voice_id: "en_US-amy-medium",     name: "Amy (US Female)",     category: "piper", labels: { lang: "en-US", gender: "female" } },
  { voice_id: "en_US-ryan-medium",    name: "Ryan (US Male)",      category: "piper", labels: { lang: "en-US", gender: "male" } },
  { voice_id: "en_GB-alan-medium",    name: "Alan (UK Male)",      category: "piper", labels: { lang: "en-GB", gender: "male" } },
  { voice_id: "en_GB-jenny-medium",   name: "Jenny (UK Female)",   category: "piper", labels: { lang: "en-GB", gender: "female" } },
];

/** Loads the licensed-voices library from the backend. */
async function loadLicensedVoices(): Promise<TTSVoice[]> {
  // Lazy import so this module has no hard runtime dep on apiClient when only
  // browser TTS is in use.
  const { getLicensedVoices } = await import("./studio-features-service");
  try {
    const voices = await getLicensedVoices();
    return voices.map((v) => ({
      voice_id: v.id,
      name: v.name + (v.isOwner ? " (you)" : ""),
      category: "vibevoice",
      labels: {
        lang: v.language ?? "en",
        ...(v.gender ? { gender: v.gender } : {}),
        ...(v.accent ? { accent: v.accent } : {}),
      },
    }));
  } catch {
    return [];
  }
}

export async function getEngineVoices(engine: TtsEngineId): Promise<TTSVoice[]> {
  switch (engine) {
    case "web-speech":
      return getBrowserVoices();
    case "kokoro":
      return KOKORO_VOICES;
    case "piper":
      return PIPER_VOICES_FALLBACK;
    case "vibevoice":
      return loadLicensedVoices();
  }
}

// ---------------------------------------------------------------------------
// Speech playback
// ---------------------------------------------------------------------------

export interface EngineSpeakOptions {
  text: string;
  voiceId: string;
  speed?: number;
  /** Output gain in 0..1. Defaults to 1. Live-mutable via
   *  `setEngineVolume()` for the WebGPU engines (they route through a
   *  GainNode); web-speech reads it once at `.speak()` time and live
   *  changes only take effect on the next utterance. */
  volume?: number;
  /**
   * Fired with the index of the word currently being spoken (0-based).
   * Web Speech provides this natively; WebGPU engines emulate it from the
   * pre-estimated word timings, since their PCM buffer is rendered in one
   * shot and we drive highlight animation from a setInterval.
   */
  onBoundary?: (wordIndex: number) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

let activeWebAudioCtx: AudioContext | null = null;
// Release handle for the shared live context held during PCM playback. The
// context used to be created here and never closed — it leaked the audio
// device handle and re-emitted "The AudioContext encountered an error from the
// audio device or the WebAudio renderer" on unrelated pages long after the
// studio session ended. We now borrow the shared context and release it the
// moment playback stops.
let releaseWebAudioCtx: (() => void) | null = null;
let activeWebAudioSource: AudioBufferSourceNode | null = null;
let activeBoundaryTimer: ReturnType<typeof setInterval> | null = null;
// Shared GainNode for the WebGPU engines' Web Audio playback chain.
// Owned at module scope so callers can live-change the volume via
// `setEngineVolume()` without re-rendering the PCM buffer.
let activeGainNode: GainNode | null = null;
let currentEngineVolume = 1;

/** Live-change the output gain for any active or future PCM playback
 *  (Kokoro / Piper / VibeVoice). Web Speech can't be live-volumed mid-
 *  utterance — its value is captured at `.speak()` time — so the
 *  TextNarrator passes the current volume through to `speakWithEngine`
 *  on every speak as a fallback. */
export function setEngineVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  currentEngineVolume = clamped;
  if (activeGainNode) {
    activeGainNode.gain.value = clamped;
  }
}

function clearWebAudio() {
  if (activeWebAudioSource) {
    try { activeWebAudioSource.stop(); } catch {}
    activeWebAudioSource.disconnect();
    activeWebAudioSource = null;
  }
  if (activeGainNode) {
    try { activeGainNode.disconnect(); } catch {}
    activeGainNode = null;
  }
  if (activeBoundaryTimer) {
    clearInterval(activeBoundaryTimer);
    activeBoundaryTimer = null;
  }
  // Release the shared live context so its device handle doesn't linger.
  releaseWebAudioCtx?.();
  releaseWebAudioCtx = null;
  activeWebAudioCtx = null;
}

/** Play a Float32Array of PCM samples and return a cancel function. */
function playPcm(
  pcm: Float32Array,
  sampleRate: number,
  text: string,
  speed: number,
  volume: number,
  onBoundary?: (wordIndex: number) => void,
  onEnd?: () => void,
  onError?: (msg: string) => void,
): () => void {
  try {
    clearWebAudio();
    const acquired = acquireSharedAudioContext();
    activeWebAudioCtx = acquired.ctx;
    releaseWebAudioCtx = acquired.release;
    const ctx = activeWebAudioCtx;
    const buf = ctx.createBuffer(1, pcm.length, sampleRate);
    buf.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // Insert a GainNode so live volume changes work without re-decoding
    // the PCM buffer. The module-scope `setEngineVolume()` mutates this
    // node's `.gain.value` directly during playback.
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    currentEngineVolume = gain.gain.value;
    src.connect(gain).connect(ctx.destination);
    activeGainNode = gain;
    src.onended = () => {
      if (activeBoundaryTimer) {
        clearInterval(activeBoundaryTimer);
        activeBoundaryTimer = null;
      }
      onEnd?.();
    };
    src.start();
    activeWebAudioSource = src;

    // Drive an approximate word boundary callback from the pre-estimated
    // timings. WebGPU engines render the whole utterance in one buffer so
    // there's no native "word event" — we use the same word-timing model the
    // captions use elsewhere in the studio.
    if (onBoundary) {
      const { timestamps } = estimateWordTimestamps(text, speed);
      const startedAt = ctx.currentTime;
      let lastIdx = -1;
      activeBoundaryTimer = setInterval(() => {
        const elapsedMs = (ctx.currentTime - startedAt) * 1000;
        let idx = lastIdx;
        for (let i = lastIdx + 1; i < timestamps.length; i++) {
          if (timestamps[i].start <= elapsedMs) idx = i;
          else break;
        }
        if (idx !== lastIdx) {
          lastIdx = idx;
          onBoundary(idx);
        }
      }, 50);
    }

    return () => clearWebAudio();
  } catch (err) {
    onError?.(err instanceof Error ? err.message : "Playback failed");
    return () => {};
  }
}

/**
 * Speak `text` using the chosen engine. Returns a cancel function.
 *
 * For Web Speech this is a thin wrapper over the existing browser-tts speak()
 * call. For the WebGPU engines we lazy-load the model on first use, render
 * the entire utterance to PCM, then play through the Web Audio context.
 */
export async function speakWithEngine(
  engine: TtsEngineId,
  opts: EngineSpeakOptions,
): Promise<() => void> {
  const volume = opts.volume ?? 1;

  if (engine === "web-speech") {
    return webSpeak({
      text: opts.text,
      voiceId: opts.voiceId || undefined,
      rate: opts.speed ?? 1,
      volume,
      onBoundary: opts.onBoundary,
      onEnd: opts.onEnd,
      onError: opts.onError,
    });
  }

  // ── WebGPU engines: render to PCM, then play ───────────────────────────
  try {
    if (engine === "kokoro") {
      const tts = await loadKokoro();
      const out = await tts.generate(opts.text, { voice: opts.voiceId, speed: opts.speed });
      return playPcm(out.audio, out.sampling_rate, opts.text, opts.speed ?? 1, volume, opts.onBoundary, opts.onEnd, opts.onError);
    }
    if (engine === "piper") {
      const tts = await loadPiper();
      const out = await tts.predict(opts.text, { voiceId: opts.voiceId, speed: opts.speed });
      return playPcm(out.audio, out.sampleRate, opts.text, opts.speed ?? 1, volume, opts.onBoundary, opts.onEnd, opts.onError);
    }
    if (engine === "vibevoice") {
      // The voiceId for VibeVoice is a studioVoiceClones.id. We fetch the
      // creator's reference sample (license-checked server-side) and pass
      // the bytes to the model.
      const { getLicensedVoices } = await import("./studio-features-service");
      const voices = await getLicensedVoices();
      const voice = voices.find((v) => v.id === opts.voiceId);
      if (!voice?.sampleAudioUrl) {
        throw new Error("Voice clone reference audio not found or not licensed");
      }
      const refRes = await fetch(voice.sampleAudioUrl);
      if (!refRes.ok) throw new Error(`Failed to fetch reference audio (${refRes.status})`);
      const referenceAudio = await refRes.arrayBuffer();
      const tts = await loadVibeVoice();
      const out = await tts.synthesize({
        text: opts.text,
        referenceAudio,
        speed: opts.speed,
      });
      return playPcm(out.audio, out.sampleRate, opts.text, opts.speed ?? 1, volume, opts.onBoundary, opts.onEnd, opts.onError);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : `Engine ${engine} failed to synthesize`;
    opts.onError?.(msg);
    // Fall back to Web Speech so the studio doesn't go silent. The caller
    // can detect the fallback by listening for onError before onEnd.
    return webSpeak({
      text: opts.text,
      rate: opts.speed ?? 1,
      volume,
      onBoundary: opts.onBoundary,
      onEnd: opts.onEnd,
      onError: opts.onError,
    });
  }
  // Unreachable, but the type system wants it.
  return () => {};
}

/** Stop any active playback regardless of engine. */
export function stopEngine(): void {
  clearWebAudio();
  webStop();
}

// ---------------------------------------------------------------------------
// Convenience: render PCM without playing — used by the export pipeline and
// by the "render preview" step that uploads a short sample to the marketplace.
// ---------------------------------------------------------------------------

export async function renderToPcm(
  engine: TtsEngineId,
  text: string,
  voiceId: string,
  speed = 1,
): Promise<{ pcm: Float32Array; sampleRate: number }> {
  if (engine === "web-speech") {
    throw new Error("Web Speech cannot be rendered to PCM. Use Kokoro, Piper, or VibeVoice.");
  }
  if (engine === "kokoro") {
    const tts = await loadKokoro();
    const out = await tts.generate(text, { voice: voiceId, speed });
    return { pcm: out.audio, sampleRate: out.sampling_rate };
  }
  if (engine === "piper") {
    const tts = await loadPiper();
    const out = await tts.predict(text, { voiceId, speed });
    return { pcm: out.audio, sampleRate: out.sampleRate };
  }
  // vibevoice
  const { getLicensedVoices } = await import("./studio-features-service");
  const voices = await getLicensedVoices();
  const voice = voices.find((v) => v.id === voiceId);
  if (!voice?.sampleAudioUrl) throw new Error("Voice clone reference audio not licensed");
  const refRes = await fetch(voice.sampleAudioUrl);
  const referenceAudio = await refRes.arrayBuffer();
  const tts = await loadVibeVoice();
  const out = await tts.synthesize({ text, referenceAudio, speed });
  return { pcm: out.audio, sampleRate: out.sampleRate };
}

/** Encode a Float32Array PCM buffer as a 16-bit PCM WAV file. */
export function pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const numChannels = 1;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Render a short sample with the chosen engine and return a base64 WAV. */
export async function renderPreviewBase64(
  engine: Exclude<TtsEngineId, "web-speech">,
  voiceId: string,
  text = "Hi! This is a quick preview of how I sound.",
): Promise<{ base64: string; mime: string }> {
  const { pcm, sampleRate } = await renderToPcm(engine, text, voiceId, 1);
  const blob = pcmToWav(pcm, sampleRate);
  const buf = await blob.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { base64: btoa(bin), mime: "audio/wav" };
}
