// StoryboardEditor.tsx — editable scene cards backed by VideoScript.scenes.
// Any edit triggers onScriptChange which the parent recompiles immediately.

import { Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { VideoScript, SceneScript, SceneType } from "@/types/video-script";

interface Props {
  script: VideoScript;
  onScriptChange: (s: VideoScript) => void;
  focusedSceneId?: string;
  onSceneFocus?: (id: string) => void;
}

const TYPE_COLOURS: Record<SceneType, string> = {
  intro:       "bg-violet-500/20 text-violet-300",
  achievement: "bg-blue-500/20 text-blue-300",
  skills:      "bg-emerald-500/20 text-emerald-300",
  closing:     "bg-amber-500/20 text-amber-300",
};

function SceneCard({
  scene,
  focused,
  onChange,
  onFocus,
}: {
  scene: SceneScript;
  focused: boolean;
  onChange: (patch: Partial<SceneScript>) => void;
  onFocus: () => void;
}) {
  const skills = scene.skills?.join(", ") ?? "";
  const items  = scene.items?.join("\n")  ?? "";
  const textVal = Array.isArray(scene.text) ? scene.text.join("\n") : (scene.text ?? "");

  return (
    <div
      className={`rounded-lg border bg-card p-4 flex flex-col gap-3 cursor-pointer transition-all ${
        focused ? "border-primary shadow-sm shadow-primary/20" : "border-border hover:border-muted-foreground/40"
      }`}
      onClick={onFocus}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <Badge className={`text-xs capitalize ${TYPE_COLOURS[scene.type]}`}>{scene.type}</Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            className="p-0.5 hover:text-foreground rounded"
            onClick={(e) => { e.stopPropagation(); onChange({ duration: Math.max(3, scene.duration - 1) }); }}
          ><Minus className="w-3 h-3" /></button>
          <span className="w-6 text-center font-mono">{scene.duration}s</span>
          <button
            type="button"
            className="p-0.5 hover:text-foreground rounded"
            onClick={(e) => { e.stopPropagation(); onChange({ duration: Math.min(30, scene.duration + 1) }); }}
          ><Plus className="w-3 h-3" /></button>
        </div>
      </div>

      {/* Title */}
      <Input
        className="h-8 text-sm font-medium"
        placeholder="Title"
        value={scene.title ?? ""}
        onChange={(e) => onChange({ title: e.target.value })}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Subtitle */}
      {(scene.type === "intro" || scene.type === "closing") && (
        <Input
          className="h-7 text-xs"
          placeholder="Subtitle"
          value={scene.subtitle ?? ""}
          onChange={(e) => onChange({ subtitle: e.target.value })}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Items (achievement) */}
      {scene.type === "achievement" && (
        <Textarea
          className="text-xs h-20 resize-none"
          placeholder="One achievement per line"
          value={items}
          onChange={(e) => onChange({ items: e.target.value.split("\n").filter(Boolean) })}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Skills */}
      {scene.type === "skills" && (
        <Input
          className="h-7 text-xs"
          placeholder="React, TypeScript, Node.js, …"
          value={skills}
          onChange={(e) => onChange({ skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Text / body (all types) */}
      {(scene.type !== "achievement" && scene.type !== "skills") && textVal !== undefined && (
        <Textarea
          className="text-xs h-14 resize-none"
          placeholder="Body text (optional)"
          value={textVal}
          onChange={(e) => onChange({ text: e.target.value })}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export default function StoryboardEditor({ script, onScriptChange, focusedSceneId, onSceneFocus }: Props) {
  function patchScene(index: number, patch: Partial<SceneScript>) {
    const scenes = [...script.scenes];
    scenes[index] = { ...scenes[index], ...patch };

    // Recalculate start times after duration change
    let cursor = 0;
    const restarted = scenes.map((s) => {
      const out = { ...s, start: cursor };
      cursor += s.duration;
      return out;
    });

    onScriptChange({
      ...script,
      video: { ...script.video, duration: cursor },
      scenes: restarted,
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-5">
      {script.scenes.map((scene, i) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          focused={focusedSceneId === scene.id}
          onChange={(patch) => patchScene(i, patch)}
          onFocus={() => onSceneFocus?.(scene.id)}
        />
      ))}
    </div>
  );
}
