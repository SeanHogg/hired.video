/**
 * v2 Design panel — mounts the SHARED VisualThemePicker /
 * BackgroundPicker / MusicPicker components in the editor's left rail
 * so the v2 user has parity with the v1 sidebar.
 *
 * Per the standing DRY rule: this is a thin layout host, not a fork of
 * the picker logic. The actual picker UIs live in
 * `components/studio/shared/` and are reused by the v1 sidebar. The
 * accordion chrome comes from the shared LeftPanelSection primitive so
 * Widgets / Design / Actions all share pixel-identical section styling.
 *
 * Apply rules:
 *   - Theme  → mutates every scene's backgroundColor + heading colour
 *     based on the theme's colour triple. Active theme persists locally
 *     so the picker reflects the current selection.
 *   - Background → mutates ONLY the active scene's backgroundColor.
 *   - Music → adds the track as a clip on the timeline's A1 audio
 *     track (the v2 timeline emit currently leaves audio tracks empty;
 *     the music selection is captured here and forwarded to the parent
 *     so it can either patch CanvasState OR enqueue the audio at
 *     render time).
 */
import { useState } from "react";
import VisualThemePicker from "@/components/studio/shared/VisualThemePicker";
import BackgroundPicker from "@/components/studio/shared/BackgroundPicker";
import MusicPicker from "@/components/studio/shared/MusicPicker";
import VideoFormatPicker from "@/components/studio/shared/VideoFormatPicker";
import type { VisualTheme, BgPreset } from "@/lib/studio/visual-themes";
import {
  resolveMusic,
  type MusicSource,
  type MusicTrack,
} from "@/lib/studio/music-catalog";
import type { VideoFormat } from "@/lib/studio/video-formats";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";

export interface DesignPanelProps {
  activeThemeId: string | null;
  activeSceneBgValue: string | null;
  activeMusicSource: MusicSource | null;
  activeFormatId: string | null;
  onSelectTheme: (theme: VisualTheme) => void;
  onSelectBackground: (preset: BgPreset) => void;
  onSelectMusic: (track: MusicTrack) => void;
  onSelectFormat: (format: VideoFormat) => void;
}

export default function DesignPanel({
  activeThemeId,
  activeSceneBgValue,
  activeMusicSource,
  activeFormatId,
  onSelectTheme,
  onSelectBackground,
  onSelectMusic,
  onSelectFormat,
}: DesignPanelProps) {
  const activeMusicSelectionId = resolveMusic(activeMusicSource)?.selectionId ?? null;
  const [openSection, setOpenSection] = useState<
    "format" | "themes" | "backgrounds" | "music"
  >("format");

  return (
    <LeftPanelScroller>
      <LeftPanelSection
        title="Format"
        open={openSection === "format"}
        onToggle={() => setOpenSection("format")}
      >
        <VideoFormatPicker
          activeFormatId={activeFormatId}
          onSelect={onSelectFormat}
        />
      </LeftPanelSection>
      <LeftPanelSection
        title="Visual Themes"
        open={openSection === "themes"}
        onToggle={() => setOpenSection("themes")}
      >
        <VisualThemePicker activeThemeId={activeThemeId} onSelect={onSelectTheme} />
      </LeftPanelSection>
      <LeftPanelSection
        title="Backgrounds"
        open={openSection === "backgrounds"}
        onToggle={() => setOpenSection("backgrounds")}
      >
        <BackgroundPicker
          activeBgValue={activeSceneBgValue}
          onSelect={onSelectBackground}
        />
      </LeftPanelSection>
      <LeftPanelSection
        title="Music"
        open={openSection === "music"}
        onToggle={() => setOpenSection("music")}
      >
        <MusicPicker
          activeSelectionId={activeMusicSelectionId}
          onSelect={onSelectMusic}
        />
      </LeftPanelSection>
    </LeftPanelScroller>
  );
}
