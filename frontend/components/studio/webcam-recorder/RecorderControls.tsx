import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RotateCcw, StopCircle, Video, X } from "lucide-react";
import type { RecordingState } from "./types";

interface RecorderErrorProps {
  error: string;
  canRetry: boolean;
  onRetry: () => void;
}

/** Retry button covers the cancelled-screen-picker case (gap #490):
 *  NotAllowedError comes from getDisplayMedia when the user dismisses
 *  the picker, which leaves the panel idle with no obvious way to
 *  re-arm without a second click on the section button. */
export function RecorderError({ error, canRetry, onRetry }: RecorderErrorProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <span>{error}</span>
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
        >
          {t("actions.tryAgain")}
        </Button>
      )}
    </div>
  );
}

interface RecorderControlsProps {
  recordingState: RecordingState;
  isScreenMode: boolean;
  ModeIcon: ComponentType<{ className?: string }>;
  startVerbKey: string;
  cancelPreviewLabelKey: string;
  onStartPreview: () => void;
  onStopSharing: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRetake: () => void;
}

export function RecorderControls({
  recordingState,
  isScreenMode,
  ModeIcon,
  startVerbKey,
  cancelPreviewLabelKey,
  onStartPreview,
  onStopSharing,
  onStartRecording,
  onStopRecording,
  onRetake,
}: RecorderControlsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3">
      {recordingState === "idle" && (
        <Button onClick={onStartPreview} className="gap-2">
          <ModeIcon className="h-4 w-4" />
          {t(startVerbKey)}
        </Button>
      )}

      {recordingState === "previewing" && (
        <>
          {/* Cancel out of preview without recording. For screen
              modes this label is "Stop sharing" — the same words
              the browser tray uses, so users know exactly what
              they're releasing. */}
          <Button
            onClick={onStopSharing}
            variant="outline"
            className="gap-2"
            aria-label={t(cancelPreviewLabelKey)}
          >
            {isScreenMode ? (
              <StopCircle className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {t(cancelPreviewLabelKey)}
          </Button>
          <Button
            onClick={onStartRecording}
            variant="destructive"
            className="gap-2"
          >
            <Video className="h-4 w-4" />
            {t("actions.record")}
          </Button>
        </>
      )}

      {recordingState === "recording" && (
        <Button
          onClick={onStopRecording}
          variant="destructive"
          className="gap-2"
        >
          <StopCircle className="h-4 w-4" />
          {t("actions.stopRecording")}
        </Button>
      )}

      {recordingState === "recorded" && (
        <Button onClick={onRetake} variant="outline" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          {t("actions.retake")}
        </Button>
      )}
    </div>
  );
}
