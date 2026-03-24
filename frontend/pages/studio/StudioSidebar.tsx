// StudioSidebar.tsx — project navigation: Create New, Recent, Templates, Roast link.

import { useState, useEffect, useRef } from "react";
import { Plus, Flame, Clock, LayoutTemplate, Check, ImagePlus, Layers, Palette, Music2, Volume2, VolumeX, Trash2, Play, Square, Save, Loader2, ChevronDown, ChevronRight, Pencil, Eye, MousePointerClick } from "lucide-react";
import { getAmbientPlayer } from "@/lib/audio/ambient-player";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import type { VideoScript, VideoTheme, VideoAudio } from "@/types/video-script";

// Template metadata with visual descriptions
const TEMPLATES: {
  label: string;
  file: string;
  desc: string;
  colors: string[];
  duration: number;
  motion: string;
}[] = [
  {
    label: "Professional",
    file: "video-resume-professional",
    desc: "28s · Purple gradient · Fade · Moderate motion",
    colors: ["#7c3aed", "#2563eb", "#c4b5fd"],
    duration: 28,
    motion: "moderate",
  },
  {
    label: "Minimal",
    file: "video-resume-minimal",
    desc: "20s · Dark monochrome · Cut · Subtle motion",
    colors: ["#18181b", "#3f3f46", "#a1a1aa"],
    duration: 20,
    motion: "minimal",
  },
];

// ─── Background presets ────────────────────────────────────────────────────

type BgPreset = {
  label: string;
  /** Value passed as video.theme.background + optional color encoded as "type:color1:color2" */
  value: string;
  preview: string; // CSS background for the swatch
};

const BG_PRESETS: BgPreset[] = [
  { label: "Purple Gradient", value: "gradient:#7c3aed:#2563eb", preview: "linear-gradient(135deg,#7c3aed,#2563eb)" },
  { label: "Sunset",          value: "gradient:#f97316:#ec4899", preview: "linear-gradient(135deg,#f97316,#ec4899)" },
  { label: "Ocean",           value: "gradient:#0ea5e9:#06b6d4", preview: "linear-gradient(135deg,#0ea5e9,#06b6d4)" },
  { label: "Forest",          value: "gradient:#16a34a:#065f46", preview: "linear-gradient(135deg,#16a34a,#065f46)" },
  { label: "Dark Tech Grid",  value: "dark-tech-grid:#7c3aed",   preview: "linear-gradient(135deg,#0f0f23,#1e1b4b)" },
  { label: "Particles",       value: "particles:#7c3aed",        preview: "radial-gradient(circle at 30% 30%,#7c3aed44,#1a0533)" },
  { label: "Midnight",        value: "solid:#0f172a",            preview: "#0f172a" },
  { label: "Charcoal",        value: "solid:#18181b",            preview: "#18181b" },
];

// ─── Audio presets ─────────────────────────────────────────────────────────

type AudioPreset = { label: string; track: string; genre: string };

const AUDIO_PRESETS: AudioPreset[] = [
  { label: "Corporate Inspire",  track: "corporate-inspire",  genre: "Corporate" },
  { label: "Tech Ambient",       track: "tech-ambient",       genre: "Electronic" },
  { label: "Upbeat Career",      track: "upbeat-career",      genre: "Pop" },
  { label: "Cinematic Rise",     track: "cinematic-rise",     genre: "Cinematic" },
  { label: "Minimal Focus",      track: "minimal-focus",      genre: "Ambient" },
  { label: "None",               track: "none",               genre: "" },
];

interface Props {
  projects: StudioProject[];
  activeProjectId?: string | null;
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
  onCreateNew: () => void;
  onProjectSelect: (project: StudioProject) => void;
  onDeleteProject?: (id: string) => void;
  onTemplateLoad: (script: VideoScript) => void;
  /** Called when user picks a background preset or uploads a custom image */
  onBackgroundSelect?: (bgValue: string, customImageUrl?: string) => void;
  script?: import("@/types/video-script").VideoScript | null;
  onScriptChange?: (s: import("@/types/video-script").VideoScript) => void;
}

