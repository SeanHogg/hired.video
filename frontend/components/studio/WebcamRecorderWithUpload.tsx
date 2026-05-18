/**
 * Thin upload-wrapping host for `WebcamRecorder`. Every surface that
 * captures a clip and wants a persisted URL routes through here so the
 * record → upload → fallback-toast logic only lives in one place. The
 * inner `WebcamRecorder` is lazy-loaded; consumers can in turn lazy-
 * load this wrapper to keep the MediaRecorder chunk off the editor's
 * initial bundle.
 *
 * Consumers handle their own container (Dialog, Sheet, inline) and
 * their own success messaging. The wrapper only owns the cross-cutting
 * upload-failure toast + the "uploading…" hint, so the success path
 * stays silent and the caller decides what to say (drop on canvas,
 * write to a URL field, etc.).
 */
import { Suspense, lazy, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { uploadRecording } from "@/lib/services/studio-features-service";
import type { RecordingMode } from "@/components/studio/WebcamRecorder";

const WebcamRecorder = lazy(() =>
  import("@/components/studio/WebcamRecorder").then((m) => ({
    default: m.WebcamRecorder,
  })),
);

export interface WebcamRecorderWithUploadProps {
  mode?: RecordingMode;
  /** Anchor the recording to a studio project when one exists; the
   *  backend stores the recording orphaned otherwise (still returns a
   *  usable CDN URL). */
  projectId?: string;
  autoStart?: boolean;
  maxDurationSec?: number;
  teleprompterText?: string;
  /** Fires once per finished clip. `url` is the persisted CDN URL on
   *  success, or an in-memory blob URL on upload failure (with a
   *  destructive toast already shown). `durationSeconds` matches what
   *  the renderer wants for clip duration. */
  onCaptured: (url: string, durationSeconds: number) => void;
}

export default function WebcamRecorderWithUpload({
  mode = "webcam",
  projectId,
  autoStart,
  maxDurationSec,
  teleprompterText,
  onCaptured,
}: WebcamRecorderWithUploadProps) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  async function handleComplete(blob: Blob, durationMs: number) {
    const durationSec = durationMs / 1000;
    setUploading(true);
    try {
      const ext = (blob.type || "").includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `recording-${Date.now()}.${ext}`, {
        type: blob.type || "video/webm",
      });
      const { videoUrl } = await uploadRecording(file, mode, projectId, durationMs);
      if (videoUrl) {
        onCaptured(videoUrl, durationSec);
      } else {
        onCaptured(URL.createObjectURL(blob), durationSec);
        toast({
          title: "Saved locally only",
          description: "Upload returned no URL — this clip will be lost on refresh.",
          variant: "destructive",
        });
      }
    } catch (err) {
      onCaptured(URL.createObjectURL(blob), durationSec);
      toast({
        title: "Upload failed — using local clip",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Suspense
        fallback={
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <WebcamRecorder
          mode={mode}
          autoStart={autoStart}
          maxDurationSec={maxDurationSec}
          teleprompterText={teleprompterText}
          onRecordingComplete={handleComplete}
        />
      </Suspense>
      {uploading && (
        <p className="mt-2 text-xs text-muted-foreground">Uploading recording…</p>
      )}
    </>
  );
}
