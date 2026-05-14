/**
 * v2 Design panel — thin layout host that mounts every SHARED design
 * picker so the v2 user has full parity with v1's sidebar surfaces.
 * Every picker rendered here is the SAME component v1 mounts (per the
 * standing DRY rule). Adding a new design dimension is one shared
 * picker + one section here.
 */
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
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";

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

const SECTION_IDS: readonly SectionId[] = [
  "format",
  "themes",
  "backgrounds",
  "palette",
  "fonts",
  "filters",
  "motion",
  "music",
  "export",
];

export default function DesignPanel(props: DesignPanelProps) {
  // Multi-open accordion via the shared hook — every panel in the left
  // rail uses this same primitive so the open/close UX is identical.
  // Default: all sections start CLOSED so the user sees titles first
  // and the panel doesn't dump a huge ladder of controls on them.
  const sections = useCollapsibleSections<SectionId>(SECTION_IDS, {
    defaultClosed: true,
    storageKey: "studio.v2.left.design.sections",
  });
  const activeMusicSelectionId =
    resolveMusic(props.activeMusicSource)?.selectionId ?? null;

  return (
    <LeftPanelScroller>
      <LeftPanelSection
        title="Format"
        open={sections.isOpen("format")}
        onToggle={() => sections.toggle("format")}
      >
        <VideoFormatPicker
          activeFormatId={props.activeFormatId}
          onSelect={props.onSelectFormat}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Visual Themes"
        open={sections.isOpen("themes")}
        onToggle={() => sections.toggle("themes")}
      >
        <VisualThemePicker
          activeThemeId={props.activeThemeId}
          onSelect={props.onSelectTheme}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Backgrounds"
        open={sections.isOpen("backgrounds")}
        onToggle={() => sections.toggle("backgrounds")}
      >
        <BackgroundPicker
          activeBgValue={props.activeSceneBgValue}
          onSelect={props.onSelectBackground}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Palette"
        open={sections.isOpen("palette")}
        onToggle={() => sections.toggle("palette")}
      >
        <ColorPalettePicker
          palette={props.activePalette}
          onChange={props.onChangePalette}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Fonts"
        open={sections.isOpen("fonts")}
        onToggle={() => sections.toggle("fonts")}
      >
        <FontPicker
          activeFontId={props.activeFontId}
          onSelect={props.onSelectFont}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Filters"
        open={sections.isOpen("filters")}
        onToggle={() => sections.toggle("filters")}
      >
        <FiltersPicker
          filters={props.activeFilters}
          onChange={props.onChangeFilters}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Motion"
        open={sections.isOpen("motion")}
        onToggle={() => sections.toggle("motion")}
      >
        <MotionTransitionPicker
          activeMotion={props.activeMotion}
          activeTransition={props.activeTransition}
          onSelectMotion={props.onSelectMotion}
          onSelectTransition={props.onSelectTransition}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Music"
        open={sections.isOpen("music")}
        onToggle={() => sections.toggle("music")}
      >
        <MusicPicker
          activeSelectionId={activeMusicSelectionId}
          onSelect={props.onSelectMusic}
        />
      </LeftPanelSection>

      <LeftPanelSection
        title="Export"
        open={sections.isOpen("export")}
        onToggle={() => sections.toggle("export")}
      >
        <CodecPicker
          activeCodecId={props.activeCodecId}
          onSelect={props.onSelectCodec}
        />
      </LeftPanelSection>
    </LeftPanelScroller>
  );
}
