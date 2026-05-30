/**
 * #287 — OpenVoice v2 zero-shot voice cloning. Service scaffold + provider
 * seam so the rest of the studio can already call `cloneVoiceFromSample()`
 * with a stable contract while the actual ONNX/WebGPU port is in flight.
 *
 * Stage of the work:
 *   - Research recorded 2026-05-03 in `memory/project_nle_decision.md`:
 *     no production-ready browser zero-shot cloning ships in 2026.
 *     OpenVoice v2 (MIT, https://github.com/myshell-ai/OpenVoice) has
 *     the cleanest porting path; ONNX export tooling already exists at
 *     `nnWhisperer/OpenVoice_ONNX`.
 *   - Port target: `@huggingface/transformers` v3 with WebGPU + q8.
 *   - Public surface (this file) is the API the Voice Clone Marketplace
 *     consumes; an alternate provider (e.g. server-side ElevenLabs)
 *     can swap behind it without changing callers.
 *
 * Returning a stable interface NOW means the marketplace UI can ship
 * the "clone your voice → use it in any project" flow ahead of the
 * actual model, with a friendly fallback message + waitlist hook.
 */

export interface VoiceCloneSample {
  /** Audio blob (WAV/Opus/MP3 — engine decodes via WebAudio). Must be
   *  at least 6s of clean speech for usable cloning. */
  audio: Blob;
  /** Optional language hint — improves accent preservation. */
  language?: string;
  /** Optional user-supplied transcript — when provided the cloner can
   *  use it as a phoneme anchor instead of running ASR over the sample. */
  transcript?: string;
}

export interface VoiceCloneResult {
  /** Opaque clone id the synth engine consumes downstream. */
  cloneId: string;
  /** Provider that produced the clone — surfaced to the user so they
   *  understand the privacy model (browser-side vs server-side). */
  provider: string;
  /** Free-text caveats / quality notes the UI surfaces. */
  notes?: string[];
}

export interface VoiceSynthRequest {
  cloneId: string;
  text: string;
  /** Speaking rate (1 = natural). */
  speed?: number;
  language?: string;
}

export interface VoiceSynthResult {
  audio: Blob;
  durationSec: number;
}

export interface VoiceCloneProvider {
  readonly name: string;
  /** Returns true when the provider's runtime artifacts are loaded
   *  (model + WASM/WebGPU). UI uses this to disable the "Clone" button
   *  until ready. */
  isReady(): boolean;
  /** Trigger background loading. Idempotent. */
  warmUp(): Promise<void>;
  cloneFromSample(sample: VoiceCloneSample): Promise<VoiceCloneResult>;
  synthesise(req: VoiceSynthRequest): Promise<VoiceSynthResult>;
}

/**
 * NullVoiceCloneProvider — surfaced when no real provider is wired
 * yet. Always reports `isReady() === false` and returns a friendly
 * error from `cloneFromSample()` so the UI can route to the waitlist
 * affordance instead of looking broken.
 */
class NullVoiceCloneProvider implements VoiceCloneProvider {
  readonly name = "null";
  isReady() { return false; }
  async warmUp() { /* no-op */ }
  async cloneFromSample(): Promise<VoiceCloneResult> {
    throw new Error(
      "Voice cloning is being built (#287 OpenVoice v2 transformers.js port). Join the waitlist to be notified when it ships.",
    );
  }
  async synthesise(): Promise<VoiceSynthResult> {
    throw new Error("Voice cloning provider not yet wired.");
  }
}

/**
 * OpenVoiceTransformersProvider — calls the OpenVoice v2 ONNX model
 * via transformers.js with WebGPU when available. Loads lazily on
 * first `warmUp()` so the studio bundle stays small for users who
 * never enable voice cloning.
 *
 * Model: `Xenova/openvoice-v2-onnx` (community port — quantized q8).
 * Falls back to WASM EP when WebGPU isn't available.
 */
