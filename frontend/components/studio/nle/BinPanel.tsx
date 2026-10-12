/**
 * BinPanel — searchable / tag-filterable / folder-grouped media bin
 * for the NLE editor. Closes gap entries #347 (bin search + tags) and
 * surfaces the relink action for #346 (offline media).
 *
 * Drives every consumer that needs a "pick a source" affordance —
 * timeline drop targets, multicam-group builder, future B-roll
 * pickers — through ONE component. Per the standing DRY rule, the
 * facets are computed inside the panel; consumers never re-derive
 * them.
 *
 * Self-gates: returns null when the listing fails AND the consumer
 * passed `silentEmpty`. Otherwise shows an empty state.
 */

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Folder,
  Tag as TagIcon,
  Pencil,
  Link2Off,
  Upload,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { nleApi, type NleMediaSourceWithBin } from "@/lib/timeline/api";
import { promptDialog } from "@/lib/dialogs";
import { NLE_SOURCE_DRAG_MIME } from "@/lib/timeline/dnd";
import { probeSource } from "@/lib/timeline/source-probe";
import { maybeGenerateAndUploadProxy } from "@/lib/timeline/source-upload";
import {
  buildBinFolderTree,
  folderMatches,
  normaliseBinFolder,
  type BinFolderNode,
} from "@/lib/timeline/bin-folder-tree";
import { useToast } from "@/hooks/use-toast";
import RelinkSourceDialog from "./RelinkSourceDialog";

interface Props {
  /** Optional pre-fetched list — when present, the panel skips the
   *  initial fetch. Useful for tests and for a future "studio loads
   *  the bin once at boot" path. */
  initial?: NleMediaSourceWithBin[];
  /** Called when the user double-clicks (or activates) a source. The
   *  parent typically inserts the clip onto the active track. */
  onPickSource?: (source: NleMediaSourceWithBin) => void;
  /** Optional extra `dragstart` hook — invoked AFTER the panel sets its
   *  own `NLE_SOURCE_DRAG_MIME`, letting a consumer attach an additional
   *  drag payload (e.g. the studio's `{kind:"music"}` protocol so a bin
   *  audio source can be dragged onto the canvas/timeline as a layer).
   *  The NLE source MIME stays intact for NLE drop targets. */
  onSourceDragStart?: (
    e: React.DragEvent,
    source: NleMediaSourceWithBin,
  ) => void;
  /** Only list sources of these kinds (default: all). A host that can't
   *  use a kind hides it rather than listing items that do nothing. */
  kinds?: ReadonlyArray<NleMediaSourceWithBin["kind"]>;
}

