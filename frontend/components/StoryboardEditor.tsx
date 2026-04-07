// StoryboardEditor.tsx — editable scene cards backed by VideoScript.scenes.
// Any edit triggers onScriptChange which the parent recompiles immediately.

import { useState, useRef } from "react";
import { Minus, Plus, Trash2, ChevronUp, ChevronDown, Sparkles, Loader2, ImagePlus, Music } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import type { VideoScript, SceneScript, SceneType, ImageElement } from "@/types/video-script";
import { studioService } from "@/lib/services/studio-service";
import SceneElementsGallery from "@/components/studio/SceneElementsGallery";

interface Props {
  script: VideoScript;
  onScriptChange: (s: VideoScript) => void;
  focusedSceneId?: string;
  onSceneFocus?: (id: string) => void;
  /** Element selected on the canvas — opens the matching scene's element editor. */
  selectedElementId?: string | null;
  onSelectedElementChange?: (id: string | null) => void;
}

// ─── AI image prompt presets ────────────────────────────────────────────────

const SCENE_IMAGE_BASE: Record<SceneType, string> = {
  intro: "Professional portrait background, modern office environment, soft directional lighting, cinematic depth of field",
  achievement: "Abstract success visualization, upward trending graphs, glowing data, premium dark background",
  skills: "Futuristic technology, flowing circuit patterns, vibrant gradient, high-tech workspace",
  closing: "Bright sunrise cityscape, optimistic career horizon, warm golden hour, inspirational vista",
  "job-details": "Modern office workspace, job posting on screen, professional environment, clean design",
  "company-culture": "Collaborative team workspace, diverse people, vibrant office, energetic atmosphere",
  cta: "Bold call-to-action, bright highlight, directional arrow, premium gradient background",
  testimonial: "Warm portrait, quotation marks, soft professional lighting, trust and credibility",
  "product-feature": "Product showcase, clean modern display, feature highlight, tech-forward design",
  "brand-story": "Storytelling visual, personal journey, warm tones, cinematic narrative feel",
  requirements: "Checklist visualization, organized requirements, structured layout, professional clarity",
  benefits: "Uplifting benefit icons, positive growth, bright optimistic palette, rewarding atmosphere",
};

const TYPE_COLOURS: Record<SceneType, string> = {
  intro:              "bg-violet-500/20 text-violet-300",
  achievement:        "bg-blue-500/20 text-blue-300",
  skills:             "bg-emerald-500/20 text-emerald-300",
  closing:            "bg-amber-500/20 text-amber-300",
  "job-details":      "bg-indigo-500/20 text-indigo-300",
  "company-culture":  "bg-pink-500/20 text-pink-300",
  cta:                "bg-orange-500/20 text-orange-300",
  testimonial:        "bg-teal-500/20 text-teal-300",
  "product-feature":  "bg-cyan-500/20 text-cyan-300",
  "brand-story":      "bg-rose-500/20 text-rose-300",
  requirements:       "bg-slate-500/20 text-slate-300",
  benefits:           "bg-lime-500/20 text-lime-300",
};