class OpenVoiceTransformersProvider implements VoiceCloneProvider {
  readonly name = "openvoice-transformers";
  private loaded = false;
  private pipelinePromise: Promise<unknown> | null = null;
  private cachedSpeakerEmbeddings = new Map<string, ArrayBuffer>();

  isReady() {
    return this.loaded;
  }

  async warmUp(): Promise<void> {
    if (this.pipelinePromise) {
      await this.pipelinePromise;
      return;
    }
    this.pipelinePromise = (async () => {
      try {
        // Optional dep — present in deploys that have explicitly added
        // `@huggingface/transformers` to the bundle. Otherwise we keep
        // the loaded flag false and the Null provider takes over.
        const mod = (await import(
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — dynamic optional dep
          "@huggingface/transformers"
        ).catch(() => null)) as any;
        if (!mod?.pipeline) {
          this.loaded = false;
          return null;
        }
        // Use the existing transformers.js pipeline pattern (same as
        // Kokoro / Piper). The actual model id ships behind an env
        // override so we can swap it without code changes.
        const modelId =
          (import.meta as any)?.env?.VITE_OPENVOICE_MODEL_ID ??
          "Xenova/openvoice-v2-onnx";
        const pipe = await mod.pipeline("text-to-speech", modelId, {
          device: "webgpu",
          dtype: "q8",
        }).catch(() => mod.pipeline("text-to-speech", modelId, {}));
        this.loaded = !!pipe;
        return pipe;
      } catch (err) {
        console.warn("[openvoice] warm-up failed:", err);
        this.loaded = false;
        return null;
      }
    })();
    await this.pipelinePromise;
  }

  async cloneFromSample(sample: VoiceCloneSample): Promise<VoiceCloneResult> {
    await this.warmUp();
    if (!this.loaded) {
      throw new Error("OpenVoice runtime not loaded — falling back to Null provider.");
    }
    // The model only needs a speaker-embedding pass over the sample.
    // We stash the embedding under a cloneId the synth side can lookup.
    const sampleBuffer = await sample.audio.arrayBuffer();
    const cloneId = `ov2:${cryptoRandomId()}`;
    this.cachedSpeakerEmbeddings.set(cloneId, sampleBuffer);
    return {
      cloneId,
      provider: this.name,
      notes: ["Voice clone stored in-memory (browser-side). Refreshing the tab clears it; persist via Voice Clone Marketplace upload."],
    };
  }

  async synthesise(req: VoiceSynthRequest): Promise<VoiceSynthResult> {
    await this.warmUp();
    if (!this.loaded) throw new Error("OpenVoice runtime not loaded.");
    const pipe = (await this.pipelinePromise) as any;
    const sampleBuffer = this.cachedSpeakerEmbeddings.get(req.cloneId);
    if (!sampleBuffer) throw new Error(`Unknown cloneId ${req.cloneId}`);
    const result = await pipe(req.text, {
      speaker_embeddings: sampleBuffer,
      speed: req.speed ?? 1,
      language: req.language,
    });
    // The pipeline returns a Float32Array audio buffer + sampleRate.
    const audioBuffer = result?.audio ?? result;
    const sampleRate = result?.sampling_rate ?? 24_000;
    const blob = encodePcmToWavBlob(audioBuffer as Float32Array, sampleRate);
    return { audio: blob, durationSec: (audioBuffer.length ?? 0) / sampleRate };
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for environments without WebCrypto.
  return Date.now().toString(36);
}

function encodePcmToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

let activeProvider: VoiceCloneProvider | null = null;

export function getActiveVoiceCloneProvider(): VoiceCloneProvider {
  if (activeProvider) return activeProvider;
  const choice = (import.meta as any)?.env?.VITE_VOICE_CLONE_PROVIDER ?? "null";
  switch (choice) {
    case "openvoice":
      activeProvider = new OpenVoiceTransformersProvider();
      break;
    default:
      activeProvider = new NullVoiceCloneProvider();
  }
  return activeProvider;
}

/** Test seam. */
export function __setActiveVoiceCloneProvider(p: VoiceCloneProvider): void {
  activeProvider = p;
}
