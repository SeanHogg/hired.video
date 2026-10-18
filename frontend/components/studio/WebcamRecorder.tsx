"use client";

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Monitor } from "lucide-react";
import { RecordingModeButtons } from "@/components/studio/RecordingModeButtons";
import { recordingModeMeta } from "@/components/studio/webcam-recorder/helpers";
import type { WebcamRecorderProps } from "@/components/studio/webcam-recorder/types";
import { useRecorder } from "@/components/studio/webcam-recorder/useRecorder";
import { RecorderHeader } from "@/components/studio/webcam-recorder/RecorderHeader";
import { RecorderSettingsPanel } from "@/components/studio/webcam-recorder/RecorderSettingsPanel";
import { RecorderViewport } from "@/components/studio/webcam-recorder/RecorderViewport";
import {
  RecorderControls,
  RecorderError,
} from "@/components/studio/webcam-recorder/RecorderControls";

// Public surface kept at this path (tests + lazy imports depend on it).
export { mapMediaAcquisitionError } from "@/components/studio/webcam-recorder/helpers";

/**
 * Webcam / screen / screen+webcam recorder. Container only: session
 * state machine + MediaRecorder lifecycle live in `useRecorder`, stream
 * acquisition in `useMediaDevices`, canvas compositing in
 * `webcam-recorder/compositor`, and the UI in the presentational
 * `Recorder*` components.
 */
export function WebcamRecorder({
  onRecordingComplete,
  teleprompterText,
  mode = "webcam",
  maxDurationSec,
  autoStart = false,
  onModeChange,
}: WebcamRecorderProps) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);

  const recorder = useRecorder({
    mode,
    maxDurationSec,
    autoStart,
    onRecordingComplete,
  });
  const { state, devices, isScreenMode } = recorder;
  const recordingState = state.status;

  // ---- Max duration remaining ----
  const remainingSec = useMemo(() => {
    if (!maxDurationSec) return null;
    return Math.max(0, maxDurationSec - state.elapsedSec);
  }, [maxDurationSec, state.elapsedSec]);

  // Single lookup against RECORDING_MODES so every mode-specific
  // label / hint / button verb stays co-located with the mode table.
  const modeMeta = useMemo(() => recordingModeMeta(mode), [mode]);
  // Header icon — Monitor for any screen-bearing mode, Camera for
  // webcam. The separate iconName on RECORDING_MODES drives the
  // chip-picker icon, which is intentionally finer-grained.
  const ModeHeaderIcon = isScreenMode ? Monitor : Camera;

  return (
    <div className="relative flex flex-col gap-4 rounded-lg border bg-card p-4">
      <RecorderHeader
        ModeIcon={ModeHeaderIcon}
        panelTitleKey={modeMeta.panelTitleKey}
        resolution={devices.resolution}
        recordingState={recordingState}
        isScreenMode={isScreenMode}
        elapsedSec={state.elapsedSec}
        remainingSec={remainingSec}
        isMuted={devices.isMuted}
        onToggleMute={devices.toggleMute}
        onToggleCamera={recorder.toggleCamera}
        onToggleSettings={() => setShowSettings((s) => !s)}
      />

      {/* ---- Source picker (mid-session swap) ---- */}
      {onModeChange &&
        (recordingState === "idle" || recordingState === "previewing") && (
          <div
            role="group"
            aria-label={t("webcamRecorder.sourcePicker")}
            className="flex flex-wrap items-center gap-1.5"
          >
            <RecordingModeButtons size="sm" current={mode} onPick={onModeChange} />
          </div>
        )}

      {showSettings && (
        <RecorderSettingsPanel
          hasCamera={recorder.hasCamera}
          resolution={devices.resolution}
          isRecording={recordingState === "recording"}
          maxDurationSec={maxDurationSec}
          bgReplacement={devices.bgReplacement}
          onChangeResolution={recorder.changeResolution}
          onChangeBackground={devices.setBgReplacement}
        />
      )}

      {state.error && (
        <RecorderError
          error={state.error}
          canRetry={recordingState === "idle"}
          onRetry={recorder.startPreview}
        />
      )}

      <RecorderViewport
        recordingState={recordingState}
        isScreenMode={isScreenMode}
        isPipMode={recorder.isPipMode}
        facingMode={devices.facingMode}
        teleprompterText={teleprompterText}
        recordedUrl={state.recordedUrl}
        audioLevel={recorder.audioLevel}
        ModeIcon={ModeHeaderIcon}
        idleHintKey={modeMeta.idleHintKey}
        videoPreviewRef={recorder.videoPreviewRef}
        pipVideoRef={recorder.pipVideoRef}
        videoPlaybackRef={recorder.videoPlaybackRef}
      />

      <RecorderControls
        recordingState={recordingState}
        isScreenMode={isScreenMode}
        ModeIcon={ModeHeaderIcon}
        startVerbKey={modeMeta.startVerbKey}
        cancelPreviewLabelKey={modeMeta.cancelPreviewLabelKey}
        onStartPreview={recorder.startPreview}
        onStopSharing={recorder.stopSharing}
        onStartRecording={recorder.startRecording}
        onStopRecording={recorder.stopRecording}
        onRetake={recorder.retake}
      />
    </div>
  );
}
