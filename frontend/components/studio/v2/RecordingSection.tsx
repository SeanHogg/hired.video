/**
 * Actions panel › "Recording & Audio" section. The recording-source row
 * is the shared `RecordingModeButtons` chooser (labels from
 * RECORDING_MODES); picking a mode opens the recorder sheet armed in it
 * via the single RecordingMode → ActionId mapping. Voiceover and Original
 * Music stay as regular tiles.
 */
import { useTranslation } from "react-i18next";
import { Mic, Music } from "lucide-react";
import type { ActionId } from "@/lib/studio/editor-v2/editor-types";
import {
  RECORDING_MODE_ACTION,
  recordingModeForAction,
} from "@/lib/studio/recording-modes";
import { RecordingModeButtons } from "@/components/studio/RecordingModeButtons";
import { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";

export interface RecordingSectionProps {
  open: boolean;
  onToggle: () => void;
  /** The Actions panel's currently open sheet — highlights the active
   *  recording source while its recorder is open. */
  openAction: ActionId | null;
  onOpenAction: (id: ActionId) => void;
}

export default function RecordingSection({
  open,
  onToggle,
  openAction,
  onOpenAction,
}: RecordingSectionProps) {
  const { t } = useTranslation();
  return (
    <LeftPanelSection
      title={t("studio.actions.recordingAudio")}
      open={open}
      onToggle={onToggle}
      contentClassName="grid grid-cols-2 gap-2"
    >
      <div className="col-span-2 flex flex-wrap gap-2">
        <RecordingModeButtons
          size="lg"
          current={recordingModeForAction(openAction)}
          onPick={(mode) => onOpenAction(RECORDING_MODE_ACTION[mode])}
        />
      </div>
      <LeftPanelTile
        label={t("studio.actions.voiceover")}
        icon={Mic}
        onClick={() => onOpenAction("voiceover")}
      />
      <LeftPanelTile
        label={t("studio.actions.originalMusic")}
        icon={Music}
        onClick={() => onOpenAction("original-music")}
      />
    </LeftPanelSection>
  );
}
