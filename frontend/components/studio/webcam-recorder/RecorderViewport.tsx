import type { ComponentType, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { FacingMode, RecordingState } from "./types";

interface RecorderViewportProps {
  recordingState: RecordingState;
  isScreenMode: boolean;
  isPipMode: boolean;
  facingMode: FacingMode;
  teleprompterText?: string;
  recordedUrl: string | null;
  audioLevel: number;
  ModeIcon: ComponentType<{ className?: string }>;
  idleHintKey: string;
  videoPreviewRef: RefObject<HTMLVideoElement>;
  pipVideoRef: RefObject<HTMLVideoElement>;
  videoPlaybackRef: RefObject<HTMLVideoElement>;
}

const METER_BARS = 10;

function meterBarClass(index: number, active: boolean): string {
  if (!active) return "bg-white/20";
  if (index >= 8) return "bg-red-500";
  if (index >= 6) return "bg-yellow-500";
  return "bg-green-500";
}

export function RecorderViewport({
  recordingState,
  isScreenMode,
  isPipMode,
  facingMode,
  teleprompterText,
  recordedUrl,
  audioLevel,
  ModeIcon,
  idleHintKey,
  videoPreviewRef,
  pipVideoRef,
  videoPlaybackRef,
}: RecorderViewportProps) {
  const { t } = useTranslation();
  const isLive = recordingState === "previewing" || recordingState === "recording";
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      {/* Live preview */}
      {isLive && (
        <>
          <video
            ref={videoPreviewRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 h-full w-full object-cover",
              !isScreenMode && facingMode === "user" && "-scale-x-100",
            )}
          />

          {/* PiP webcam overlay (screen+webcam mode) */}
          {isPipMode && (
            <video
              ref={pipVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-3 right-3 h-1/4 w-1/4 rounded-lg border-2 border-white/50 object-cover shadow-lg"
            />
          )}

          {/* Teleprompter text overlay */}
          {teleprompterText && (
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3">
              <p className="text-center text-sm leading-relaxed text-white/90">
                {teleprompterText}
              </p>
            </div>
          )}
        </>
      )}

      {/* Playback after recording */}
      {recordingState === "recorded" && recordedUrl && (
        <video
          ref={videoPlaybackRef}
          src={recordedUrl}
          controls
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {/* Idle state */}
      {recordingState === "idle" && (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <ModeIcon className="h-12 w-12" />
          <span className="text-sm">{t(idleHintKey)}</span>
        </div>
      )}

      {/* Audio level meter */}
      {isLive && (
        <div className="absolute bottom-3 left-3 flex h-24 items-end gap-0.5">
          {Array.from({ length: METER_BARS }).map((_, i) => {
            const threshold = (i + 1) / METER_BARS;
            const active = audioLevel >= threshold;
            return (
              <div
                key={i}
                className={cn(
                  "w-1.5 rounded-full transition-all duration-75",
                  meterBarClass(i, active),
                )}
                style={{ height: `${(i + 1) * 10}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