export default function BinPanel({ initial, onPickSource, onSourceDragStart, kinds }: Props) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<NleMediaSourceWithBin[]>(initial ?? []);
  const [loaded, setLoaded] = useState(initial != null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<NleMediaSourceWithBin | null>(null);
  const [relinkTarget, setRelinkTarget] = useState<NleMediaSourceWithBin | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    nleApi
      .listSources()
      .then((res) => {
        if (cancelled) return;
        setSources(res.sources);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  // Facets — derived once per source-list change, NOT per render.
  // Single source of truth for "what tags exist / what folders exist".
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const src of sources) for (const t of src.tags) s.add(t);
    return Array.from(s).sort();
  }, [sources]);

  // Folder tree (#358) — `binFolder` is now a `/`-delimited path; the
  // tree builder normalises and groups by prefix so the picker can show
  // nested folders. Source-of-truth for "what folders exist" lives in
  // [bin-folder-tree.ts](../../../lib/timeline/bin-folder-tree.ts).
  const folderTree = useMemo(
    () => buildBinFolderTree(sources.map((s) => s.binFolder)),
    [sources],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources.filter((s) => {
      if (kinds && !kinds.includes(s.kind)) return false;
      if (activeFolder !== null && !folderMatches(s.binFolder, activeFolder)) {
        return false;
      }
      if (activeTags.size > 0) {
        for (const tag of activeTags) {
          if (!s.tags.includes(tag)) return false;
        }
      }
      if (q && !s.filename.toLowerCase().includes(q) && !s.tags.some((t) => t.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [sources, query, activeTags, activeFolder, kinds]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const onPatched = (next: NleMediaSourceWithBin) => {
    setSources((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  };

  // Probe + upload — shared by the Upload button and any future drop-
  // file-into-panel handler. nleApi.uploadSource dedupes server-side by
  // content hash, so a second upload of the same file returns the
  // existing row instead of growing the bin.
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        try {
          const probed = await probeSource(file);
          const upload = await nleApi.uploadSource(file, {
            kind: probed.kind,
            durationFrames: probed.durationFrames,
            fps: probed.fps,
            width: probed.width ?? null,
            height: probed.height ?? null,
          });
          // The server returns a plain MediaSource; the bin shape adds
          // (folder, tags). Default to root/no-tags so the row appears
          // immediately; the user can edit metadata via the pencil icon.
          const row: NleMediaSourceWithBin = {
            ...upload.source,
            binFolder: null,
            tags: [],
          };
          setSources((prev) =>
            // Server dedupe means we may already have this id — replace
            // to keep filename / metadata authoritative.
            prev.some((s) => s.id === row.id)
              ? prev.map((s) => (s.id === row.id ? row : s))
              : [row, ...prev],
          );
          if (upload.deduped) {
            toast({
              title: "Already in your bin",
              description: file.name,
            });
          }
          // Auto-generate a scrubbing proxy in the background for tall
          // masters. The decision + generate→upload glue lives in
          // `maybeGenerateAndUploadProxy` (shared with the relink flow).
          // Skip when server dedupe already returned a proxy for this same
          // content — `forceRefresh` stays false so an existing proxy is
          // left untouched.
          if (!upload.source.proxyUrl) {
            void maybeGenerateAndUploadProxy(upload.source.id, file, {
              kind: probed.kind,
              height: probed.height,
            }).then((updated) => {
              if (!updated) return;
              setSources((prev) =>
                prev.map((s) =>
                  s.id === updated.id
                    ? { ...updated, binFolder: s.binFolder, tags: s.tags }
                    : s,
                ),
              );
            });
          }
        } catch (err) {
          toast({
            title: `Couldn't add ${file.name}`,
            description: err instanceof Error ? err.message : "Upload failed",
            variant: "destructive",
          });
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className="flex items-center gap-1.5 p-2 border-b">
        <Button
          size="sm"
          variant="default"
          className="h-7 px-2 text-[11px] gap-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Upload media"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          Upload
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search filename or tag…"
            className="h-7 pl-7 text-[11px]"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
              <Folder className="h-3 w-3 mr-1" />
              {activeFolder == null
                ? "All folders"
                : activeFolder === ""
                  ? "(root)"
                  : activeFolder.split("/").pop()}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            <DropdownMenuLabel className="text-[10px] uppercase">Folder</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setActiveFolder(null)}>
              All folders
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveFolder("")}>
              (root)
            </DropdownMenuItem>
            {folderTree.children.length > 0 && <DropdownMenuSeparator />}
            <FolderTreeMenu
              node={folderTree}
              depth={0}
              activeFolder={activeFolder}
              onSelect={(path) => setActiveFolder(path)}
              onRename={async (from) => {
                const to = await promptDialog({
                  title: t("dialogs.bin.moveFolderTitle"),
                  label: t("dialogs.bin.moveFolderLabel", { from }),
                  defaultValue: from,
                  confirmText: t("dialogs.bin.moveFolderConfirm"),
                });
                if (to === null || to === from) return;
                try {
                  await nleApi.renameFolder(from, to);
                  // Update local list — apply the same prefix substitution
                  // so the UI doesn't have to re-fetch.
                  const newTo = normaliseBinFolder(to);
                  const fromLen = from.length;
                  setSources((prev) =>
                    prev.map((s) => {
                      const norm = normaliseBinFolder(s.binFolder);
                      if (!norm) return s;
                      if (norm === from) return { ...s, binFolder: newTo };
                      if (norm.startsWith(`${from}/`)) {
                        const tail = norm.slice(fromLen + 1);
                        return {
                          ...s,
                          binFolder: newTo ? `${newTo}/${tail}` : tail,
                        };
                      }
                      return s;
                    }),
                  );
                  if (activeFolder === from) setActiveFolder(newTo);
                  toast({ title: `Moved "${from}" → ${newTo ?? "(root)"}` });
                } catch (err) {
                  toast({
                    title: "Couldn't rename folder",
                    description: err instanceof Error ? err.message : "Move failed",
                    variant: "destructive",
                  });
                }
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
              <TagIcon className="h-3 w-3 mr-1" />
              Tags{activeTags.size > 0 ? ` · ${activeTags.size}` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-[10px] uppercase">Filter by tag</DropdownMenuLabel>
            {allTags.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No tags yet</div>
            )}
            {allTags.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={activeTags.has(t)}
                onCheckedChange={() => toggleTag(t)}
              >
                {t}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {!loaded && (
          <div className="text-[11px] text-muted-foreground text-center py-6">Loading…</div>
        )}
        {loaded && filtered.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-6">
            {sources.length === 0
              ? "No sources yet — click Upload to add a video, image, or audio file."
              : "No matches."}
          </div>
        )}
        {filtered.map((src) => (
          <div
            key={src.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(NLE_SOURCE_DRAG_MIME, src.id);
              e.dataTransfer.effectAllowed = "copy";
              onSourceDragStart?.(e, src);
            }}
            onDoubleClick={() => onPickSource?.(src)}
            className="group flex items-center gap-2 rounded border bg-background p-1.5 hover:bg-accent cursor-grab"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium truncate">{src.filename}</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <span>{src.kind}</span>
                <span>·</span>
                <span>{Math.round((src.durationFrames / src.fps) * 10) / 10}s</span>
                {src.binFolder && (
                  <>
                    <span>·</span>
                    <span className="truncate">📁 {src.binFolder}</span>
                  </>
                )}
              </div>
              {src.tags.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {src.tags.map((t) => (
                    <Badge key={t} variant="outline" className="h-4 px-1 text-[9px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Edit folder + tags"
                onClick={() => setEditTarget(src)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Relink offline source"
                onClick={() => setRelinkTarget(src)}
              >
                <Link2Off className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {editTarget && (
        <BinMetaDialog
          source={editTarget}
          onClose={() => setEditTarget(null)}
          onPatched={onPatched}
        />
      )}
      {relinkTarget && (
        <RelinkSourceDialog
          source={relinkTarget}
          onClose={() => setRelinkTarget(null)}
          onRelinked={onPatched}
        />
      )}
    </div>
  );
}

/**
 * Recursive folder tree inside the BinPanel's folder dropdown (#358).
 * Each row shows the folder name (indented per depth), the direct-count
 * badge, and a small rename button. Clicking the name filters the bin
 * to that subtree (folderMatches handles "this folder or below").
 */
function FolderTreeMenu({
  node,
  depth,
  activeFolder,
  onSelect,
  onRename,
}: {
  node: BinFolderNode;
  depth: number;
  activeFolder: string | null;
  onSelect: (path: string) => void;
  onRename: (path: string) => void;
}) {
  return (
    <>
      {node.children.map((child) => {
        const active = activeFolder === child.path;
        return (
          <div key={child.path}>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onSelect(child.path);
              }}
              className={active ? "bg-accent" : ""}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              <Folder className="h-3 w-3 mr-1.5 shrink-0" />
              <span className="flex-1 truncate">{child.name}</span>
              {child.directCount > 0 && (
                <span className="text-[9px] text-muted-foreground ml-1">
                  {child.directCount}
                </span>
              )}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                title={`Rename "${child.path}"`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(child.path);
                }}
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
            </DropdownMenuItem>
            {child.children.length > 0 && (
              <FolderTreeMenu
                node={child}
                depth={depth + 1}
                activeFolder={activeFolder}
                onSelect={onSelect}
                onRename={onRename}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Edit folder + tags inline. The dialog itself doesn't know how the
 * parent stores sources — it just calls `onPatched` with the freshly
 * returned row so the parent updates its state. Single mutation path
 * (`nleApi.patchSource`) regardless of which field the user changed.
 */
function BinMetaDialog({
  source,
  onClose,
  onPatched,
}: {
  source: NleMediaSourceWithBin;
  onClose: () => void;
  onPatched: (next: NleMediaSourceWithBin) => void;
}) {
  const [folder, setFolder] = useState(source.binFolder ?? "");
  const [tagsText, setTagsText] = useState(source.tags.join(", "));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const res = await nleApi.patchSource(source.id, {
        binFolder: folder.trim() || null,
        tags,
      });
      onPatched(res.source);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-card border rounded-lg p-4 w-80 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">Edit source metadata</h3>
        <div className="text-[11px] text-muted-foreground truncate">{source.filename}</div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium">Folder</label>
          <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="(root)" className="h-7 text-[11px]" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium">Tags (comma-separated)</label>
          <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="interview, wide, b-roll" className="h-7 text-[11px]" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}
