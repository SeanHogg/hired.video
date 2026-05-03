// StudioSidebar.tsx — project navigation: Create New, Recent, Templates, Roast link.

import { useState, useEffect } from "react";
import { Plus, Clock, LayoutTemplate, Check, ImagePlus, Layers, Palette, Music2, Volume2, VolumeX, Trash2, Play, Square, ChevronDown, ChevronRight, Pencil, Eye, Library, Wand2, PanelLeftClose } from "lucide-react";
import StockMediaPanel from "@/components/studio/StockMediaPanel";
import MediaPicker from "@/components/shared/MediaPicker";
import SubjectChipList from "@/components/studio/SubjectChipList";
import { getProjectStatusMeta } from "@/lib/studio/project-status";
import StudioSettings from "./StudioSettings";
import TemplateList from "@/components/studio/templates/TemplateList";
import type { ContentTemplate } from "@/components/studio/templates/catalog";
import type { StudioProjectState } from "@/types/studio";
import { getAmbientPlayer } from "@/lib/audio/ambient-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import type { VideoScript, VideoTheme, VideoAudio } from "@/types/video-script";
import WorkspaceSwitcher from "@/components/studio/WorkspaceSwitcher";

// ─── Content templates (what kind of video) ──────────────────────────────
// Catalog + ContentTemplate type live in components/studio/templates/catalog
// — re-exported here for the consumers that already import it from this file.

export type { ContentTemplate } from "@/components/studio/templates/catalog";
export { TEMPLATE_CATALOG as CONTENT_TEMPLATES } from "@/components/studio/templates/catalog";

// ─── Visual themes (how it looks) ─────────────────────────────────────────

