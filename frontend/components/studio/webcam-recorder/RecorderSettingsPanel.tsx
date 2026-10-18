import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { BackgroundReplacement } from "@/lib/studio/webcam/background-removal";
import { WebcamBackgroundControls } from "@/components/studio/WebcamBackgroundControls";
import { formatTime } from "./helpers";
import { RESOLUTIONS, type Resolution } from "./types";

interface RecorderSettingsPanelProps {
  hasCamera: boolean;
  resolution: Resolution;
  isRecording: boolean;
  maxDurationSec?: number;
  bgReplacement: BackgroundReplacement;
  onChangeResolution: (res: Resolution) => void;
  onChangeBackground: (value: BackgroundReplacement) => void;
}

export function RecorderSettingsPanel({
  hasCamera,
  resolution,
  isRecording,
  maxDurationSec,
  bgReplacement,
  onChangeResolution,
  onChangeBackground,
}: RecorderSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/50 px-4 py-3">
      {hasCamera && (
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("webcamRecorder.resolution")}
        </span>
        <div className="flex gap-1">
          {RESOLUTIONS.map((r) => (
            <Button
              key={r}
              variant={resolution === r ? "default" : "outline"}
              size="sm"
              disabled={isRecording}
              onClick={() => onChangeResolution(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>
      )}

      {maxDurationSec && (
        <div className="text-xs text-muted-foreground">
          {t("webcamRecorder.maxDuration", { time: formatTime(maxDurationSec) })}
        </div>
      )}

      {/* #127 — Background replacement picker. Segmentation needs a
          person, so it's only shown for camera-bearing modes (webcam +
          screen+webcam PiP), never screen-only. Selecting blur/colour/
          image routes frames through the canvas compositor (see
          ./compositor); MediaPipe segmentation loads lazily on the first
          non-none selection. Blur strength, custom colour and image
          upload: #1787. */}
      {hasCamera && (
        <WebcamBackgroundControls
          value={bgReplacement}
          onChange={onChangeBackground}
          disabled={isRecording}
        />
      )}
    </div>
  );
}
