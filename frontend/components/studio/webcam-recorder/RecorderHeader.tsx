import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, RotateCcw, Settings } from "lucide-react";
import { formatTime } from "./helpers";
import type { RecordingState, Resolution } from "./types";

interface RecorderHeaderProps {
  ModeIcon: ComponentType<{ className?: string }>;
  panelTitleKey: string;
  resolution: Resolution;
  recordingState: RecordingState;
  isScreenMode: boolean;
  elapsedSec: number;
  remainingSec: number | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleSettings: () => void;
}

export function RecorderHeader({
  ModeIcon,
  panelTitleKey,
  resolution,
  recordingState,
  isScreenMode,
  elapsedSec,
  remainingSec,
  isMuted,
  onToggleMute,
  onToggleCamera,
  onToggleSettings,
}: RecorderHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <ModeIcon className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">{t(panelTitleKey)}</span>
        <Badge variant="secondary">{resolution}</Badge>
        {/* Sharing-screen indicator — without this the only sign
            that the screen capture was live was the browser's own
            tray, which is easy to miss on a multi-monitor setup.
            Visible in BOTH preview and recording so users see the
            share is hot even before they hit Record. */}
        {isScreenMode &&
          (recordingState === "previewing" || recordingState === "recording") && (
            <Badge className="gap-1.5 bg-red-500/90 text-white hover:bg-red-500/90">
              <span className="h-2 w-2 animate-pulse rounded-full bg-card" />
              {t("webcamRecorder.sharingScreen")}
            </Badge>
          )}
        {recordingState === "recording" && (
          <Badge variant="destructive" className="animate-pulse">
            {t("webcamRecorder.recBadge", { time: formatTime(elapsedSec) })}
          </Badge>
        )}
        {recordingState === "recording" && remainingSec !== null && (
          <Badge variant="outline" className="text-muted-foreground">
            {t("webcamRecorder.timeLeft", { time: formatTime(remainingSec) })}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Mute */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMute}
          aria-label={
            isMuted
              ? t("webcamRecorder.unmuteMicrophone")
              : t("webcamRecorder.muteMicrophone")
          }
        >
          {isMuted ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        {/* Camera flip (only webcam modes, and when not recording) */}
        {!isScreenMode && recordingState !== "recording" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCamera}
            aria-label={t("webcamRecorder.switchCamera")}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSettings}
          aria-label={t("headings.settings")}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
