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
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import UnsavedMediaAlert from "@/components/studio/UnsavedMediaAlert";
import { persistRecording, recordingFileFromBlob } from "@/lib/studio/recording-upload";
import type { RecordingMode } from "@/lib/studio/recording-modes";

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
  /** Fires once per finished clip that was uploaded. `url` is always the
   *  persisted CDN URL — never a blob: URL (#563). On upload failure the
   *  wrapper keeps the clip and offers Retry / Download / Discard instead.
   *  `durationSeconds` matches what the renderer wants for clip duration. */
  onCaptured: (url: string, durationSeconds: number) => void;
  /** Enables the recorder's in-panel source picker. The host updates
   *  `mode` in response; the wrapper remounts the recorder keyed by mode
   *  (old streams released by its unmount cleanup) and auto-arms the new
   *  source, since picking a source chip is the user's "use this" click. */
  onModeChange?: (mode: RecordingMode) => void;
}

export default function WebcamRecorderWithUpload({
  mode = "webcam",
  projectId,
  autoStart,
  maxDurationSec,
  teleprompterText,
  onCaptured,
  onModeChange,
}: WebcamRecorderWithUploadProps) {
  const [uploading, setUploading] = useState(false);
  // Set once the user swaps source via the in-panel picker — the
  // remounted recorder then starts its preview straight away.
  const [rearmOnSwap, setRearmOnSwap] = useState(false);
  const handleModeChange = onModeChange
    ? (next: RecordingMode) => {
        if (next === mode) return;
        setRearmOnSwap(true);
        onModeChange(next);
      }
    : undefined;
  const { toast } = useToast();
  const { t } = useTranslation();

  // A clip whose upload failed stays here (in memory) until it's uploaded,
  // downloaded or discarded — it is never handed on as a blob: URL (#563).
  // The alert registers it as unsaved work until it's dealt with.
  const [failed, setFailed] = useState<{ blob: Blob; durationMs: number } | null>(null);

  async function uploadClip(blob: Blob, durationMs: number) {
    setUploading(true);
    const result = await persistRecording(blob, { mode, projectId, durationMs });
    setUploading(false);
    if (result.ok) {
      setFailed(null);
      onCaptured(result.url, durationMs / 1000);
      return;
    }
    setFailed({ blob, durationMs });
    toast({
      title: t("webcamRecorder.uploadFailedTitle"),
      // `"message" in` narrows without strictNullChecks (off in this tsconfig).
      description: ("message" in result ? result.message : undefined) ?? t("webcamRecorder.uploadFailedDesc"),
      variant: "destructive",
    });
  }

  return (
    <>
      <Suspense
        fallback={
          <div className="py-12 text-center text-sm text-muted-foreground">
            {t("status.loading")}
          </div>
        }
      >
        <WebcamRecorder
          key={mode}
          mode={mode}
          autoStart={autoStart || rearmOnSwap}
          maxDurationSec={maxDurationSec}
          teleprompterText={teleprompterText}
          onRecordingComplete={(blob, durationMs) => void uploadClip(blob, durationMs)}
          onModeChange={handleModeChange}
        />
      </Suspense>
      {uploading && !failed && (
        <p className="mt-2 text-xs text-muted-foreground">{t("webcamRecorder.uploading")}</p>
      )}
      {failed && (
        <UnsavedMediaAlert
          blob={failed.blob}
          filename={recordingFileFromBlob(failed.blob).name}
          message={t("webcamRecorder.notSavedYet")}
          downloadLabel={t("webcamRecorder.downloadClip")}
          busy={uploading}
          onRetry={() => void uploadClip(failed.blob, failed.durationMs)}
          onDiscard={() => setFailed(null)}
        />
      )}
    </>
  );
}
