/**
 * InteractiveCanvasEditor — host-agnostic editor for an
 * InteractiveCanvas. Mounts on resume sub-records (Employment,
 * Volunteer, Project, Education, Certification), company sections,
 * profile sections, job postings — anywhere a record wants to author
 * an interactive overlay.
 *
 * Lean by design:
 *   • Element kinds: text, chart, image, video, audio, chips, webcam
 *     — same union the studio uses, but without the studio's
 *     stock-media picker / AI banner generator (those stay scoped
 *     to SceneElementsGallery for now).
 *   • Live preview at the top via the shared
 *     `<InteractiveCanvasView>`, so authors see exactly what the
 *     read-only viewer will render.
 *   • Per-element editor bodies inline below the element list.
 *
 * Per the DRY rule: this editor and the studio's
 * SceneElementsGallery operate on the SAME element union, so a canvas
 * authored on a resume Work entry could be mounted in a video scene
 * verbatim and vice versa. The renderer is shared too —
 * `<RenderableElementView>` + `<InteractiveCanvasView>`.
 */

import { useState } from "react";
import {
  BarChart3,
  Camera,
  Film,
  Image as ImageIcon,
  Music2,
  Plus,
  Tags,
  Trash2,
  Type,
  Video as VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import InteractiveCanvasView from "@/components/renderable/InteractiveCanvasView";
import {
  isInteractiveCanvas,
  makeEmptyCanvas,
  type ChartElement,
  type ChipsElement,
  type ImageElement,
  type InteractiveCanvas,
  type RenderableElement,
  type RenderableElementKind,
  type TextElement,
  type VideoElement,
  type WebcamElement,
  type AudioElement,
} from "@/types/renderable-element";
import { cn } from "@/lib/utils";

interface InteractiveCanvasEditorProps {
  /** Current canvas — may be undefined; the editor self-seeds an empty
   *  one on first mutation. */
  canvas: InteractiveCanvas | null | undefined;
  onChange: (next: InteractiveCanvas) => void;
  /** Hint passed to the live preview's aspect frame. Defaults to 16:9. */
  previewAspectRatio?: number | string;
  className?: string;
}

function makeId(): string {
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const DEFAULT_BOX = { x: 10, y: 15, w: 80, h: 70 };

const FACTORIES: Record<RenderableElementKind, () => RenderableElement> = {
  text: (): TextElement => ({
    id: makeId(),
    kind: "text",
    text: "New text",
    box: { x: 10, y: 40, w: 80, h: 20 },
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    align: "center",
    verticalAlign: "middle",
    style: { borderRadius: 8, padding: 12, backgroundColor: "rgba(0,0,0,0.4)" },
  }),
  image: (): ImageElement => ({
    id: makeId(),
    kind: "image",
    url: "",
    box: DEFAULT_BOX,
    fit: "cover",
    style: { borderRadius: 8 },
  }),
  video: (): VideoElement => ({
    id: makeId(),
    kind: "video",
    url: "",
    box: DEFAULT_BOX,
    fit: "cover",
    muted: true,
    loop: true,
    style: { borderRadius: 8 },
  }),
  audio: (): AudioElement => ({
    id: makeId(),
    kind: "audio",
    url: "",
    label: "Audio clip",
    volume: 1,
    box: { x: 5, y: 70, w: 90, h: 20 },
  }),
  chips: (): ChipsElement => ({
    id: makeId(),
    kind: "chips",
    chips: ["Highlight 1", "Highlight 2"],
    box: { x: 5, y: 65, w: 90, h: 25 },
    fontSize: 22,
    chipColor: "rgba(16,185,129,0.20)",
    textColor: "#6ee7b7",
    direction: "row",
  }),
  chart: (): ChartElement => ({
    id: makeId(),
    kind: "chart",
    chartType: "bar",
    data: "category,value\nQ1,42\nQ2,65\nQ3,58\nQ4,81",
    format: "csv",
    title: "Quarterly results",
    box: DEFAULT_BOX,
    style: { borderRadius: 8, padding: 12 },
  }),
  webcam: (): WebcamElement => ({
    id: makeId(),
    kind: "webcam",
    recordingUrl: null,
    mirror: true,
    muted: false,
    box: DEFAULT_BOX,
    style: { borderRadius: 8 },
  }),
};

const ADD_BUTTONS: Array<{ kind: RenderableElementKind; label: string; icon: LucideIcon }> = [
  { kind: "text", label: "Text", icon: Type },
  { kind: "chips", label: "Chips", icon: Tags },
  { kind: "image", label: "Image", icon: ImageIcon },
  { kind: "video", label: "Video", icon: Film },
  { kind: "audio", label: "Audio", icon: Music2 },
  { kind: "chart", label: "Chart", icon: BarChart3 },
  { kind: "webcam", label: "Webcam", icon: Camera },
];

export default function InteractiveCanvasEditor({
  canvas,
  onChange,
  previewAspectRatio,
  className,
}: InteractiveCanvasEditorProps) {
  const safe = isInteractiveCanvas(canvas) ? canvas : makeEmptyCanvas();
  const [editingId, setEditingId] = useState<string | null>(null);

  function patchCanvas(patch: Partial<InteractiveCanvas>) {
    onChange({ ...safe, ...patch });
  }

  function addElement(kind: RenderableElementKind) {
    const next = FACTORIES[kind]();
    onChange({ ...safe, elements: [...safe.elements, next] });
    setEditingId(next.id);
  }

  function patchElement(id: string, patch: Partial<RenderableElement>) {
    const nextElements = safe.elements.map((el) =>
      el.id === id ? ({ ...el, ...patch } as RenderableElement) : el,
    );
    onChange({ ...safe, elements: nextElements });
  }

  function removeElement(id: string) {
    if (editingId === id) setEditingId(null);
    onChange({ ...safe, elements: safe.elements.filter((el) => el.id !== id) });
  }

  const editing = editingId ? safe.elements.find((el) => el.id === editingId) ?? null : null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Live preview — same component the read-only viewer mounts. */}
      {safe.elements.length > 0 && (
        <div className="rounded-md border bg-muted/10 overflow-hidden">
          <InteractiveCanvasView canvas={safe} aspectRatio={previewAspectRatio} />
        </div>
      )}

      {/* Add menu */}
      <div className="flex flex-wrap gap-1.5">
        {ADD_BUTTONS.map(({ kind, label, icon: Icon }) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => addElement(kind)}
          >
            <Icon className="w-3 h-3" />
            {label}
          </Button>
        ))}
      </div>

      {/* Element list */}
      {safe.elements.length > 0 && (
        <ul className="flex flex-col gap-1">
          {safe.elements.map((el) => (
            <li
              key={el.id}
              className={cn(
                "flex items-center gap-1.5 rounded border px-2 py-1.5 transition-colors cursor-pointer",
                editingId === el.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent",
              )}
              onClick={() => setEditingId(editingId === el.id ? null : el.id)}
            >
              <ElementKindIcon kind={el.kind} />
              <span className="flex-1 text-xs truncate">{summariseElement(el)}</span>
              <button
                type="button"
                title="Delete"
                className="text-muted-foreground hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  removeElement(el.id);
                }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Per-element editor */}
      {editing && (
        <div className="rounded-md border bg-muted/10 p-3" onClick={(e) => e.stopPropagation()}>
          <ElementEditor element={editing} onPatch={(patch) => patchElement(editing.id, patch)} />
          <Label className="text-[10px] text-muted-foreground mt-3 block">Position & size (% of canvas)</Label>
          <div className="grid grid-cols-4 gap-1.5 text-[10px] mt-1">
            {(["x", "y", "w", "h"] as const).map((axis) => (
              <label key={axis} className="flex flex-col gap-0.5">
                <span className="text-muted-foreground uppercase">{axis}</span>
                <Input
                  type="number"
                  value={editing.box[axis]}
                  onChange={(e) =>
                    patchElement(editing.id, {
                      box: { ...editing.box, [axis]: Number(e.target.value) },
                    } as Partial<RenderableElement>)
                  }
                  className="h-6 text-[10px]"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Optional canvas background */}
      <div className="flex items-center gap-2 text-[11px]">
        <Label className="text-muted-foreground">Canvas background</Label>
        <Input
          className="h-7 text-[11px] flex-1"
          placeholder="(none) — try linear-gradient(135deg,#7c3aed,#2563eb)"
          value={safe.background ?? ""}
          onChange={(e) => patchCanvas({ background: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

function ElementKindIcon({ kind }: { kind: RenderableElementKind }) {
  const map: Record<RenderableElementKind, LucideIcon> = {
    text: Type,
    image: ImageIcon,
    video: VideoIcon,
    audio: Music2,
    chips: Tags,
    chart: BarChart3,
    webcam: Camera,
  };
  const Icon = map[kind];
  return <Icon className="w-3 h-3 text-muted-foreground shrink-0" />;
}

function summariseElement(el: RenderableElement): string {
  switch (el.kind) {
    case "text":   return el.text || "(empty text)";
    case "image":  return el.url ? "Image" : "(no URL set)";
    case "video":  return el.url ? "Video" : "(no URL set)";
    case "audio":  return el.label || "Audio";
    case "chips":  return `Chips (${el.chips.length})`;
    case "chart":  return `${el.chartType} chart${el.title ? ` — ${el.title}` : ""}`;
    case "webcam": return el.recordingUrl ? "Webcam (recorded)" : "Webcam (live)";
  }
}

function ElementEditor({
  element,
  onPatch,
}: {
  element: RenderableElement;
  onPatch: (patch: Partial<RenderableElement>) => void;
}) {
  switch (element.kind) {
    case "text":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Text</Label>
          <Textarea
            value={element.text}
            onChange={(e) => onPatch({ text: e.target.value } as Partial<TextElement>)}
            className="min-h-[60px] text-xs"
          />
        </div>
      );
    case "image":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Image URL</Label>
          <Input
            value={element.url}
            onChange={(e) => onPatch({ url: e.target.value } as Partial<ImageElement>)}
            className="h-7 text-xs"
            placeholder="https://…"
          />
        </div>
      );
    case "video":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Video URL</Label>
          <Input
            value={element.url}
            onChange={(e) => onPatch({ url: e.target.value } as Partial<VideoElement>)}
            className="h-7 text-xs"
            placeholder="https://… (mp4, webm)"
          />
        </div>
      );
    case "audio":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Audio URL</Label>
          <Input
            value={element.url}
            onChange={(e) => onPatch({ url: e.target.value } as Partial<AudioElement>)}
            className="h-7 text-xs"
            placeholder="https://… (mp3, wav)"
          />
        </div>
      );
    case "chips":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Chips (one per line)</Label>
          <Textarea
            value={element.chips.join("\n")}
            onChange={(e) =>
              onPatch({
                chips: e.target.value.split("\n").map((c) => c.trim()).filter(Boolean),
              } as Partial<ChipsElement>)
            }
            className="min-h-[60px] text-xs font-mono"
          />
        </div>
      );
    case "chart":
      return (
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Chart type</Label>
          <div className="grid grid-cols-4 gap-1">
            {(["bar", "line", "pie", "scatter"] as const).map((t) => {
              const on = element.chartType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPatch({ chartType: t } as Partial<ChartElement>)}
                  className={cn(
                    "px-2 py-1 rounded border text-[10px] font-medium transition-colors",
                    on
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <Label className="text-[10px] text-muted-foreground mt-1">Title</Label>
          <Input
            value={element.title ?? ""}
            onChange={(e) => onPatch({ title: e.target.value } as Partial<ChartElement>)}
            className="h-7 text-xs"
          />
          <Label className="text-[10px] text-muted-foreground mt-1">Data (CSV / TSV / JSON)</Label>
          <Textarea
            value={element.data}
            onChange={(e) => {
              const next = e.target.value;
              const fmt = next.trim().startsWith("[") || next.trim().startsWith("{")
                ? "json"
                : next.includes("\t") ? "tsv" : next.includes(",") ? "csv" : undefined;
              onPatch({ data: next, format: fmt } as Partial<ChartElement>);
            }}
            className="min-h-[80px] text-[10px] font-mono"
          />
          <Label className="text-[10px] text-muted-foreground mt-1">Takeaway</Label>
          <Input
            value={element.takeaway ?? ""}
            onChange={(e) => onPatch({ takeaway: e.target.value } as Partial<ChartElement>)}
            className="h-7 text-xs"
          />
        </div>
      );
    case "webcam":
      return (
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <p>Live camera — viewers click "Enable camera" to grant access.</p>
          <Label className="text-[10px] text-muted-foreground mt-1">Recording URL (optional)</Label>
          <Input
            value={element.recordingUrl ?? ""}
            onChange={(e) =>
              onPatch({ recordingUrl: e.target.value || null } as Partial<WebcamElement>)
            }
            className="h-7 text-xs"
            placeholder="Pre-recorded clip URL — overrides live"
          />
          <label className="flex items-center gap-1 mt-1 text-[11px]">
            <input
              type="checkbox"
              checked={element.mirror !== false}
              onChange={(e) => onPatch({ mirror: e.target.checked } as Partial<WebcamElement>)}
            />
            Mirror (selfie cam)
          </label>
        </div>
      );
  }
}
