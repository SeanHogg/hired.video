// StudioSettings.tsx — Video settings, styled to match the left sidebar
// (collapsible accordion sections used inside StudioSidebar).
//
// Note: there is intentionally NO AI / LLM section here. End users (free
// or paid) never see or configure which model serves their requests, nor
// any sampling knob like temperature — the backend's use-case-driven
// facade picks both the model and the inference profile per action. The
// "secret sauce" lives in USE_CASE_PROFILES on the server. Vendor and
// profile visibility are SuperAdmin-only.

import { useState, useEffect } from "react";
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

interface Props {
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
}

const SETTINGS_PREFS_KEY = "studio_sidebar_settings_collapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SETTINGS_PREFS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {}
  return { video: false };
}

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_PREFS_KEY, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  function toggle(key: string) {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  }

  return (
    <>
      <Section id="video" title="Video" icon={Film} collapsed={!!collapsed.video} onToggle={() => toggle("video")}>
        <div>
          <Label className="mb-1.5 block text-xs">Resolution</Label>
          <Select
            value={state.resolution}
            onValueChange={(v) => onStateChange({ resolution: v as "720p" | "1080p" | "4k" })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="720p">720p (faster)</SelectItem>
              <SelectItem value="1080p">1080p (HD)</SelectItem>
              <SelectItem value="4k">4K (3840×2160) — {TIER_COPY.qualityProSuffix()}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs">Aspect Ratio</Label>
          <Select
            value={state.aspectRatio}
            onValueChange={(v) => onStateChange({ aspectRatio: v as StudioProjectState["aspectRatio"] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9 — Landscape (YouTube / LinkedIn)</SelectItem>
              <SelectItem value="9:16">9:16 — Portrait (TikTok / Reels / Shorts)</SelectItem>
              <SelectItem value="1:1">1:1 — Square (Instagram)</SelectItem>
              <SelectItem value="4:3">4:3 — Classic</SelectItem>
            </SelectContent>
          </Select>
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
