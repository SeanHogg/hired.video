/**
 * v2 Design panel — thin layout host that mounts every SHARED design
 * picker so the v2 user has full parity with v1's sidebar surfaces.
 * Every picker rendered here is the SAME component v1 mounts (per the
 * standing DRY rule). Adding a new design dimension is one shared
 * picker + one section here.
 */
import { useState } from "react";
import VisualThemePicker from "@/components/studio/shared/VisualThemePicker";
import BackgroundPicker from "@/components/studio/shared/BackgroundPicker";
import MusicPicker from "@/components/studio/shared/MusicPicker";
import VideoFormatPicker from "@/components/studio/shared/VideoFormatPicker";
import CodecPicker from "@/components/studio/shared/CodecPicker";
import MotionTransitionPicker from "@/components/studio/shared/MotionTransitionPicker";
import FiltersPicker from "@/components/studio/shared/FiltersPicker";
import FontPicker from "@/components/studio/shared/FontPicker";
import ColorPalettePicker, {
  type ColorPalette,
} from "@/components/studio/shared/ColorPalettePicker";
import type { VisualTheme, BgPreset } from "@/lib/studio/visual-themes";
import {
  resolveMusic,
  type MusicSource,
  type MusicTrack,
} from "@/lib/studio/music-catalog";
import type { VideoFormat } from "@/lib/studio/video-formats";
import type { CodecPreset } from "@/lib/studio/codec-presets";
import type {
  MotionPreset,
  TransitionPreset,
} from "@/lib/studio/motion-presets";
import type { VideoFilters } from "@/lib/studio/video-filters";
import type { FontPreset } from "@/lib/studio/font-catalog";
import LeftPanelScroller, { LeftPanelSection } from "./LeftPanelScroller";

type SectionId =
  | "format"
  | "themes"
  | "backgrounds"
  | "palette"
  | "fonts"
  | "filters"
  | "motion"
  | "music"
  | "export";

export interface DesignPanelProps {
  activeThemeId: string | null;
  activeSceneBgValue: string | null;
  activeMusicSource: MusicSource | null;
  activeFormatId: string | null;
  activeCodecId: CodecPreset["id"] | null;
  activeMotion: MotionPreset["id"] | null;
  activeTransition: TransitionPreset["id"] | null;
  activeFontId: string | null;
  activeFilters: VideoFilters | null;
  activePalette: ColorPalette | null;
  onSelectTheme: (theme: VisualTheme) => void;
  onSelectBackground: (preset: BgPreset) => void;
  onSelectMusic: (track: MusicTrack) => void;
  onSelectFormat: (format: VideoFormat) => void;
  onSelectCodec: (preset: CodecPreset) => void;
  onSelectMotion: (preset: MotionPreset) => void;
  onSelectTransition: (preset: TransitionPreset) => void;
  onSelectFont: (preset: FontPreset) => void;
  onChangeFilters: (filters: VideoFilters) => void;
  onChangePalette: (palette: ColorPalette) => void;
}

export default function DesignPanel(props: DesignPanelProps) {
  const [openSection, setOpenSection] = useState<SectionId>("format");
  const activeMusicSelectionId =
    resolveMusic(props.activeMusicSource)?.selectionId ?? null;
  const toggle = (id: SectionId) => () =>
    setOpenSection((cur) => (cur === id ? id : id));

  return (
    <LeftPanelScroller>
      <LeftPanelSection title="Format" open={openSection === "format"} onToggle={toggle("format")}>
        <VideoFormatPicker
          activeFormatId={props.activeFormatId}
          onSelect={props.onSelectFormat}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Visual Themes" open={openSection === "themes"} onToggle={toggle("themes")}>
        <VisualThemePicker
          activeThemeId={props.activeThemeId}
          onSelect={props.onSelectTheme}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Backgrounds" open={openSection === "backgrounds"} onToggle={toggle("backgrounds")}>
        <BackgroundPicker
          activeBgValue={props.activeSceneBgValue}
          onSelect={props.onSelectBackground}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Palette" open={openSection === "palette"} onToggle={toggle("palette")}>
        <ColorPalettePicker
          palette={props.activePalette}
          onChange={props.onChangePalette}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Fonts" open={openSection === "fonts"} onToggle={toggle("fonts")}>
        <FontPicker
          activeFontId={props.activeFontId}
          onSelect={props.onSelectFont}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Filters" open={openSection === "filters"} onToggle={toggle("filters")}>
        <FiltersPicker
          filters={props.activeFilters}
          onChange={props.onChangeFilters}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Motion" open={openSection === "motion"} onToggle={toggle("motion")}>
        <MotionTransitionPicker
          activeMotion={props.activeMotion}
          activeTransition={props.activeTransition}
          onSelectMotion={props.onSelectMotion}
          onSelectTransition={props.onSelectTransition}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Music" open={openSection === "music"} onToggle={toggle("music")}>
        <MusicPicker
          activeSelectionId={activeMusicSelectionId}
          onSelect={props.onSelectMusic}
        />
      </LeftPanelSection>

      <LeftPanelSection title="Export" open={openSection === "export"} onToggle={toggle("export")}>
        <CodecPicker
          activeCodecId={props.activeCodecId}
          onSelect={props.onSelectCodec}
        />
      </LeftPanelSection>
    </LeftPanelScroller>
  );
}
