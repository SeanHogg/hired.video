// StudioSettings.tsx — AI settings + Video settings sections, styled to match
// the left sidebar (collapsible accordion sections used inside StudioSidebar).

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Sparkles, Film } from "lucide-react";
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
import { apiClient } from "@/lib/api-client";

interface ModelEntry {
  id: string;
  label: string;
  tier: "free" | "paid";
  context: number;
}

// Static fallback in case the API call fails
const FALLBACK_MODELS: ModelEntry[] = [
  { id: "qwen/qwen3.6-plus:free", label: "Qwen 3.6 Plus", tier: "free", context: 1_000_000 },
  { id: "openrouter/free", label: "Auto (best available)", tier: "free", context: 200_000 },
];

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
  return { ai: false, video: false };
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
  const [models, setModels] = useState<ModelEntry[]>(FALLBACK_MODELS);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_PREFS_KEY, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  useEffect(() => {
    apiClient.get("/api/ai/models")
      .then((res: any) => {
        const data = res?.data ?? res;
        if (Array.isArray(data) && data.length > 0) setModels(data);
      })
      .catch(() => { /* use fallback */ });
  }, []);

  function toggle(key: string) {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  }

  return (
    <>
      <Section id="ai" title="AI" icon={Sparkles} collapsed={!!collapsed.ai} onToggle={() => toggle("ai")}>
        <div>
          <Label className="mb-1.5 block text-xs">Model</Label>
          <Select
            value={state.model}
            onValueChange={(v) => onStateChange({ model: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label} ({m.tier})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs">Temperature</Label>
            <span className="text-xs text-muted-foreground font-mono">{state.temperature.toFixed(1)}</span>
          </div>
          <Slider
            min={0} max={1} step={0.1}
            value={[state.temperature]}
            onValueChange={([v]) => onStateChange({ temperature: v })}
          />
        </div>
      </Section>

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
              <SelectItem value="4k">4K (3840×2160) — Premium</SelectItem>
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
