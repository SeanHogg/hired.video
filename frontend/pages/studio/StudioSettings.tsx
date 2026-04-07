// StudioSettings.tsx — AI settings + Video settings accordions.

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 pb-4 flex flex-col gap-4">{children}</div>}
    </div>
  );
}

export default function StudioSettings({ state, onStateChange }: Props) {
  const [models, setModels] = useState<ModelEntry[]>(FALLBACK_MODELS);

  useEffect(() => {
    apiClient.get("/api/ai/models")
      .then((res: any) => {
        const data = res?.data ?? res;
        if (Array.isArray(data) && data.length > 0) setModels(data);
      })
      .catch(() => { /* use fallback */ });
  }, []);

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b">
        <p className="text-sm font-semibold">Settings</p>
      </div>

      <Section title="AI">
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

      <Section title="Video">
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
    </div>
  );
}
