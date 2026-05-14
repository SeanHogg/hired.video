/**
 * v2 Design panel — mounts the SHARED VisualThemePicker /
 * BackgroundPicker / MusicPicker components in the editor's left rail
 * so the v2 user has parity with the v1 sidebar.
 *
 * Per the standing DRY rule: this is a thin layout host, not a fork of
 * the picker logic. The actual picker UIs live in
 * `components/studio/shared/` and are reused by the v1 sidebar.
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
import type { VisualTheme, BgPreset } from "@/lib/studio/visual-themes";
import type { MusicTrack } from "@/lib/studio/music-catalog";

export interface DesignPanelProps {
  activeThemeId: string | null;
  activeSceneBgValue: string | null;
  activeMusicTrackId: string | null;
  onSelectTheme: (theme: VisualTheme) => void;
  onSelectBackground: (preset: BgPreset) => void;
  onSelectMusic: (track: MusicTrack) => void;
}

export default function DesignPanel({
  activeThemeId,
  activeSceneBgValue,
  activeMusicTrackId,
  onSelectTheme,
  onSelectBackground,
  onSelectMusic,
}: DesignPanelProps) {
  const [openSection, setOpenSection] = useState<"themes" | "backgrounds" | "music">(
    "themes",
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section
        title="Visual Themes"
        open={openSection === "themes"}
        onToggle={() => setOpenSection("themes")}
      >
        <VisualThemePicker activeThemeId={activeThemeId} onSelect={onSelectTheme} />
      </Section>
      <Section
        title="Backgrounds"
        open={openSection === "backgrounds"}
        onToggle={() => setOpenSection("backgrounds")}
      >
        <BackgroundPicker
          activeBgValue={activeSceneBgValue}
          onSelect={onSelectBackground}
        />
      </Section>
      <Section
        title="Music"
        open={openSection === "music"}
        onToggle={() => setOpenSection("music")}
      >
        <MusicPicker activeTrackId={activeMusicTrackId} onSelect={onSelectMusic} />
      </Section>
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}
