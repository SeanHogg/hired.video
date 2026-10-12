/**
 * #1560 — Wav2Lip / MuseTalk browser-side lip-sync provider. Implements
 * the `PhotorealAvatarProvider` interface so the existing
 * `/api/photoreal-avatar/renders` route can dispatch through it when
 * the user prefers the no-render-fee browser path over the cloud
 * vendor (D-ID / HeyGen / Synthesia).
 *
 * Lazy-loads the ONNX runtime via `onnxruntime-web` with WebGPU EP
 * when available. The model itself (Wav2Lip / MuseTalk q8) is fetched
 * from R2 on first use and cached. Falls back to no-op when neither
 * dep is present.
 */

export interface Wav2LipInput {
  portraitImage: Blob | ImageBitmap;
  audio: Blob;
  /** ISO language hint for the mouth-shape phoneme model. */
  language?: string;
}

export interface Wav2LipOutput {
  video: Blob;
  durationSec: number;
}

export interface Wav2LipProvider {
  readonly name: string;
  isReady(): boolean;
  warmUp(): Promise<void>;
  render(input: Wav2LipInput): Promise<Wav2LipOutput | null>;
}

class NullWav2LipProvider implements Wav2LipProvider {
  readonly name = "null";
  isReady() { return false; }
  async warmUp() {}
  async render() { return null; }
}

class OnnxRuntimeWav2LipProvider implements Wav2LipProvider {
  readonly name = "onnx-wav2lip";
  private session: unknown = null;
  isReady() { return !!this.session; }
  async warmUp(): Promise<void> {
    if (this.session) return;
    try {
      const ort = (await import(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — optional dep
        "onnxruntime-web"
      ).catch(() => null)) as any;
      if (!ort?.InferenceSession) return;
      const modelUrl =
        (import.meta as any)?.env?.VITE_WAV2LIP_MODEL_URL ??
        "/models/wav2lip-q8.onnx";
      this.session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ["webgpu", "wasm"],
      });
    } catch (err) {
      console.warn("[wav2lip] warm-up failed:", err);
      this.session = null;
    }
  }
  async render(_input: Wav2LipInput): Promise<Wav2LipOutput | null> {
    await this.warmUp();
    if (!this.session) return null;
    // The full Wav2Lip inference loop (audio → mel → ONNX → frames →
    // VideoEncoder) is ~400 lines of plumbing; we stub the call here
    // so the provider seam is testable + the call-site is stable. The
    // real frame loop lands behind a dedicated sub-gap once the
    // model artefact is staged in R2.
    throw new Error("Wav2Lip ONNX provider loaded but frame-loop encoder not yet wired (tracked under #1796).");
  }
}

let active: Wav2LipProvider | null = null;

export function getActiveWav2LipProvider(): Wav2LipProvider {
  if (active) return active;
  const choice = (import.meta as any)?.env?.VITE_WAV2LIP_PROVIDER ?? "null";
  active = choice === "onnx" ? new OnnxRuntimeWav2LipProvider() : new NullWav2LipProvider();
  return active;
}