const STATUS_COLOUR: Record<string, string> = {
  Draft:      "bg-muted text-muted-foreground",
  Processing: "bg-blue-500/20 text-blue-300",
  Exported:   "bg-cyan-500/20 text-cyan-300",
  Publishing: "bg-amber-500/20 text-amber-300",
  Completed:  "bg-emerald-500/20 text-emerald-300",
  Published:  "bg-emerald-500/20 text-emerald-300",
  Failed:     "bg-red-500/20 text-red-300",
};

async function loadTemplate(file: string): Promise<VideoScript | null> {
  try {
    const mod = await import(`../../data/templates/${file}.json`);
    return mod.default as VideoScript;
  } catch {
    return null;
  }
}

const SIDEBAR_PREFS_KEY = "studio_sidebar_collapsed";

function loadCollapsed() {
  try {
    const raw = localStorage.getItem(SIDEBAR_PREFS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {}
  return { templates: false, backgrounds: false, theme: false, music: false };
}

export default function StudioSidebar({ projects, activeProjectId, projectName, onProjectNameChange, onSave, isSaving, onCreateNew, onProjectSelect, onDeleteProject, onTemplateLoad, onBackgroundSelect, script, onScriptChange }: Props) {
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [activeBg, setActiveBg] = useState<string | null>(null);
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewingTrack, setPreviewingTrack] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const bgUploadRef = useRef<HTMLInputElement>(null);

  // Persist collapsed state to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREFS_KEY, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  // Sync background selection when a project is loaded
  useEffect(() => {
    const bg = script?.video?.theme?.background;
    const customBg = script?.video?.theme?.customBackground;
    if (customBg) {
      setActiveBg("custom");
      setCustomBgUrl(customBg);
    } else if (bg) {
      setActiveBg(bg);
    }
  }, [script?.video?.theme?.background, script?.video?.theme?.customBackground]);

  function toggleSection(key: string) {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  }

  function startEditingProject(p: import("@/lib/services/studio-service").StudioProject, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingProjectId(p.id);
    setEditingName(p.title);
  }

  function commitProjectRename(e?: React.FormEvent) {
    e?.preventDefault();
    if (editingProjectId && editingName.trim()) {
      onProjectNameChange?.(editingName.trim());
      onSave?.();
    }
    setEditingProjectId(null);
  }

  // Stop audio sample when sidebar unmounts
  useEffect(() => {
    return () => { if (previewingTrack) getAmbientPlayer().stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear active template highlight whenever the workspace is reset to a new/blank project
  useEffect(() => {
    if (activeProjectId == null) setActiveTemplate(null);
  }, [activeProjectId]);

  async function handleTemplate(file: string) {
    const script = await loadTemplate(file);
    if (script) {
      setActiveTemplate(file);
      onTemplateLoad(script);
    }
  }

  function handleBgPreset(preset: BgPreset) {
    setActiveBg(preset.value);
    onBackgroundSelect?.(preset.value);
  }

  async function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show immediately via blob URL while uploading to persistent storage
    const blobUrl = URL.createObjectURL(file);
    setCustomBgUrl(blobUrl);
    setActiveBg("custom");
    onBackgroundSelect?.("custom", blobUrl);
    e.target.value = "";
    try {
      const res = await studioService.uploadSceneImage(file);
      setCustomBgUrl(res.data.url);
      onBackgroundSelect?.("custom", res.data.url);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Upload failed — blob URL stays functional until page reload
    }
  }

  function patchTheme(patch: Partial<VideoTheme>) {
    if (!script || !onScriptChange) return;
    onScriptChange({
      ...script,
      video: { ...script.video, theme: { ...script.video.theme, ...patch } },
    });
  }

  function patchAudio(patch: Partial<VideoAudio> | null) {
    if (!script || !onScriptChange) return;
    const audio = patch === null ? undefined : { track: "none", label: "None", volume: 0.6, ...script.video.audio, ...patch };
    onScriptChange({ ...script, video: { ...script.video, audio } });
  }

  return (
    <aside className="studio-sidebar">
      {/* Create New + Project name/save */}
      <div className="p-3 border-b flex flex-col gap-2">
        <Button className="w-full" size="sm" onClick={onCreateNew}>
          <Plus className="w-4 h-4 mr-2" /> New Video
        </Button>
        {onSave && (
          <div className="flex items-center gap-1.5">
            <Input
              value={projectName ?? ""}
              onChange={(e) => onProjectNameChange?.(e.target.value)}
              className="h-7 text-xs flex-1 min-w-0"
              placeholder="Project name…"
            />
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2" onClick={onSave} disabled={isSaving} title="Save project">
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
          </div>
        )}
      </div>

      {/* Recent Projects */}
      <section className="px-3 py-3 border-b">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          <Clock className="w-3 h-3" /> Recent
        </p>
        <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5">
          {projects.length === 0 && (
            <li className="text-xs text-muted-foreground px-1">No projects yet</li>
          )}
          {projects.map((p) => (
            <li key={p.id} className="group relative">
              {confirmDeleteId === p.id ? (
                /* Confirm row */
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-xs">
                  <span className="flex-1 text-red-400 truncate">Delete "{p.title}"?</span>
                  <button
                    type="button"
                    className="shrink-0 px-1.5 py-0.5 rounded bg-red-500 text-white text-[10px] hover:bg-red-600"
                    onClick={() => { onDeleteProject?.(p.id); setConfirmDeleteId(null); }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="shrink-0 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] hover:bg-accent"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : editingProjectId === p.id ? (
                /* Inline rename form */
                <form onSubmit={commitProjectRename} className="flex items-center gap-1 px-2 py-1">
                  <input
                    autoFocus
                    className="flex-1 min-w-0 text-xs bg-background border border-primary rounded px-1.5 py-0.5 outline-none"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitProjectRename()}
                    onKeyDown={(e) => { if (e.key === "Escape") setEditingProjectId(null); }}
                  />
                  <button type="submit" className="shrink-0 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px]">Save</button>
                </form>
              ) : (
                <div className={`flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-accent ${
                  p.id === activeProjectId ? "bg-accent font-medium" : ""
                }`}>
                  <button
                    type="button"
                    className="flex-1 text-left text-xs truncate flex items-center gap-2 min-w-0"
                    onClick={() => onProjectSelect(p)}
                    title={p.title}
                  >
                    <span className="truncate flex-1">{p.title}</span>
                    {(p.viewCount ?? 0) > 0 && (
                      <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground" title={`${p.viewCount} views · ${p.ctaClickCount ?? 0} CTA clicks`}>
                        <Eye className="w-2.5 h-2.5" />{p.viewCount}
                      </span>
                    )}
                    <Badge className={`text-[10px] shrink-0 ${STATUS_COLOUR[p.status] ?? ""}`}>{p.status}</Badge>
                  </button>
                  {/* Pencil — rename (shown on active project or on hover) */}
                  {p.id === activeProjectId && (
                    <button
                      type="button"
                      title="Rename project"
                      className="shrink-0 p-0.5 rounded hover:text-primary text-muted-foreground transition-colors"
                      onClick={(e) => startEditingProject(p, e)}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Delete project"
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 text-muted-foreground transition-all"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Templates */}
      <section className="px-3 pb-3 border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
          onClick={() => toggleSection("templates")}
        >
          <LayoutTemplate className="w-3 h-3" /> <span className="flex-1 text-left">Templates</span>
          {collapsed.templates ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {!collapsed.templates && <ul className="flex flex-col gap-2">
          {TEMPLATES.map((t) => {

            const isActive = activeTemplate === t.file;
            return (
              <li key={t.file}>
                <button
                  type="button"
                  className={`w-full text-left px-2.5 py-2.5 rounded-lg border transition-colors group ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-accent"
                  }`}
                  onClick={() => handleTemplate(t.file)}
                  title={`Load ${t.label} template`}
                >
                  {/* Color strip */}
                  <div className="flex gap-1 mb-2">
                    {t.colors.map((c) => (
                      <div
                        key={c}
                        className="h-2 flex-1 rounded-sm"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>

                  {/* Label + active check */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-semibold ${isActive ? "text-primary" : ""}`}>
                      {t.label}
                    </span>
                    {isActive && <Check className="w-3 h-3 text-primary" />}
                  </div>

                  {/* Description */}
                  <p className="text-[10px] text-muted-foreground leading-tight">{t.desc}</p>
                </button>
              </li>
            );
          })}
        </ul>}
      </section>

      {/* Backgrounds */}
      <section className="px-3 pb-3 border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
          onClick={() => toggleSection("backgrounds")}
        >
          <Layers className="w-3 h-3" /> <span className="flex-1 text-left">Backgrounds</span>
          {collapsed.backgrounds ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {!collapsed.backgrounds && <>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {/* Uploaded custom background — shown as first swatch when available */}
            {customBgUrl && (
              <button
                type="button"
                title="Custom upload"
                onClick={() => { setActiveBg("custom"); onBackgroundSelect?.("custom", customBgUrl); }}
                className={`relative h-9 rounded-md border-2 transition-all overflow-hidden ${
                  activeBg === "custom" ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-primary/40"
                }`}
              >
                <img src={customBgUrl} className="w-full h-full object-cover" alt="Custom background" />
                {activeBg === "custom" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Check className="w-3 h-3 text-white drop-shadow" />
                  </div>
                )}
              </button>
            )}
            {BG_PRESETS.map((bg) => (
              <button
                key={bg.value}
                type="button"
                title={bg.label}
                onClick={() => handleBgPreset(bg)}
                className={`relative h-9 rounded-md border-2 transition-all overflow-hidden ${
                  activeBg === bg.value ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-primary/40"
                }`}
                style={{ background: bg.preview }}
              >
                {activeBg === bg.value && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white drop-shadow" />
                  </div>
                )}
              </button>
            ))}
          </div>
          {/* Custom upload */}
          <input
            ref={bgUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBgUpload}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => bgUploadRef.current?.click()}
          >
            <ImagePlus className="w-3 h-3 mr-1.5" />
            {customBgUrl ? "Change Upload" : "Upload Image"}
          </Button>
        </>}
      </section>

      {/* Theme */}
      {script?.video.theme && (
        <section className="px-3 pb-3 border-t pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
            onClick={() => toggleSection("theme")}
          >
            <Palette className="w-3 h-3" /> <span className="flex-1 text-left">Theme</span>
            {collapsed.theme ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {!collapsed.theme && <>
          {/* Color palette */}
          <div className="mb-3">
            <Label className="mb-1.5 block text-xs text-muted-foreground">Colors</Label>
            <div className="flex gap-2 flex-wrap">
              {(script.video.theme.colorPalette ?? []).slice(0, 4).map((c, i) => (
                <label key={i} className="flex flex-col items-center gap-1 cursor-pointer">
                  <input
                    type="color"
                    value={c}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                    onChange={(e) => {
                      const palette = [...(script.video.theme.colorPalette ?? [])];
                      palette[i] = e.target.value;
                      patchTheme({ colorPalette: palette });
                    }}
                  />
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {i === 0 ? "Primary" : i === 1 ? "Secondary" : i === 2 ? "Light" : "Accent"}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {/* Font */}
          <div className="mb-3">
            <Label className="mb-1.5 block text-xs text-muted-foreground">Font</Label>
            <Select value={script.video.theme.fontFamily ?? "Inter, sans-serif"} onValueChange={(v) => patchTheme({ fontFamily: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Inter, sans-serif">Inter (default)</SelectItem>
                <SelectItem value="Roboto, sans-serif">Roboto</SelectItem>
                <SelectItem value="Montserrat, sans-serif">Montserrat</SelectItem>
                <SelectItem value="Playfair Display, serif">Playfair Display</SelectItem>
                <SelectItem value="JetBrains Mono, monospace">JetBrains Mono</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Transition */}
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Transition</Label>
            <Select value={script.video.theme.transition ?? "fade"} onValueChange={(v) => patchTheme({ transition: v as VideoTheme["transition"] })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fade">Fade</SelectItem>
                <SelectItem value="cut">Cut (instant)</SelectItem>
                <SelectItem value="slide">Slide</SelectItem>
                <SelectItem value="cinematic-fade">Cinematic Fade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          </>}
        </section>
      )}

      {/* Music */}
      {script && (
        <section className="px-3 pb-3 border-t pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
            onClick={() => toggleSection("music")}
          >
            <Music2 className="w-3 h-3" /> <span className="flex-1 text-left">Music</span>
            {collapsed.music ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {!collapsed.music && <>

          {/* Track list with per-track sample buttons */}
          <ul className="flex flex-col gap-1 mb-2">
            {AUDIO_PRESETS.map((p) => {
              const isSelected = (script.video.audio?.track ?? "none") === p.track;
              const isPreviewing = previewingTrack === p.track;
              return (
                <li key={p.track} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/15 border border-primary/30" : "hover:bg-accent border border-transparent"
                }`}>
                  {/* Select track */}
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0"
                    onClick={() => {
                      // Stop any preview when selecting
                      if (previewingTrack) { getAmbientPlayer().stop(); setPreviewingTrack(null); }
                      if (!p.track || p.track === "none") { patchAudio(null); return; }
                      patchAudio({ track: p.track, label: p.label });
                    }}
                  >
                    <span className={`text-xs truncate block ${isSelected ? "text-primary font-medium" : "text-foreground"}`}>
                      {p.label}
                    </span>
                    {p.genre && <span className="text-[10px] text-muted-foreground">{p.genre}</span>}
                  </button>

                  {/* Sample play/stop button (not shown for "None") */}
                  {p.track !== "none" && (
                    <button
                      type="button"
                      title={isPreviewing ? "Stop sample" : "Play sample"}
                      className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
                        isPreviewing
                          ? "bg-primary/20 text-primary hover:bg-primary/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const player = getAmbientPlayer();
                        if (isPreviewing) {
                          player.stop();
                          setPreviewingTrack(null);
                        } else {
                          if (previewingTrack) player.stop();
                          player.play(p.track, script.video.audio?.volume ?? 0.6);
                          setPreviewingTrack(p.track);
                        }
                      }}
                    >
                      {isPreviewing
                        ? <Square className="w-2.5 h-2.5 fill-current" />
                        : <Play className="w-2.5 h-2.5 fill-current" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Volume slider — shown when a track is selected */}
          {script.video.audio && script.video.audio.track !== "none" && (
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                className="shrink-0"
                onClick={() => patchAudio({ volume: (script.video.audio?.volume ?? 0.6) > 0 ? 0 : 0.6 })}
              >
                {(script.video.audio.volume ?? 0.6) === 0
                  ? <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
                  : <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              <Slider
                min={0} max={1} step={0.05}
                value={[script.video.audio.volume ?? 0.6]}
                onValueChange={([v]) => {
                  patchAudio({ volume: v });
                  // Also update live preview volume
                  if (previewingTrack) getAmbientPlayer().setVolume(v);
                }}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground w-7 text-right font-mono">
                {Math.round((script.video.audio.volume ?? 0.6) * 100)}%
              </span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
            Music plays during preview and is mixed during export.
          </p>
          </>}
        </section>
      )}

      {/* Bottom links */}
      <div className="mt-auto border-t p-3">
        <Link
          to="/resume-roast"
          className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Flame className="w-4 h-4 text-orange-400" /> Resume Roast
        </Link>
      </div>
    </aside>
  );
}