// Template metadata with visual descriptions. The first three entries are
// the Hook / Story / Pivot worked-example templates referenced from the
// "Video Resume Examples That Land Interviews" blog post — pre-filled
// scene copy so a user can clone and rewrite over the existing structure.
export const TEMPLATES: {
  label: string;
  file: string;
  desc: string;
  colors: string[];
  duration: number;
  motion: string;
  /** Pattern label surfaced on the blog template cards (when present). */
  pattern?: "hook-led" | "story-led" | "pivot-led";
}[] = [
  {
    label: "Hook-Led",
    file: "video-resume-hook-led",
    desc: "60s · Front-loads the achievement · Slate / sky · Fade",
    colors: ["#0f172a", "#38bdf8", "#1e293b"],
    duration: 60,
    motion: "moderate",
    pattern: "hook-led",
  },
  {
    label: "Story-Led",
    file: "video-resume-story-led",
    desc: "75s · One project, deep · Stone / amber · Cut",
    colors: ["#0c0a09", "#f59e0b", "#292524"],
    duration: 75,
    motion: "minimal",
    pattern: "story-led",
  },
  {
    label: "Pivot-Led",
    file: "video-resume-pivot-led",
    desc: "60s · Career switcher narrative · Emerald · Fade",
    colors: ["#064e3b", "#34d399", "#022c22"],
    duration: 60,
    motion: "moderate",
    pattern: "pivot-led",
  },
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

export type BgPreset = {
  label: string;
  /** Value passed as video.theme.background + optional color encoded as "type:color1:color2" */
  value: string;
  preview: string; // CSS background for the swatch
};

export const BG_PRESETS: BgPreset[] = [
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
  /** Open the new-video wizard modal */
  onOpenWizard?: () => void;
  /** Collapse/hide this sidebar (parent owns the visibility state) */
  onCollapseSidebar?: () => void;
  onProjectSelect: (project: StudioProject) => void;
  onDeleteProject?: (id: string) => void;
  onTemplateLoad: (script: VideoScript) => void;
  /** Called when user picks a background preset or uploads a custom image */
  onBackgroundSelect?: (bgValue: string, customImageUrl?: string) => void;
  script?: import("@/types/video-script").VideoScript | null;
  onScriptChange?: (s: import("@/types/video-script").VideoScript) => void;
  /** Currently selected content template */
  contentTemplate?: ContentTemplate;
  /** Called when user selects a content template */
  onContentTemplateSelect?: (template: ContentTemplate) => void;
  /** Currently focused scene id (in storyboard editor) — when set, stock media picks insert into that scene */
  focusedSceneId?: string;
  /** Studio project state — used to render AI / Video settings sections in the sidebar */
  state?: StudioProjectState;
  onStateChange?: (patch: Partial<StudioProjectState>) => void;
  /** Slot for the active project's action cluster — rendered inline under
   *  the highlighted row in Recent. The parent owns the action callbacks
   *  (onSave, onPublish, etc.) so the sidebar stays a thin host. */
  activeProjectActions?: React.ReactNode;
}

// Status label + color now live in the shared `getProjectStatusMeta`
// helper so every surface that shows a project status reads the same
// answer — and so the "Published" → "On Profile" rename only had to
// happen in one place. See lib/studio/project-status.ts for context.

export async function loadTemplate(file: string): Promise<VideoScript | null> {
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
  return { contentTemplates: false, templates: false, backgrounds: false, stockMedia: true, mediaInUse: false, theme: false, music: false };
}

export default function StudioSidebar({ projects, activeProjectId, projectName, onProjectNameChange, onSave, isSaving, onCreateNew, onOpenWizard, onCollapseSidebar, onProjectSelect, onDeleteProject, onTemplateLoad, onBackgroundSelect, script, onScriptChange, contentTemplate, onContentTemplateSelect, focusedSceneId, state, onStateChange, activeProjectActions }: Props) {
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [activeBg, setActiveBg] = useState<string | null>(null);
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  /** Where stock-media picks land. Default = "scene-element" so picks become
   *  visible chips inside the focused scene's elements row — until this default
   *  changed, the user picked a thumbnail in Background mode and saw nothing
   *  in the storyboard card (the bg only changed in the preview canvas), which
   *  read as "stock media is broken." Background and All-Scenes targets remain
   *  available as explicit toggles. */
  const [mediaTarget, setMediaTarget] = useState<"scene-background" | "scene-element" | "all-scenes">("scene-element");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewingTrack, setPreviewingTrack] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);

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

  /** Apply a stock media URL based on the current target (scene-background / scene-overlay / all-scenes). */
  function applyMediaToTarget(cdnUrl: string, mediaType: "image" | "video" | "audio"): boolean {
    if (!script || !onScriptChange) return false;

    // Audio always goes to the focused scene's sceneAudio slot
    if (mediaType === "audio") {
      if (!focusedSceneId) return false;
      onScriptChange({
        ...script,
        scenes: script.scenes.map((s) =>
          s.id === focusedSceneId
            ? { ...s, sceneAudio: cdnUrl, sceneAudioLabel: "Stock audio" }
            : s,
        ),
      });
      return true;
    }

    // Image / video routing
    if (mediaTarget === "all-scenes") {
      // Global theme background — applies to all scenes that don't have their own
      onScriptChange({
        ...script,
        video: {
          ...script.video,
          theme: {
            ...script.video.theme,
            customBackground: cdnUrl,
            customBackgroundType: mediaType === "video" ? "video" : "image",
          },
        },
      });
      return true;
    }

    // Per-scene targets need a focused scene
    if (!focusedSceneId) return false;

    if (mediaTarget === "scene-element") {
      // Append a new free-form element at a sensible default position
      const focused = script.scenes.find((s) => s.id === focusedSceneId);
      const existingCount = focused?.sceneElements?.length ?? 0;
      // Slight cascade so multiple adds don't pile on top of each other
      const offset = (existingCount % 5) * 4;
      const newEl = {
        id: `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        kind: mediaType === "video" ? "video" as const : "image" as const,
        url: cdnUrl,
        box: { x: 10 + offset, y: 10 + offset, w: 40, h: 40 },
        fit: "cover" as const,
        z: existingCount,
        style: { borderRadius: 8 },
      };
      onScriptChange({
        ...script,
        scenes: script.scenes.map((s) =>
          s.id === focusedSceneId
            ? { ...s, sceneElements: [...(s.sceneElements ?? []), newEl] }
            : s,
        ),
      });
      return true;
    }

    // Default: scene-background
    onScriptChange({
      ...script,
      scenes: script.scenes.map((s) =>
        s.id === focusedSceneId
          ? {
              ...s,
              backgroundImage: cdnUrl,
              backgroundMediaType: mediaType === "video" ? "video" : "image",
              backgroundImagePosition: "full",
            }
          : s,
      ),
    });
    return true;
  }

  /** Remove media from a scene or theme. */
  function removeSceneMedia(sceneId: string, kind: "background" | "overlay" | "audio") {
    if (!script || !onScriptChange) return;
    onScriptChange({
      ...script,
      scenes: script.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        if (kind === "background") return { ...s, backgroundImage: undefined, backgroundMediaType: undefined, backgroundImagePosition: undefined, imageAnimation: undefined };
        if (kind === "overlay") return { ...s, overlayMediaUrl: undefined, overlayMediaType: undefined, overlayMediaPosition: undefined, overlayMediaAnimation: undefined };
        return { ...s, sceneAudio: undefined, sceneAudioLabel: undefined };
      }),
    });
  }

  function removeGlobalBackground() {
    if (!script || !onScriptChange) return;
    onScriptChange({
      ...script,
      video: {
        ...script.video,
        theme: { ...script.video.theme, customBackground: undefined, customBackgroundType: undefined },
      },
    });
    setCustomBgUrl(null);
    setActiveBg(null);
  }

  function handleBgPicked(url: string) {
    setCustomBgUrl(url);
    setActiveBg("custom");
    onBackgroundSelect?.("custom", url);
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
      {/* Sidebar header — navigation only. Project title, save and per-
          project actions all live in the workspace header above the editor;
          this row is purely for "where do I want to be?" controls. */}
      <div className="p-3 border-b flex items-center gap-1.5">
        <Button
          className="flex-1 min-w-0"
          size="sm"
          variant="outline"
          onClick={onCreateNew}
        >
          <Plus className="w-4 h-4 mr-2" /> New Video
        </Button>
        {onOpenWizard && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2"
            onClick={onOpenWizard}
            title="Open new video wizard"
          >
            <Wand2 className="w-4 h-4" />
          </Button>
        )}
        {onCollapseSidebar && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2"
            onClick={onCollapseSidebar}
            title="Hide sidebar"
            aria-label="Hide sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        )}
      </div>


      {/* Workspace switcher — self-gating: returns null for users with
          only their personal workspace (no companies, no delegations). */}
      <div className="px-3 pt-3">
        <WorkspaceSwitcher />
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
                /* Active row turns into the project's full action panel —
                   title + status on the header line, then the parent-supplied
                   action cluster (Save + render/share/more) inline below.
                   Everything the user needs lives in this one row. */
                <div className={`rounded-md px-2 py-1.5 transition-colors ${
                  p.id === activeProjectId
                    ? "bg-accent font-medium"
                    : "hover:bg-accent"
                }`}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0 flex flex-col gap-0.5"
                      onClick={() => onProjectSelect(p)}
                      title={p.title}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate flex-1 text-xs">{p.title}</span>
                        {(p.viewCount ?? 0) > 0 && (
                          <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground" title={`${p.viewCount} views · ${p.ctaClickCount ?? 0} CTA clicks`}>
                            <Eye className="w-2.5 h-2.5" />{p.viewCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const meta = getProjectStatusMeta(p.status);
                          return (
                            <Badge className={`text-[10px] ${meta.className}`}>{meta.label}</Badge>
                          );
                        })()}
                        {/* Subject linkage list — many-to-many. Read-only
                            on inactive rows (no unlink); the active row
                            gets the editable version below the action
                            cluster (rendered inline by the parent so it
                            wires to handleLinkSubject / handleUnlinkSubject). */}
                        <SubjectChipList subjects={p.subjects ?? []} />
                      </div>
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
                  {p.id === activeProjectId && activeProjectActions}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Content Templates — what kind of video. Fixed-height scroll keeps
          the list bounded as the catalog grows; one source of truth lives
          in templates/catalog. */}
      <section className="px-3 pb-3 border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
          onClick={() => toggleSection("contentTemplates")}
        >
          <LayoutTemplate className="w-3 h-3" /> <span className="flex-1 text-left">Templates</span>
          {collapsed.contentTemplates ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {!collapsed.contentTemplates && onContentTemplateSelect && (
          <TemplateList
            layout="fixed-1"
            scrollMaxHeight="20rem"
            selected={contentTemplate}
            onSelect={onContentTemplateSelect}
          />
        )}
      </section>

      {/* Visual Themes — how it looks */}
      <section className="px-3 pb-3 border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
          onClick={() => toggleSection("templates")}
        >
          <Palette className="w-3 h-3" /> <span className="flex-1 text-left">Visual Themes</span>
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
                <img src={customBgUrl} className="w-full h-full object-cover" alt="Custom background" crossOrigin="anonymous" />
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
          {/* Background source — Upload / Stock / AI Image */}
          <MediaPicker
            accept="image"
            title="Choose scene background"
            onPick={(asset) => handleBgPicked(asset.url)}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
              >
                <ImagePlus className="w-3 h-3 mr-1.5" />
                {customBgUrl ? "Change background" : "Upload / Stock / AI"}
              </Button>
            }
          />
        </>}
      </section>

      {/* AI + Video settings — moved here from the right panel */}
      {state && onStateChange && (
        <StudioSettings state={state} onStateChange={onStateChange} />
      )}

      {/* Stock Media Library — gap #128 (deduplicated cache) */}
      <section className="px-3 pb-3 border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
          onClick={() => toggleSection("stockMedia")}
        >
          <Library className="w-3 h-3" /> <span className="flex-1 text-left">Stock Media</span>
          {collapsed.stockMedia ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {!collapsed.stockMedia && (
          <>
            {/* Target toggle: where do picks go? */}
            <div className="flex gap-1 mb-1.5">
              {([
                { value: "scene-background", label: "Background" },
                { value: "scene-element",    label: "Add Element" },
                { value: "all-scenes",       label: "All Scenes" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMediaTarget(opt.value)}
                  className={`flex-1 text-[10px] font-medium px-1.5 py-1 rounded border transition-colors ${
                    mediaTarget === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Status hint */}
            {(() => {
              const focusedScene = focusedSceneId
                ? script?.scenes.find((s) => s.id === focusedSceneId)
                : null;
              const focusedIdx = focusedScene
                ? (script?.scenes.findIndex((s) => s.id === focusedSceneId) ?? -1) + 1
                : 0;
              if (mediaTarget === "all-scenes") {
                return (
                  <div className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 mb-1.5 text-[10px]">
                    <p className="text-primary font-semibold">All scenes</p>
                    <p className="text-muted-foreground leading-tight mt-0.5">
                      Picks will set the storyboard-wide background. Individual scene backgrounds override it.
                    </p>
                  </div>
                );
              }
              if (focusedScene) {
                const description =
                  mediaTarget === "scene-element"
                    ? "Picks will be added as a new element you can position freely."
                    : "Picks will replace this scene's full background.";
                return (
                  <div className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 mb-1.5 text-[10px]">
                    <p className="text-primary font-semibold">
                      Scene {focusedIdx}: {focusedScene.title ?? focusedScene.type}
                    </p>
                    <p className="text-muted-foreground leading-tight mt-0.5">
                      {description}
                    </p>
                  </div>
                );
              }
              return (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 mb-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                  Click a scene in the storyboard first to target it.
                </div>
              );
            })()}
            <StockMediaPanel
              projectId={activeProjectId ?? undefined}
              sceneId={focusedSceneId}
              onPick={(result) => {
                if (!result.cdnUrl) return;
                applyMediaToTarget(result.cdnUrl, result.mediaType);
              }}
              onPickRecent={(item) => {
                if (!item.cdnUrl) return;
                applyMediaToTarget(item.cdnUrl, item.mediaType);
              }}
            />
          </>
        )}
      </section>

      {/* Media in Use — per-scene + global inventory with remove buttons */}
      {script && (script.video.theme.customBackground || script.scenes.some((s) => s.backgroundImage || s.overlayMediaUrl || s.sceneAudio)) && (
        <section className="px-3 pb-3 border-t pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 w-full text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 hover:text-foreground transition-colors"
            onClick={() => toggleSection("mediaInUse")}
          >
            <ImagePlus className="w-3 h-3" /> <span className="flex-1 text-left">Media in Use</span>
            {collapsed.mediaInUse ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {!collapsed.mediaInUse && (
            <ul className="flex flex-col gap-1.5">
              {/* Global storyboard background */}
              {script.video.theme.customBackground && (
                <li className="rounded-md border border-primary/30 bg-primary/5 p-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-semibold text-primary">All Scenes</span>
                    <span className="text-muted-foreground/70">Storyboard background</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {script.video.theme.customBackgroundType === "video" ? (
                      <div className="w-12 h-8 rounded border border-border shrink-0 flex items-center justify-center bg-muted">
                        <Music2 className="w-3 h-3 text-muted-foreground" />
                      </div>
                    ) : (
                      <img
                        src={script.video.theme.customBackground}
                        alt=""
                        className="w-12 h-8 object-cover rounded border border-border shrink-0"
                        crossOrigin="anonymous"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <span className="flex-1 truncate text-muted-foreground">
                      {script.video.theme.customBackgroundType === "video" ? "Video" : "Image"}
                    </span>
                    <button
                      type="button"
                      title="Remove storyboard background"
                      className="shrink-0 p-0.5 rounded hover:text-red-400 text-muted-foreground transition-colors"
                      onClick={removeGlobalBackground}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              )}
              {/* Per-scene media */}
              {script.scenes.map((s, i) => {
                if (!s.backgroundImage && !s.overlayMediaUrl && !s.sceneAudio) return null;
                const isVideoBg = s.backgroundMediaType === "video";
                const isVideoOverlay = s.overlayMediaType === "video";
                return (
                  <li key={s.id} className="rounded-md border border-border bg-card p-1.5 text-[10px]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-semibold text-muted-foreground">Scene {i + 1}</span>
                      <span className="truncate text-muted-foreground/70">{s.title ?? s.type}</span>
                    </div>
                    {s.backgroundImage && (
                      <div className="flex items-center gap-1.5">
                        {isVideoBg ? (
                          <div className="w-12 h-8 rounded border border-border shrink-0 flex items-center justify-center bg-muted">
                            <Music2 className="w-3 h-3 text-muted-foreground" />
                          </div>
                        ) : (
                          <img
                            src={s.backgroundImage}
                            alt=""
                            className="w-12 h-8 object-cover rounded border border-border shrink-0"
                            crossOrigin="anonymous"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <span className="flex-1 truncate text-muted-foreground">
                          Background ({isVideoBg ? "video" : "image"})
                        </span>
                        <button
                          type="button"
                          title="Remove background"
                          className="shrink-0 p-0.5 rounded hover:text-red-400 text-muted-foreground transition-colors"
                          onClick={() => removeSceneMedia(s.id, "background")}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {s.overlayMediaUrl && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {isVideoOverlay ? (
                          <div className="w-12 h-8 rounded border border-border shrink-0 flex items-center justify-center bg-muted">
                            <Music2 className="w-3 h-3 text-muted-foreground" />
                          </div>
                        ) : (
                          <img
                            src={s.overlayMediaUrl}
                            alt=""
                            className="w-12 h-8 object-cover rounded border border-border shrink-0"
                            crossOrigin="anonymous"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <span className="flex-1 truncate text-muted-foreground">
                          Overlay ({isVideoOverlay ? "video" : "image"})
                        </span>
                        <button
                          type="button"
                          title="Remove overlay"
                          className="shrink-0 p-0.5 rounded hover:text-red-400 text-muted-foreground transition-colors"
                          onClick={() => removeSceneMedia(s.id, "overlay")}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {s.sceneAudio && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Music2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate text-muted-foreground">{s.sceneAudioLabel ?? "Audio"}</span>
                        <button
                          type="button"
                          title="Remove audio"
                          className="shrink-0 p-0.5 rounded hover:text-red-400 text-muted-foreground transition-colors"
                          onClick={() => removeSceneMedia(s.id, "audio")}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

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

          {/* Filters / colour grading — gap #125 */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">Filters</Label>
              {script.video.theme.filters && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => patchTheme({ filters: undefined })}
                  title="Reset all filters"
                >
                  Reset
                </button>
              )}
            </div>
            {([
              { key: "brightness", label: "Brightness", min: 0.5, max: 1.5, step: 0.05, def: 1 },
              { key: "contrast",   label: "Contrast",   min: 0.5, max: 1.5, step: 0.05, def: 1 },
              { key: "saturation", label: "Saturation", min: 0,   max: 2,   step: 0.05, def: 1 },
              { key: "warmth",     label: "Warmth",     min: -100, max: 100, step: 5,    def: 0 },
              { key: "blur",       label: "Blur",       min: 0,    max: 10,  step: 0.5,  def: 0 },
            ] as const).map((cfg) => {
              const current = (script.video.theme.filters as any)?.[cfg.key] ?? cfg.def;
              return (
                <div key={cfg.key} className="mb-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {Number(current).toFixed(cfg.step < 1 ? 2 : 0)}
                    </span>
                  </div>
                  <Slider
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={[current]}
                    onValueChange={(v) => patchTheme({
                      filters: { ...script.video.theme.filters, [cfg.key]: v[0] },
                    })}
                  />
                </div>
              );
            })}
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

    </aside>
  );
}
