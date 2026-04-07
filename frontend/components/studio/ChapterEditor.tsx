"use client";

/**
 * ChapterEditor — gap #141 frontend.
 *
 * Edits `studio_chapters` rows for a project. Auto-seeds chapters from the
 * compiled scene boundaries on first open. Exports a YouTube/LinkedIn-ready
 * `0:00 Intro` description text via the /youtube endpoint.
 */

import { useEffect, useState } from "react";
import { Loader2, ListVideo, Plus, Trash2, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  getChapters,
  saveChapters,
  getChaptersAsYoutubeText,
  type VideoChapter,
} from "@/lib/services/studio-features-service";

interface SceneBoundary {
  start: number;
  title: string;
}

interface Props {
  projectId: string | null;
  /** Scene boundaries from the compiled storyboard, used to auto-seed chapters. */
  sceneBoundaries?: SceneBoundary[];
}

interface DraftChapter {
  id?: string;
  title: string;
  startSeconds: number;
}

function formatTimestamp(totalSeconds: number): string {
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export default function ChapterEditor({ projectId, sceneBoundaries }: Props) {
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState<DraftChapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [youtubeText, setYoutubeText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    getChapters(projectId)
      .then((existing: VideoChapter[]) => {
        if (existing.length > 0) {
          setChapters(existing.map((c) => ({ id: c.id, title: c.title, startSeconds: c.startSeconds })));
        } else if (sceneBoundaries && sceneBoundaries.length > 0) {
          // Auto-seed from scene boundaries
          setChapters(sceneBoundaries.map((s) => ({ title: s.title, startSeconds: s.start })));
        } else {
          setChapters([{ title: "Intro", startSeconds: 0 }]);
        }
      })
      .catch(() => setChapters([{ title: "Intro", startSeconds: 0 }]))
      .finally(() => setLoading(false));
  }, [open, projectId, sceneBoundaries]);

  function addChapter() {
    const last = chapters[chapters.length - 1];
    setChapters([
      ...chapters,
      { title: "New chapter", startSeconds: (last?.startSeconds ?? 0) + 10 },
    ]);
  }

  function updateChapter(idx: number, patch: Partial<DraftChapter>) {
    setChapters((c) => c.map((ch, i) => (i === idx ? { ...ch, ...patch } : ch)));
  }

  function removeChapter(idx: number) {
    setChapters((c) => c.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveChapters(projectId, chapters.map((c) => ({ title: c.title, startSeconds: c.startSeconds })));
      const yt = await getChaptersAsYoutubeText(projectId);
      setYoutubeText(yt.text);
    } finally {
      setSaving(false);
    }
  }

  async function copyYoutube() {
    if (!youtubeText) return;
    await navigator.clipboard.writeText(youtubeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId} title="Chapter markers">
          <ListVideo className="w-3.5 h-3.5 mr-1" /> Chapters
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Video Chapters</DialogTitle>
          <DialogDescription>
            YouTube-style markers. Auto-seeded from your scenes; edit titles and timestamps below.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
            {chapters.map((ch, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  value={formatTimestamp(ch.startSeconds)}
                  onChange={(e) => {
                    const parsed = parseTimestamp(e.target.value);
                    if (parsed !== null) updateChapter(idx, { startSeconds: parsed });
                  }}
                  className="h-7 text-xs w-16 font-mono"
                  placeholder="0:00"
                />
                <Input
                  value={ch.title}
                  onChange={(e) => updateChapter(idx, { title: e.target.value })}
                  className="h-7 text-xs flex-1"
                  placeholder="Chapter title"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeChapter(idx)}
                  title="Remove chapter"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addChapter}>
              <Plus className="w-3 h-3 mr-1" /> Add chapter
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || chapters.length === 0}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Save chapters
          </Button>
        </div>

        {youtubeText && (
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                YouTube / LinkedIn description text
              </span>
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={copyYoutube}
              >
                {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap">{youtubeText}</pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
