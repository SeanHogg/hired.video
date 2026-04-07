// SceneElementsGallery.tsx — gallery of free-form scene elements with add/edit/delete.
//
// Each element is one of: text, image, video, audio. Renders a thumbnail row
// with a (+) button to add new ones. Clicking a thumbnail opens an inline
// editor for that element's content, position, size, and styling.

import { useState, useEffect, useRef } from "react";
import {
  Plus, Type, Image as ImageIcon, Film, Music2, Trash2, Video as VideoIcon,
  ArrowUp, ArrowDown, X, Search, Loader2, Library,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type {
  SceneElement, TextElement, ImageElement, VideoElement, AudioElement,
} from "@/types/video-script";
import {
  searchStockMedia, pickStockMedia,
  type StockSearchResult, type StockMediaType,
} from "@/lib/services/studio-features-service";
import { studioService } from "@/lib/services/studio-service";

// ─── Preset position layouts (% of canvas) ──────────────────────────────────

interface PositionPreset {
  value: string;
  label: string;
  icon: string;
  box: { x: number; y: number; w: number; h: number };
}

const POSITION_PRESETS: PositionPreset[] = [
  { value: "full",        label: "Full",         icon: "■", box: { x: 0,  y: 0,  w: 100, h: 100 } },
  { value: "half-left",   label: "Half left",    icon: "◧", box: { x: 0,  y: 0,  w: 50,  h: 100 } },
  { value: "half-right",  label: "Half right",   icon: "◨", box: { x: 50, y: 0,  w: 50,  h: 100 } },
  { value: "small-left",  label: "Small left",   icon: "◐", box: { x: 5,  y: 20, w: 42,  h: 60 } },
  { value: "small-right", label: "Small right",  icon: "◑", box: { x: 53, y: 20, w: 42,  h: 60 } },
  { value: "corner-tl",   label: "Top left",     icon: "◸", box: { x: 3,  y: 3,  w: 36,  h: 36 } },
  { value: "corner-tr",   label: "Top right",    icon: "◹", box: { x: 61, y: 3,  w: 36,  h: 36 } },
  { value: "corner-bl",   label: "Bottom left",  icon: "◺", box: { x: 3,  y: 61, w: 36,  h: 36 } },
  { value: "corner-br",   label: "Bottom right", icon: "◻", box: { x: 61, y: 61, w: 36,  h: 36 } },
];

// ─── Ken-Burns animation options ────────────────────────────────────────────

const KEN_BURNS = [
  { value: "none",      label: "Static" },
  { value: "zoom-in",   label: "Zoom In" },
  { value: "zoom-out",  label: "Zoom Out" },
  { value: "pan-left",  label: "Pan Left" },
  { value: "pan-right", label: "Pan Right" },
] as const;

interface Props {
  elements: SceneElement[];
  onChange: (next: SceneElement[]) => void;
  /** Optional controlled selection — when set, the editor opens for this element. */
  selectedElementId?: string | null;
  onSelectedElementChange?: (id: string | null) => void;
}

function makeId(): string {
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultText(): TextElement {
  return {
    id: makeId(),
    kind: "text",
    text: "New text",
    box: { x: 10, y: 40, w: 80, h: 20 },
    fontSize: 32,
    fontWeight: "bold",
    color: "#ffffff",
    align: "center",
    verticalAlign: "middle",
    style: { borderRadius: 8, padding: 12 },
  };
}

function defaultImage(url = ""): ImageElement {
  return {
    id: makeId(),
    kind: "image",
    url,
    box: { x: 10, y: 10, w: 80, h: 80 },
    fit: "cover",
    style: { borderRadius: 8 },
  };
}

function defaultVideo(url = ""): VideoElement {
  return {
    id: makeId(),
    kind: "video",
    url,
    box: { x: 10, y: 10, w: 80, h: 80 },
    fit: "cover",
    muted: true,
    loop: true,
    style: { borderRadius: 8 },
  };
}

function defaultAudio(url = "", label = "Audio"): AudioElement {
  return {
    id: makeId(),
    kind: "audio",
    url,
    label,
    volume: 1,
    box: { x: 0, y: 0, w: 0, h: 0 },
  };
}

export default function SceneElementsGallery({
  elements, onChange, selectedElementId, onSelectedElementChange,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [internalEditingId, setInternalEditingId] = useState<string | null>(null);

  // Controlled vs uncontrolled selection
  const editingId = selectedElementId !== undefined ? selectedElementId : internalEditingId;
  function setEditingId(id: string | null) {
    if (selectedElementId !== undefined) {
      onSelectedElementChange?.(id);
    } else {
      setInternalEditingId(id);
    }
  }

  function addElement(el: SceneElement) {
    onChange([...elements, { ...el, z: (elements.length || 0) }]);
    setShowAdd(false);
    setEditingId(el.id);
  }

  function updateElement(id: string, patch: Partial<SceneElement>) {
    onChange(
      elements.map((e) => (e.id === id ? ({ ...e, ...patch } as SceneElement) : e)),
    );
  }

  function removeElement(id: string) {
    onChange(elements.filter((e) => e.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function moveElement(id: string, dir: -1 | 1) {
    const idx = elements.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= elements.length) return;
    const next = [...elements];
    [next[idx], next[target]] = [next[target], next[idx]];
    // Re-assign z so render order matches array order
    onChange(next.map((e, i) => ({ ...e, z: i }) as SceneElement));
  }

  const editing = editingId ? elements.find((e) => e.id === editingId) : null;

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Elements ({elements.length})
        </span>
        <button
          type="button"
          className="flex items-center gap-1 px-2 h-6 text-[10px] rounded-md border border-dashed border-border hover:border-primary/40 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowAdd((v) => !v)}
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {/* Add menu */}
      {showAdd && (
        <div className="grid grid-cols-2 gap-1.5 p-2 rounded-md border border-border bg-muted/30">
          <AddBtn icon={Type} label="Text" onClick={() => addElement(defaultText())} />
          <AddBtn icon={ImageIcon} label="Image" onClick={() => addElement(defaultImage())} />
          <AddBtn icon={Film} label="Video" onClick={() => addElement(defaultVideo())} />
          <AddBtn icon={Music2} label="Audio" onClick={() => addElement(defaultAudio())} />
          <AddBtn icon={VideoIcon} label="Webcam" onClick={() => addElement(defaultVideo())} />
        </div>
      )}

      {/* Gallery */}
      {elements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elements.map((el) => (
            <ElementThumb
              key={el.id}
              element={el}
              selected={editingId === el.id}
              onClick={() => setEditingId(editingId === el.id ? null : el.id)}
              onDelete={() => removeElement(el.id)}
              onMoveUp={() => moveElement(el.id, -1)}
              onMoveDown={() => moveElement(el.id, 1)}
            />
          ))}
        </div>
      )}

      {/* Inline editor */}
      {editing && (
        <ElementEditor
          element={editing}
          onChange={(patch) => updateElement(editing.id, patch)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function AddBtn({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 py-2 rounded border border-border bg-card hover:border-primary/40 hover:bg-accent transition-colors"
    >
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function ElementThumb({
  element, selected, onClick, onDelete, onMoveUp, onMoveDown,
}: {
  element: SceneElement;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative w-16 h-12 rounded-md border overflow-hidden cursor-pointer transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
      onClick={onClick}
    >
      {element.kind === "text" && (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <Type className="w-4 h-4 text-muted-foreground" />
          <span className="text-[8px] truncate ml-0.5">{element.text.slice(0, 8)}</span>
        </div>
      )}
      {element.kind === "image" && (
        element.url ? (
          <img src={element.url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" onError={(e) => (e.target as HTMLImageElement).style.display = "none"} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted"><ImageIcon className="w-4 h-4 text-muted-foreground" /></div>
        )
      )}
      {element.kind === "video" && (
        <div className="w-full h-full flex items-center justify-center bg-muted"><Film className="w-4 h-4 text-muted-foreground" /></div>
      )}
      {element.kind === "audio" && (
        <div className="w-full h-full flex items-center justify-center bg-muted"><Music2 className="w-4 h-4 text-muted-foreground" /></div>
      )}
      <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title="Move back"
          className="w-4 h-4 flex items-center justify-center bg-black/60 text-white hover:bg-black/80"
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
        >
          <ArrowUp className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          title="Move forward"
          className="w-4 h-4 flex items-center justify-center bg-black/60 text-white hover:bg-black/80"
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
        >
          <ArrowDown className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          title="Delete"
          className="w-4 h-4 flex items-center justify-center bg-red-500/80 text-white hover:bg-red-500"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

function ElementEditor({
  element, onChange, onClose,
}: {
  element: SceneElement;
  onChange: (patch: Partial<SceneElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase text-primary">Edit {element.kind}</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Type-specific content fields */}
      {element.kind === "text" && (
        <>
          <Textarea
            className="h-16 text-xs resize-none"
            placeholder="Text content…"
            value={element.text}
            onChange={(e) => onChange({ text: e.target.value } as Partial<TextElement>)}
          />
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Size</span>
              <Input
                type="number"
                value={element.fontSize ?? 32}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) } as Partial<TextElement>)}
                className="h-6 text-[10px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Color</span>
              <input
                type="color"
                value={element.color ?? "#ffffff"}
                onChange={(e) => onChange({ color: e.target.value } as Partial<TextElement>)}
                className="h-6 w-full rounded border border-border bg-transparent"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Align</span>
              <select
                value={element.align ?? "left"}
                onChange={(e) => onChange({ align: e.target.value as "left" | "center" | "right" } as Partial<TextElement>)}
                className="h-6 text-[10px] rounded border border-border bg-transparent"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>

          {/* Preset positions for text — same layouts as images */}
          <div>
            <Label className="text-[10px] text-muted-foreground">Position</Label>
            <div className="grid grid-cols-9 gap-0.5 mt-0.5">
              {POSITION_PRESETS.map((p) => {
                const matches = element.box.x === p.box.x && element.box.y === p.box.y && element.box.w === p.box.w && element.box.h === p.box.h;
                return (
                  <button
                    key={p.value}
                    type="button"
                    title={p.label}
                    className={`h-6 flex items-center justify-center text-xs rounded border transition-colors ${
                      matches
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                    onClick={() => onChange({ box: p.box } as Partial<SceneElement>)}
                  >
                    {p.icon}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {(element.kind === "image" || element.kind === "video") && (
        <>
          <InlineStockPicker
            kind={element.kind}
            currentUrl={element.url}
            onPick={(url) => onChange({ url } as Partial<typeof element>)}
          />

          {/* AI image generation — image elements only */}
          {element.kind === "image" && (
            <AIImageGenerator
              onGenerated={(url) => onChange({ url } as Partial<ImageElement>)}
            />
          )}

          {/* Preset positions — quick layout (Full / Half / Corner) */}
          <div>
            <Label className="text-[10px] text-muted-foreground">Position</Label>
            <div className="grid grid-cols-9 gap-0.5 mt-0.5">
              {POSITION_PRESETS.map((p) => {
                const matches = element.box.x === p.box.x && element.box.y === p.box.y && element.box.w === p.box.w && element.box.h === p.box.h;
                return (
                  <button
                    key={p.value}
                    type="button"
                    title={p.label}
                    className={`h-6 flex items-center justify-center text-xs rounded border transition-colors ${
                      matches
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                    onClick={() => onChange({ box: p.box } as Partial<SceneElement>)}
                  >
                    {p.icon}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fit + animation row */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Fit</span>
              <select
                value={(element as ImageElement).fit ?? "cover"}
                onChange={(e) => onChange({ fit: e.target.value as "cover" | "contain" | "fill" } as Partial<typeof element>)}
                className="h-6 text-[10px] rounded border border-border bg-transparent"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
              </select>
            </label>
            {element.kind === "image" && (
              <label className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Animation</span>
                <select
                  value={(element as ImageElement).animation ?? "none"}
                  onChange={(e) => onChange({ animation: e.target.value as ImageElement["animation"] } as Partial<ImageElement>)}
                  className="h-6 text-[10px] rounded border border-border bg-transparent"
                >
                  {KEN_BURNS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </label>
            )}
          </div>
        </>
      )}

      {element.kind === "audio" && (
        <>
          <Input
            placeholder="Audio URL"
            value={element.url}
            onChange={(e) => onChange({ url: e.target.value } as Partial<AudioElement>)}
            className="h-6 text-[10px]"
          />
          <Input
            placeholder="Label"
            value={element.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value } as Partial<AudioElement>)}
            className="h-6 text-[10px]"
          />
        </>
      )}

      {/* Position & size */}
      {element.kind !== "audio" && (
        <>
          <Label className="text-[10px] text-muted-foreground">Position & Size (% of canvas)</Label>
          <div className="grid grid-cols-4 gap-1.5 text-[10px]">
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">X</span>
              <Input
                type="number"
                value={element.box.x}
                onChange={(e) => onChange({ box: { ...element.box, x: Number(e.target.value) } } as Partial<SceneElement>)}
                className="h-6 text-[10px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Y</span>
              <Input
                type="number"
                value={element.box.y}
                onChange={(e) => onChange({ box: { ...element.box, y: Number(e.target.value) } } as Partial<SceneElement>)}
                className="h-6 text-[10px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">W</span>
              <Input
                type="number"
                value={element.box.w}
                onChange={(e) => onChange({ box: { ...element.box, w: Number(e.target.value) } } as Partial<SceneElement>)}
                className="h-6 text-[10px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">H</span>
              <Input
                type="number"
                value={element.box.h}
                onChange={(e) => onChange({ box: { ...element.box, h: Number(e.target.value) } } as Partial<SceneElement>)}
                className="h-6 text-[10px]"
              />
            </label>
          </div>

          {/* Container styling */}
          <Label className="text-[10px] text-muted-foreground">Container Style</Label>
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Bg</span>
              <input
                type="color"
                value={element.style?.backgroundColor?.startsWith("#") ? element.style.backgroundColor : "#000000"}
                onChange={(e) => onChange({ style: { ...element.style, backgroundColor: e.target.value } } as Partial<SceneElement>)}
                className="h-6 w-full rounded border border-border bg-transparent"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Border</span>
              <input
                type="color"
                value={element.style?.borderColor ?? "#7c3aed"}
                onChange={(e) => onChange({ style: { ...element.style, borderColor: e.target.value, borderWidth: element.style?.borderWidth ?? 2 } } as Partial<SceneElement>)}
                className="h-6 w-full rounded border border-border bg-transparent"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">Radius</span>
              <Input
                type="number"
                value={element.style?.borderRadius ?? 0}
                onChange={(e) => onChange({ style: { ...element.style, borderRadius: Number(e.target.value) } } as Partial<SceneElement>)}
                className="h-6 text-[10px]"
              />
            </label>
          </div>
          {(element.style?.backgroundColor || element.style?.borderColor) && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
              onClick={() => onChange({ style: undefined } as Partial<SceneElement>)}
            >
              Clear container styling
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── AI image generator ────────────────────────────────────────────────────

function AIImageGenerator({ onGenerated }: { onGenerated: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await studioService.generateImage(prompt.trim());
      if (res.data?.imageUrl) {
        onGenerated(res.data.imageUrl);
        setOpen(false);
        setPrompt("");
      }
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="w-full flex items-center justify-center gap-1.5 h-6 text-[10px] text-muted-foreground border border-dashed border-border rounded hover:border-primary/40 hover:text-foreground transition-colors"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-3 h-3" /> Generate with AI
      </button>
    );
  }

  return (
    <div className="space-y-1.5 rounded border border-border p-1.5">
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          placeholder="Describe the image…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleGenerate();
            if (e.key === "Escape") setOpen(false);
          }}
          className="h-6 text-[10px]"
        />
        <button
          type="button"
          disabled={generating || !prompt.trim()}
          onClick={handleGenerate}
          className="h-6 px-2 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Go"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

// ─── Inline stock picker ────────────────────────────────────────────────────

function InlineStockPicker({
  kind, currentUrl, onPick,
}: {
  kind: "image" | "video";
  currentUrl: string;
  onPick: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchStockMedia({ q: query, type: kind as StockMediaType, perPage: 12 });
        setResults(res.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, kind]);

  async function handlePick(item: StockSearchResult) {
    const key = `${item.provider}:${item.providerAssetId}`;
    setPicking(key);
    try {
      const result = await pickStockMedia({ ...item });
      if (result.cdnUrl) onPick(result.cdnUrl);
    } catch {
      // silent — keep current url
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Current source thumbnail */}
      {currentUrl && (
        <div className="flex items-center gap-1.5">
          {kind === "image" ? (
            <img
              src={currentUrl}
              alt=""
              className="w-12 h-8 object-cover rounded border border-border"
              crossOrigin="anonymous"
              onError={(e) => (e.target as HTMLImageElement).style.display = "none"}
            />
          ) : (
            <div className="w-12 h-8 rounded border border-border flex items-center justify-center bg-muted">
              <Film className="w-3 h-3 text-muted-foreground" />
            </div>
          )}
          <span className="flex-1 text-[10px] text-muted-foreground truncate">Current source</span>
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
            onClick={() => setShowUrl((v) => !v)}
          >
            {showUrl ? "Hide URL" : "Edit URL"}
          </button>
        </div>
      )}

      {/* Manual URL fallback */}
      {(showUrl || !currentUrl) && (
        <Input
          placeholder={`Paste ${kind} URL or search below`}
          value={currentUrl}
          onChange={(e) => onPick(e.target.value)}
          className="h-6 text-[10px]"
        />
      )}

      {/* Stock search bar */}
      <div className="relative">
        <Library className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input
          placeholder={`Search Unsplash, Pexels, Pixabay…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-6 text-[10px] pl-6"
        />
        {loading && <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      {/* Results grid */}
      {results.length > 0 && (
        <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto">
          {results.map((item) => {
            const key = `${item.provider}:${item.providerAssetId}`;
            const isPicking = picking === key;
            return (
              <button
                key={key}
                type="button"
                disabled={isPicking}
                onClick={() => handlePick(item)}
                title={`${item.title ?? ""} · ${item.author ?? ""}`}
                className="group relative aspect-square rounded overflow-hidden border border-border hover:border-primary transition-colors"
              >
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  crossOrigin="anonymous"
                />
                {item.mediaType === "video" && (
                  <Film className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white drop-shadow" />
                )}
                {isPicking && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
