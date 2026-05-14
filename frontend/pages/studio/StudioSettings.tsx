// StudioSettings.tsx — Video settings, styled to match the left sidebar
// (collapsible accordion sections used inside StudioSidebar).
//
// Note: there is intentionally NO AI / LLM section here. End users (free
// or paid) never see or configure which model serves their requests, nor
// any sampling knob like temperature — the backend's use-case-driven
// facade picks both the model and the inference profile per action. The
// "secret sauce" lives in USE_CASE_PROFILES on the server. Vendor and
// profile visibility are SuperAdmin-only.

import { ChevronDown, ChevronRight, Film } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StudioProjectState } from "@/types/studio";
import { TIER_COPY } from "@shared/tier-copy";
import { usePersistentState } from "@/hooks/use-persistent-state";
import VideoFormatPicker from "@/components/studio/shared/VideoFormatPicker";
import { findFormatByEnums } from "@/lib/studio/video-formats";

interface Props {
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
}

const SETTINGS_COLLAPSED_DEFAULTS: Record<string, boolean> = { video: false };

interface SectionProps {
  id: string;
  title: string;
  icon: React.ElementType;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ title, icon: Icon, collapsed, onToggle, children }: SectionProps) {
  return (
    <section className="px-3 pb-3 border-t pt-3">
      <button
        type="button"
        className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
        onClick={onToggle}
      >
        <Icon className="w-3 h-3" /> <span className="flex-1 text-left">{title}</span>
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {!collapsed && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}

export default function StudioSettings({ state, onStateChange }: Props) {
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>("studio_sidebar_settings_collapsed", SETTINGS_COLLAPSED_DEFAULTS);

  function toggle(key: string) {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  }

  return (
    <>
      <Section id="video" title="Video" icon={Film} collapsed={!!collapsed.video} onToggle={() => toggle("video")}>
        {/* Shared VideoFormatPicker — same component v2's DesignPanel
            mounts. Picking a preset writes BOTH `resolution` and
            `aspectRatio` enums so the rest of v1's render pipeline keeps
            its existing shape. Single source of truth: the catalog in
            `lib/studio/video-formats.ts`. */}
        <div>
          <Label className="mb-1.5 block text-xs">Format</Label>
          <VideoFormatPicker
            activeFormatId={
              findFormatByEnums(state.aspectRatio, state.resolution)?.id ?? null
            }
            onSelect={(format) =>
              onStateChange({
                aspectRatio: format.aspect,
                resolution: format.resolution,
              })
            }
          />
        </div>

        <div>
          <Label className="mb-1.5 block text-xs">Codec</Label>
          <Select
            value={state.codec ?? "h264"}
            onValueChange={(v) => onStateChange(codecPreset(v as NonNullable<StudioProjectState["codec"]>))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="h264">H.264 (MP4) — fast, universal</SelectItem>
              <SelectItem value="h265">H.265 / HEVC (MP4) — {TIER_COPY.qualityProSuffix()}</SelectItem>
              <SelectItem value="prores">ProRes 422 (MOV) — {TIER_COPY.qualityProSuffix()}</SelectItem>
              <SelectItem value="dnxhd">DNxHD (MOV) — {TIER_COPY.qualityProSuffix()}</SelectItem>
              <SelectItem value="vp9">VP9 (WebM) — {TIER_COPY.qualityProSuffix()}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground mt-1">
            H.264 renders in-browser fast. Other codecs use the higher-quality
            ffmpeg pipeline.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs">Duration</Label>
            <span className="text-xs text-muted-foreground font-mono">{state.targetDuration}s</span>
          </div>
          <Slider
            min={10} max={120} step={5}
            value={[state.targetDuration]}
            onValueChange={([v]) => onStateChange({ targetDuration: v })}
          />
        </div>

        <div>
          <Label className="mb-1.5 block text-xs">Motion Style</Label>
          <Select
            value={state.motion}
            onValueChange={(v) => onStateChange({ motion: v as StudioProjectState["motion"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimal — clean, subtle</SelectItem>
              <SelectItem value="moderate">Moderate — balanced</SelectItem>
              <SelectItem value="cinematic">Cinematic — bold, dramatic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>
    </>
  );
}

/**
 * Codec presets — single source of truth for "which codec implies
 * which container + audio codec." The picker writes via this helper
 * so the three fields stay coherent (e.g. ProRes → MOV + PCM, never
 * ProRes + MP4). Adding a codec here is one entry; the picker and the
 * exporter both pick it up.
 */
function codecPreset(
  codec: NonNullable<StudioProjectState["codec"]>,
): Pick<StudioProjectState, "codec" | "container" | "audioCodec"> {
  switch (codec) {
    case "h264":  return { codec, container: "mp4",  audioCodec: "aac" };
    case "h265":  return { codec, container: "mp4",  audioCodec: "aac" };
    case "prores":return { codec, container: "mov",  audioCodec: "pcm" };
    case "dnxhd": return { codec, container: "mov",  audioCodec: "pcm" };
    case "vp9":   return { codec, container: "webm", audioCodec: "opus" };
  }
}