function SceneCard({
  scene,
  focused,
  canMoveUp,
  canMoveDown,
  canDelete,
  onChange,
  onFocus,
  onDelete,
  onMoveUp,
  onMoveDown,
  selectedElementId,
  onSelectedElementChange,
}: {
  scene: SceneScript;
  focused: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  onChange: (patch: Partial<SceneScript>) => void;
  onFocus: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  selectedElementId?: string | null;
  onSelectedElementChange?: (id: string | null) => void;
}) {
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const audioUploadRef = useRef<HTMLInputElement>(null);

  function makeImageElement(url: string): ImageElement {
    return {
      id: `el-img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "image",
      url,
      box: { x: 0, y: 0, w: 100, h: 100 },
      fit: "cover",
      z: (scene.sceneElements?.length ?? 0),
    };
  }

  function pushElement(el: ImageElement) {
    onChange({ sceneElements: [...(scene.sceneElements ?? []), el] });
  }

  function replaceElementUrl(elementId: string, url: string) {
    onChange({
      sceneElements: (scene.sceneElements ?? []).map((e) =>
        e.id === elementId ? { ...e, url } : e,
      ),
    });
  }

  async function handleGenerateImage() {
    if (!imagePrompt.trim()) return;
    setGeneratingImage(true);
    try {
      // Pull subject context from text elements so the AI has relevant info
      // even when the user only describes the visual style.
      const contextParts = (scene.sceneElements ?? [])
        .filter((e): e is import("@/types/video-script").TextElement => e.kind === "text")
        .map((e) => e.text)
        .filter(Boolean);
      const sceneCtx = contextParts.join(" · ").slice(0, 200);
      const fullPrompt = sceneCtx
        ? `${imagePrompt.trim()} — Scene: ${sceneCtx}`
        : imagePrompt.trim();
      const res = await studioService.generateImage(fullPrompt);
      const dataUrl = res.data.imageUrl;
      const newEl = makeImageElement(dataUrl);
      pushElement(newEl);
      setShowImagePrompt(false);
      // Upload the generated image to persistent storage in the background
      if (dataUrl.startsWith("data:")) {
        try {
          const [header, base64] = dataUrl.split(",");
          const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const file = new File([bytes], "scene-bg.png", { type: mime });
          const uploadRes = await studioService.uploadSceneImage(file);
          replaceElementUrl(newEl.id, uploadRes.data.url);
        } catch {
          // Upload failed — data URL stays (functional until page reload)
        }
      }
    } catch {
      // silently fail — image just won't update
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show a preview immediately via blob URL while uploading to persistent storage
    const blobUrl = URL.createObjectURL(file);
    const newEl = makeImageElement(blobUrl);
    pushElement(newEl);
    e.target.value = "";
    try {
      const res = await studioService.uploadSceneImage(file);
      // Replace the ephemeral blob URL with the persistent CDN URL
      replaceElementUrl(newEl.id, res.data.url);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Upload failed — blob URL stays (functional until page reload)
    }
  }

  function buildSceneAIPrompt(): string {
    const parts = (scene.sceneElements ?? [])
      .filter((e): e is import("@/types/video-script").TextElement => e.kind === "text")
      .map((e) => e.text.trim())
      .filter(Boolean);
    const context = parts.join(" · ").slice(0, 200);
    const base = SCENE_IMAGE_BASE[scene.type];
    return context ? `${base}. Subject context: ${context}` : base;
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    onChange({ sceneAudio: blobUrl, sceneAudioLabel: file.name });
    e.target.value = "";
    try {
      const res = await studioService.uploadSceneAudio(file);
      onChange({ sceneAudio: res.data.url });
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Upload failed — blob URL stays functional until page reload
    }
  }

  return (
    <div
      className={`rounded-lg border bg-card p-4 flex flex-col gap-3 cursor-pointer transition-all ${
        focused ? "border-primary shadow-sm shadow-primary/20" : "border-border hover:border-muted-foreground/40"
      }`}
      onClick={onFocus}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Select
            value={scene.type}
            onValueChange={(v) => onChange({ type: v as SceneType })}
          >
            <SelectTrigger className="h-6 text-[11px] w-auto border-0 p-0 pr-5 bg-transparent focus:ring-0" onClick={(e) => e.stopPropagation()}>
              <Badge className={`text-xs capitalize ${TYPE_COLOURS[scene.type]}`}>{scene.type}</Badge>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="intro">Intro</SelectItem>
              <SelectItem value="achievement">Achievement</SelectItem>
              <SelectItem value="skills">Skills</SelectItem>
              <SelectItem value="closing">Closing</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
          {/* Per-scene accent color */}
          <label className="flex items-center gap-0.5 cursor-pointer" title="Scene accent color" onClick={(e) => e.stopPropagation()}>
            <input
              type="color"
              value={scene.accentColor ?? "#7c3aed"}
              className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
              onChange={(e) => { e.stopPropagation(); onChange({ accentColor: e.target.value }); }}
            />
          </label>
          {/* Duration +/- */}
          <button type="button" className="p-0.5 hover:text-foreground rounded" onClick={(e) => { e.stopPropagation(); onChange({ duration: Math.max(3, scene.duration - 1) }); }}><Minus className="w-3 h-3" /></button>
          <span className="w-6 text-center font-mono">{scene.duration}s</span>
          <button type="button" className="p-0.5 hover:text-foreground rounded" onClick={(e) => { e.stopPropagation(); onChange({ duration: Math.min(30, scene.duration + 1) }); }}><Plus className="w-3 h-3" /></button>
          {/* Reorder */}
          <button type="button" className="p-0.5 hover:text-foreground rounded disabled:opacity-25" disabled={!canMoveUp} onClick={(e) => { e.stopPropagation(); onMoveUp(); }}><ChevronUp className="w-3 h-3" /></button>
          <button type="button" className="p-0.5 hover:text-foreground rounded disabled:opacity-25" disabled={!canMoveDown} onClick={(e) => { e.stopPropagation(); onMoveDown(); }}><ChevronDown className="w-3 h-3" /></button>
          {/* Delete */}
          {canDelete && (
            <button type="button" className="p-0.5 hover:text-red-400 rounded ml-0.5" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete scene"><Trash2 className="w-3 h-3" /></button>
          )}
        </div>
      </div>

      {/* Add-media row: AI image · upload image · upload audio */}
      <div onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1.5 h-7 text-xs text-muted-foreground border border-dashed border-border rounded-md hover:border-primary/40 hover:text-foreground transition-colors"
            onClick={() => { setShowImagePrompt((v) => !v); if (!imagePrompt) setImagePrompt(buildSceneAIPrompt()); }}
          >
            <Sparkles className="w-3 h-3" /> AI Image
          </button>
          <button
            type="button"
            title="Upload image"
            className="flex items-center justify-center gap-1 h-7 px-2 text-xs text-muted-foreground border border-dashed border-border rounded-md hover:border-primary/40 hover:text-foreground transition-colors"
            onClick={() => imageUploadRef.current?.click()}
          >
            <ImagePlus className="w-3 h-3" />
          </button>
          <button
            type="button"
            title={scene.sceneAudio ? `Audio: ${scene.sceneAudioLabel ?? "custom"}` : "Upload scene audio"}
            className={`flex items-center justify-center gap-1 h-7 px-2 text-xs border border-dashed rounded-md transition-colors ${
              scene.sceneAudio
                ? "border-emerald-500/60 text-emerald-400 hover:border-red-400 hover:text-red-400"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
            onClick={() => {
              if (scene.sceneAudio) {
                onChange({ sceneAudio: undefined, sceneAudioLabel: undefined });
              } else {
                audioUploadRef.current?.click();
              }
            }}
          >
            <Music className="w-3 h-3" />
          </button>
          <input ref={audioUploadRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.aac,.m4a" className="sr-only" onChange={handleAudioUpload} />
        </div>

        <input ref={imageUploadRef} type="file" accept="image/*" className="sr-only" onChange={handleImageUpload} />

        {showImagePrompt && (
          <div className="flex gap-1.5 mt-1.5">
            <input
              autoFocus
              className="flex-1 h-7 px-2 text-xs bg-transparent border border-border rounded focus:outline-none focus:border-primary min-w-0"
              placeholder="Describe the image…"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleGenerateImage(); if (e.key === "Escape") setShowImagePrompt(false); }}
            />
            <button
              type="button"
              disabled={generatingImage || !imagePrompt.trim()}
              className="shrink-0 h-7 px-2.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
              onClick={handleGenerateImage}
            >
              {generatingImage ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</> : <><Sparkles className="w-3 h-3" /> Generate</>}
            </button>
          </div>
        )}
      </div>

      {/* Free-form scene elements (text/image/video/audio) */}
      <div className="border-t pt-2 mt-1">
        <SceneElementsGallery
          elements={scene.sceneElements ?? []}
          onChange={(els) => onChange({ sceneElements: els })}
          selectedElementId={
            selectedElementId && (scene.sceneElements ?? []).some((e) => e.id === selectedElementId)
              ? selectedElementId
              : null
          }
          onSelectedElementChange={onSelectedElementChange}
        />
      </div>
    </div>
  );
}

export default function StoryboardEditor({ script, onScriptChange, focusedSceneId, onSceneFocus, selectedElementId, onSelectedElementChange }: Props) {
  function applyScenes(scenes: SceneScript[]) {
    let cursor = 0;
    const restarted = scenes.map((s) => {
      const out = { ...s, start: cursor };
      cursor += s.duration;
      return out;
    });
    onScriptChange({ ...script, video: { ...script.video, duration: cursor }, scenes: restarted });
  }

  function patchScene(index: number, patch: Partial<SceneScript>) {
    const scenes = [...script.scenes];
    scenes[index] = { ...scenes[index], ...patch };
    applyScenes(scenes);
  }

  function deleteScene(index: number) {
    applyScenes(script.scenes.filter((_, i) => i !== index));
  }

  function moveScene(index: number, dir: -1 | 1) {
    const scenes = [...script.scenes];
    const target = index + dir;
    if (target < 0 || target >= scenes.length) return;
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    applyScenes(scenes);
  }

  function addScene() {
    const id = `scene-${Date.now()}`;
    const newScene: SceneScript = {
      id,
      start: 0,
      duration: 7,
      type: "achievement",
      sceneElements: [
        {
          id: `el-title-${Date.now().toString(36)}`,
          kind: "text",
          text: "New Scene",
          box: { x: 5, y: 38, w: 90, h: 24 },
          fontSize: 36,
          fontWeight: "bold",
          color: "#ffffff",
          align: "center",
          verticalAlign: "middle",
          z: 0,
        },
      ],
    };
    applyScenes([...script.scenes, newScene]);
  }

  return (
    <div className="p-5">
      <div className="grid grid-cols-2 gap-3 mb-3">
        {script.scenes.map((scene, i) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            focused={focusedSceneId === scene.id}
            canMoveUp={i > 0}
            canMoveDown={i < script.scenes.length - 1}
            canDelete={script.scenes.length > 1}
            onChange={(patch) => patchScene(i, patch)}
            onFocus={() => onSceneFocus?.(scene.id)}
            onDelete={() => deleteScene(i)}
            onMoveUp={() => moveScene(i, -1)}
            onMoveDown={() => moveScene(i, 1)}
            selectedElementId={selectedElementId}
            onSelectedElementChange={onSelectedElementChange}
          />
        ))}
      </div>
      <button
        type="button"
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        onClick={addScene}
      >
        <Plus className="w-3.5 h-3.5" /> Add Scene
      </button>
    </div>
  );
}
