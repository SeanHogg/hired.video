// StoryboardEditor.tsx — editable scene cards backed by VideoScript.scenes.
// Any edit triggers onScriptChange which the parent recompiles immediately.

import { useState, useRef } from "react";
import { Minus, Plus, X, Trash2, ChevronUp, ChevronDown, Sparkles, Loader2, ImagePlus, Upload, Music } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { VideoScript, SceneScript, SceneType, ImagePosition } from "@/types/video-script";
import { studioService } from "@/lib/services/studio-service";

interface Props {
  script: VideoScript;
  onScriptChange: (s: VideoScript) => void;
  focusedSceneId?: string;
  onSceneFocus?: (id: string) => void;
}

// ─── Skill chips ─────────────────────────────────────────────────────────────

function SkillChips({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (s: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const MAX = 8;

  function add(raw: string) {
    const s = raw.trim();
    if (s && !skills.includes(s) && skills.length < MAX) {
      onChange([...skills, s]);
    }
    setDraft("");
  }

  function startEdit(i: number) {
    setEditingIdx(i);
    setEditVal(skills[i]);
  }

  function commitEdit() {
    if (editingIdx === null) return;
    const s = editVal.trim();
    if (s && s !== skills[editingIdx]) {
      const next = [...skills];
      next[editingIdx] = s;
      onChange(next);
    }
    setEditingIdx(null);
    setEditVal("");
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Chips */}
      {skills.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {skills.map((s, i) => (
            editingIdx === i ? (
              <input
                key={s + i}
                autoFocus
                className="w-full h-7 px-2 text-xs bg-background border border-primary rounded focus:outline-none"
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                  if (e.key === "Escape") { setEditingIdx(null); setEditVal(""); }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                key={s}
                className="flex items-center justify-between px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs cursor-pointer hover:bg-emerald-500/30 transition-colors"
                onDoubleClick={(e) => { e.stopPropagation(); startEdit(i); }}
                title="Double-click to edit"
              >
                <span className="truncate flex-1">{s}</span>
                <button
                  type="button"
                  className="ml-1.5 hover:text-white transition-colors shrink-0"
                  onClick={(e) => { e.stopPropagation(); onChange(skills.filter((_, idx) => idx !== i)); }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          ))}
        </div>
      )}
      {/* Add input */}
      <input
        className="w-full h-7 px-2 text-xs bg-transparent border border-border rounded focus:outline-none focus:border-primary disabled:opacity-40"
        placeholder={skills.length >= MAX ? "Max 8 skills reached" : "Add skill — press Enter or comma"}
        disabled={skills.length >= MAX}
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            add(v.slice(0, -1));
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(draft); }
          if (e.key === "Backspace" && !draft && skills.length > 0) {
            onChange(skills.slice(0, -1));
          }
        }}
      />
      <p className="text-[10px] text-muted-foreground mt-1">{skills.length}/{MAX} skills · double-click chip to edit</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const TEXT_ALIGNS: { value: "left" | "center" | "right"; icon: string; label: string }[] = [
  { value: "left",   icon: "⬤◻◻", label: "Left" },
  { value: "center", icon: "◻⬤◻", label: "Center" },
  { value: "right",  icon: "◻◻⬤", label: "Right" },
];

const CONTENT_POSITIONS: { value: "top" | "center" | "bottom"; icon: string; label: string }[] = [
  { value: "top",    icon: "▲", label: "Top" },
  { value: "center", icon: "■", label: "Center" },
  { value: "bottom", icon: "▼", label: "Bottom" },
];

const IMAGE_ANIMATIONS: { value: string; label: string }[] = [
  { value: "none",      label: "Static" },
  { value: "zoom-in",   label: "Zoom In" },
  { value: "zoom-out",  label: "Zoom Out" },
  { value: "pan-left",  label: "Pan Left" },
  { value: "pan-right", label: "Pan Right" },
];

const IMAGE_POSITIONS: { value: ImagePosition; label: string; icon: string }[] = [
  { value: "full",        label: "Full",          icon: "⬛" },
  { value: "half-left",   label: "Half Left",     icon: "◧" },
  { value: "half-right",  label: "Half Right",    icon: "◨" },
  { value: "small-left",  label: "Small Left",    icon: "▐" },
  { value: "small-right", label: "Small Right",   icon: "▌" },
  { value: "corner-tl",   label: "Corner TL",     icon: "◸" },
  { value: "corner-tr",   label: "Corner TR",     icon: "◹" },
  { value: "corner-bl",   label: "Corner BL",     icon: "◺" },
  { value: "corner-br",   label: "Corner BR",     icon: "◻" },
];

const SCENE_IMAGE_BASE: Record<SceneType, string> = {
  intro: "Professional portrait background, modern office environment, soft directional lighting, cinematic depth of field",
  achievement: "Abstract success visualization, upward trending graphs, glowing data, premium dark background",
  skills: "Futuristic technology, flowing circuit patterns, vibrant gradient, high-tech workspace",
  closing: "Bright sunrise cityscape, optimistic career horizon, warm golden hour, inspirational vista",
};

function buildScenePrompt(scene: SceneScript): string {
  const parts: string[] = [];
  if (scene.title) parts.push(scene.title);
  if (scene.subtitle) parts.push(scene.subtitle);
  if (scene.text) parts.push(Array.isArray(scene.text) ? scene.text.join(" ") : scene.text);
  if (scene.items?.length) parts.push(scene.items.slice(0, 2).join(", "));
  if (scene.skills?.length) parts.push(scene.skills.slice(0, 4).join(", "));
  const context = parts.map(p => p.trim()).filter(Boolean).join(" · ").slice(0, 200);
  const base = SCENE_IMAGE_BASE[scene.type];
  return context ? `${base}. Subject context: ${context}` : base;
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
  canMoveUp,
  canMoveDown,
  canDelete,
  onChange,
  onFocus,
  onDelete,
  onMoveUp,
  onMoveDown,
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
}) {
  const items  = scene.items?.join("\n")  ?? "";
  const textVal = Array.isArray(scene.text) ? scene.text.join("\n") : (scene.text ?? "");

  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const audioUploadRef = useRef<HTMLInputElement>(null);

  async function handleGenerateImage() {
    if (!imagePrompt.trim()) return;
    setGeneratingImage(true);
    try {
      // Merge scene context (name, role, text) into the prompt so the AI has
      // relevant subject info even when the user only describes the visual style.
      const contextParts: string[] = [];
      if (scene.title) contextParts.push(scene.title);
      if (scene.subtitle) contextParts.push(scene.subtitle);
      if (scene.text) contextParts.push(Array.isArray(scene.text) ? scene.text.slice(0,1).join(" ") : scene.text.slice(0, 120));
      if (scene.skills?.length) contextParts.push(scene.skills.slice(0, 3).join(", "));
      const sceneCtx = contextParts.filter(Boolean).join(" · ").slice(0, 200);
      const fullPrompt = sceneCtx
        ? `${imagePrompt.trim()} — Scene: ${sceneCtx}`
        : imagePrompt.trim();
      const res = await studioService.generateImage(fullPrompt);
      const dataUrl = res.data.imageUrl;
      onChange({ backgroundImage: dataUrl });
      setShowImagePrompt(false);
      // Upload the generated image to persistent storage in the background
      if (dataUrl.startsWith("data:")) {
        try {
          const [header, base64] = dataUrl.split(",");
          const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const file = new File([bytes], "scene-bg.png", { type: mime });
          const uploadRes = await studioService.uploadSceneImage(file);
          onChange({ backgroundImage: uploadRes.data.url });
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
    onChange({ backgroundImage: blobUrl });
    e.target.value = "";
    try {
      const res = await studioService.uploadSceneImage(file);
      // Replace the ephemeral blob URL with the persistent CDN URL
      onChange({ backgroundImage: res.data.url });
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Upload failed — blob URL stays (functional until page reload)
    }
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

      {/* AI Image */}
      <div onClick={(e) => e.stopPropagation()}>
        {scene.backgroundImage ? (
          <div className="flex flex-col gap-1.5">
            <div className="relative group">
              <img
                src={scene.backgroundImage}
                alt="Scene background"
                className="w-full h-16 object-cover rounded-md border border-border"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-md">
                <button
                  type="button"
                  className="text-[10px] text-white px-2 py-0.5 bg-primary/80 rounded hover:bg-primary"
                  onClick={() => { setShowImagePrompt(true); setImagePrompt(buildScenePrompt(scene)); }}
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  className="text-[10px] text-white px-2 py-0.5 bg-primary/80 rounded hover:bg-primary"
                  onClick={() => imageUploadRef.current?.click()}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="text-[10px] text-white px-2 py-0.5 bg-red-500/80 rounded hover:bg-red-500"
                  onClick={() => onChange({ backgroundImage: undefined, backgroundImagePosition: undefined })}
                >
                  Remove
                </button>
              </div>
            </div>
            {/* Position picker */}
            <div className="flex flex-wrap gap-1">
              {IMAGE_POSITIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.label}
                  className={`flex items-center justify-center w-7 h-7 rounded text-sm border transition-colors ${
                    (scene.backgroundImagePosition ?? "full") === p.value
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                  onClick={() => onChange({ backgroundImagePosition: p.value })}
                >
                  {p.icon}
                </button>
              ))}
            </div>
            {/* Ken Burns animation */}
            <div className="flex gap-1 flex-wrap mt-1">
              {IMAGE_ANIMATIONS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  title={a.label}
                  className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                    (scene.imageAnimation ?? "none") === a.value
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                  onClick={() => onChange({ imageAnimation: a.value as import("@/types/video-script").ImageAnimation })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5">
            {/* AI generate */}
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1.5 h-7 text-xs text-muted-foreground border border-dashed border-border rounded-md hover:border-primary/40 hover:text-foreground transition-colors"
              onClick={() => { setShowImagePrompt((v) => !v); if (!imagePrompt) setImagePrompt(buildScenePrompt(scene)); }}
            >
              <Sparkles className="w-3 h-3" /> AI Image
            </button>
            {/* Upload image */}
            <button
              type="button"
              title="Upload image"
              className="flex items-center justify-center gap-1 h-7 px-2 text-xs text-muted-foreground border border-dashed border-border rounded-md hover:border-primary/40 hover:text-foreground transition-colors"
              onClick={() => imageUploadRef.current?.click()}
            >
              <ImagePlus className="w-3 h-3" />
            </button>
            {/* Upload audio */}
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
        )}

        {/* Hidden file input — always mounted so imageUploadRef is valid even when an image is shown */}
        <input ref={imageUploadRef} type="file" accept="image/*" className="sr-only" onChange={handleImageUpload} />

        {showImagePrompt && (
          <div className="flex gap-1.5 mt-1.5">
            <input
              autoFocus
              className="flex-1 h-7 px-2 text-xs bg-transparent border border-border rounded focus:outline-none focus:border-primary min-w-0"
              placeholder="Describe the background…"
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

      {/* Text layout controls */}
      <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
        {/* Text alignment */}
        <div className="flex gap-0.5">
          {TEXT_ALIGNS.map((a) => (
            <button
              key={a.value}
              type="button"
              title={`Align ${a.label}`}
              className={`w-7 h-6 flex items-center justify-center rounded text-xs border transition-colors ${
                (scene.textAlign ?? "center") === a.value
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
              onClick={() => onChange({ textAlign: a.value })}
            >
              {a.value === "left" ? "L" : a.value === "right" ? "R" : "C"}
            </button>
          ))}
        </div>
        {/* Content position */}
        <div className="flex gap-0.5">
          {CONTENT_POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              title={`Position ${p.label}`}
              className={`w-7 h-6 flex items-center justify-center rounded text-xs border transition-colors ${
                (scene.contentPosition ?? "center") === p.value
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
              onClick={() => onChange({ contentPosition: p.value })}
            >
              {p.icon}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground ml-1">Layout</span>
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

      {/* Skills — individual chip tags */}
      {scene.type === "skills" && (
        <SkillChips
          skills={scene.skills ?? []}
          onChange={(s) => onChange({ skills: s })}
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
    const newScene: SceneScript = {
      id: `scene-${Date.now()}`,
      start: 0,
      duration: 7,
      type: "achievement",
      title: "New Scene",
      items: [],
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
