import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  GraduationCap,
  FileText,
  Video,
  Link as LinkIcon,
  Package,
  Pencil,
} from "lucide-react";
import { SortableList, SortableDragHandle } from "@/components/resume-sections/SortableList";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  courseService,
  type CourseLesson,
  type CourseLessonSourceType,
  type CourseModule,
  type ScormVersion,
} from "@/lib/services/course-service";

/**
 * CourseContentEditor — module + lesson authoring tree for a single course.
 *
 * Used by:
 *   • [CoursesManagerPanel](./CoursesManagerPanel.tsx) — the in-services
 *     creator-program surface at /services/creator/courses
 *   • Any future stand-alone /courses/:id editor route
 *
 * Self-fetches `courseService.getDetails(courseId)`; the parent only
 * has to pass `courseId`. Lesson source types covered:
 *   - text_md      → markdown textarea (shipped seed lessons use this)
 *   - studio_video → existing studio project id input (the Save-as-Course
 *                    -Lesson handoff from [StudioEditorV2](../../pages/studio/v2/StudioEditorV2.tsx)
 *                    populates this without the user typing it)
 *   - scorm_package → manifest URL + entry URL + version (lets the
 *                     SCORM player runtime mount the package — full
 *                     zip-upload pipeline tracked as #161 / #1400)
 *   - external_url → arbitrary URL (legacy import path)
 *
 * Per `feedback_extract_on_duplication`: source-type-specific fields
 * render via one switch on `form.sourceType` — no `canX` boolean
 * prop-drilling, no parallel forms. The Lesson dialog handles
 * create + edit + delete from one render path.
 */

const LESSON_SOURCE_OPTIONS: { value: CourseLessonSourceType; label: string; icon: typeof FileText }[] = [
  { value: "text_md",       label: "Markdown text",          icon: FileText },
  { value: "studio_video",  label: "Studio video project",   icon: Video },
  { value: "scorm_package", label: "SCORM 1.2 / 2004 package", icon: Package },
  { value: "external_url",  label: "External URL",            icon: LinkIcon },
];

const SCORM_VERSION_OPTIONS: ScormVersion[] = ["1.2", "2004_1", "2004_2", "2004_3", "2004_4"];

const SOURCE_ICON: Record<CourseLessonSourceType, typeof FileText> = {
  text_md: FileText,
  studio_video: Video,
  scorm_package: Package,
  external_url: LinkIcon,
};

interface LessonFormState {
  title: string;
  summary: string;
  moduleId: string | null;
  sourceType: CourseLessonSourceType;
  bodyMd: string;
  studioProjectId: string;
  scormManifestUrl: string;
  scormEntryUrl: string;
  scormVersion: ScormVersion;
  externalUrl: string;
  estimatedMinutes: string;
  isRequired: boolean;
}

function emptyLessonForm(moduleId: string | null): LessonFormState {
  return {
    title: "",
    summary: "",
    moduleId,
    sourceType: "text_md",
    bodyMd: "",
    studioProjectId: "",
    scormManifestUrl: "",
    scormEntryUrl: "",
    scormVersion: "1.2",
    externalUrl: "",
    estimatedMinutes: "",
    isRequired: true,
  };
}

function lessonToForm(l: CourseLesson): LessonFormState {
  return {
    title: l.title,
    summary: l.summary ?? "",
    moduleId: l.moduleId,
    sourceType: l.sourceType,
    bodyMd: l.bodyMd ?? "",
    studioProjectId: l.studioProjectId ?? "",
    scormManifestUrl: l.scormManifestUrl ?? "",
    scormEntryUrl: l.scormEntryUrl ?? "",
    scormVersion: (l.scormVersion ?? "1.2"),
    externalUrl: l.externalUrl ?? "",
    estimatedMinutes: l.estimatedMinutes != null ? String(l.estimatedMinutes) : "",
    isRequired: l.isRequired,
  };
}

interface Props {
  courseId: string;
}

export default function CourseContentEditor({ courseId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [lessons, setLessons] = useState<CourseLesson[]>([]);

  // Module add/edit state — inline row at the bottom of the module list.
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [savingModule, setSavingModule] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editingModuleTitle, setEditingModuleTitle] = useState("");

  // Lesson dialog (create + edit + delete).
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [lessonForm, setLessonForm] = useState<LessonFormState>(emptyLessonForm(null));
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [savingLesson, setSavingLesson] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    courseService
      .getDetails(courseId)
      .then(({ modules: m, lessons: l }) => {
        if (cancelled) return;
        setModules(m);
        setLessons(l);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast({
          title: "Couldn't load course content",
          description: e instanceof Error ? e.message : "Try again",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, toast]);

  const lessonsByModule = useMemo(() => {
    const map = new Map<string | null, CourseLesson[]>();
    for (const l of lessons) {
      const key = l.moduleId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [lessons]);

  // ── Module handlers ──
  const addModule = async () => {
    const title = newModuleTitle.trim();
    if (!title) return;
    setSavingModule(true);
    try {
      const created = await courseService.addModule(courseId, {
        title,
        sortOrder: modules.length,
      });
      setModules((cur) => [...cur, created]);
      setNewModuleTitle("");
    } catch (e: unknown) {
      toast({ title: "Add module failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSavingModule(false);
    }
  };

  const saveModuleEdit = async () => {
    if (!editingModuleId) return;
    const title = editingModuleTitle.trim();
    if (!title) return;
    try {
      const updated = await courseService.updateModule(editingModuleId, { title });
      setModules((cur) => cur.map((m) => (m.id === updated.id ? updated : m)));
      setEditingModuleId(null);
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const removeModule = async (m: CourseModule) => {
    if (!confirm(`Delete module "${m.title}"? Lessons inside it will also be deleted.`)) return;
    const previousModules = modules;
    const previousLessons = lessons;
    setModules((cur) => cur.filter((x) => x.id !== m.id));
    setLessons((cur) => cur.filter((x) => x.moduleId !== m.id));
    try {
      await courseService.removeModule(m.id);
    } catch (e: unknown) {
      setModules(previousModules);
      setLessons(previousLessons);
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  // #1411 — drag-handle reorder via dnd-kit. SortableList hands us the
  // already-rearranged array; we recompute sortOrder by position and PATCH
  // every changed row. One handler covers modules + lessons (DRY:
  // computeAndPersistOrder is sort-target-agnostic).
  const persistOrder = async <T extends { id: string; sortOrder: number }>(
    next: T[],
    patch: (id: string, sortOrder: number) => Promise<unknown>,
  ): Promise<void> => {
    const changes = next
      .map((row, i) => ({ id: row.id, oldOrder: row.sortOrder, newOrder: i }))
      .filter((c) => c.oldOrder !== c.newOrder);
    if (changes.length === 0) return;
    try {
      await Promise.all(changes.map((c) => patch(c.id, c.newOrder)));
    } catch (e: unknown) {
      toast({
        title: "Reorder failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const reorderModules = (next: CourseModule[]) => {
    const renumbered = next.map((m, i) => ({ ...m, sortOrder: i }));
    setModules(renumbered);
    void persistOrder(next, (id, sortOrder) => courseService.updateModule(id, { sortOrder }));
  };

  const reorderLessons = (next: CourseLesson[]) => {
    const renumbered = next.map((l, i) => ({ ...l, sortOrder: i }));
    setLessons((cur) => {
      const others = cur.filter((l) => !renumbered.some((r) => r.id === l.id));
      return [...others, ...renumbered];
    });
    void persistOrder(next, (id, sortOrder) => courseService.updateLesson(id, { sortOrder }));
  };

  // ── Lesson handlers ──
  const openCreateLesson = (moduleId: string | null) => {
    setEditingLessonId(null);
    setLessonForm(emptyLessonForm(moduleId));
    setLessonDialogOpen(true);
  };

  const openEditLesson = (l: CourseLesson) => {
    setEditingLessonId(l.id);
    setLessonForm(lessonToForm(l));
    setLessonDialogOpen(true);
  };

  const saveLesson = async () => {
    const title = lessonForm.title.trim();
    if (!title) {
      toast({ title: "Lesson title required", variant: "destructive" });
      return;
    }
    const payload = {
      title,
      summary: lessonForm.summary.trim() || undefined,
      moduleId: lessonForm.moduleId,
      sourceType: lessonForm.sourceType,
      bodyMd: lessonForm.sourceType === "text_md" ? (lessonForm.bodyMd || null) : null,
      studioProjectId: lessonForm.sourceType === "studio_video" ? (lessonForm.studioProjectId.trim() || null) : null,
      scormManifestUrl: lessonForm.sourceType === "scorm_package" ? (lessonForm.scormManifestUrl.trim() || null) : null,
      scormEntryUrl: lessonForm.sourceType === "scorm_package" ? (lessonForm.scormEntryUrl.trim() || null) : null,
      scormVersion: lessonForm.sourceType === "scorm_package" ? lessonForm.scormVersion : null,
      externalUrl: lessonForm.sourceType === "external_url" ? (lessonForm.externalUrl.trim() || null) : null,
      estimatedMinutes: lessonForm.estimatedMinutes ? parseInt(lessonForm.estimatedMinutes, 10) : undefined,
      isRequired: lessonForm.isRequired,
    };
    setSavingLesson(true);
    try {
      const saved = editingLessonId
        ? await courseService.updateLesson(editingLessonId, payload)
        : await courseService.addLesson(courseId, {
            ...payload,
            sortOrder: (lessonsByModule.get(lessonForm.moduleId)?.length ?? 0),
          });
      setLessons((cur) => {
        const filtered = cur.filter((x) => x.id !== saved.id);
        return [...filtered, saved];
      });
      setLessonDialogOpen(false);
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSavingLesson(false);
    }
  };

  const removeLesson = async (l: CourseLesson) => {
    if (!confirm(`Delete lesson "${l.title}"?`)) return;
    const previous = lessons;
    setLessons((cur) => cur.filter((x) => x.id !== l.id));
    try {
      await courseService.removeLesson(l.id);
    } catch (e: unknown) {
      setLessons(previous);
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading modules & lessons…
        </CardContent>
      </Card>
    );
  }

  const unsorted = lessonsByModule.get(null) ?? [];

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" /> Modules &amp; lessons
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Organise the course into modules; add lessons of any source type
              (markdown, Studio video, SCORM 1.2 / 2004 package, or external URL).
              The published course needs at least one lesson before the Publish
              gate will let it go live.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/studio?contentTemplate=course-lesson-explainer">
              <Video className="h-3.5 w-3.5 mr-1" /> Author a video lesson in Studio
            </Link>
          </Button>
        </div>

        {/* Module list */}
        <div className="space-y-3">
          {modules.length === 0 && unsorted.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No modules yet. Add your first below — modules group lessons into chapters.
            </div>
          ) : null}

          <SortableList items={modules} getId={(m) => m.id} onReorder={reorderModules}>
            {(m) => {
              const moduleLessons = lessonsByModule.get(m.id) ?? [];
              const isEditing = editingModuleId === m.id;
              return (
                <div className="rounded-md border bg-card/30 mb-3">
                  <div className="flex items-center gap-2 p-3 border-b">
                    <SortableDragHandle className="!h-7 !w-7 shrink-0" />
                    {isEditing ? (
                      <>
                        <Input
                          autoFocus
                          value={editingModuleTitle}
                          onChange={(e) => setEditingModuleTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveModuleEdit(); if (e.key === "Escape") setEditingModuleId(null); }}
                          className="flex-1"
                        />
                        <Button size="sm" onClick={saveModuleEdit}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingModuleId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{m.title}</div>
                          {m.summary && <div className="text-xs text-muted-foreground">{m.summary}</div>}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {moduleLessons.length} {moduleLessons.length === 1 ? "lesson" : "lessons"}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingModuleId(m.id); setEditingModuleTitle(m.title); }} aria-label="Edit module">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeModule(m)} aria-label="Delete module">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>

                  <LessonList
                    lessons={moduleLessons}
                    onEdit={openEditLesson}
                    onDelete={removeLesson}
                    onReorder={(next) => reorderLessons(next)}
                  />

                  <div className="p-2 border-t bg-muted/20">
                    <Button size="sm" variant="ghost" onClick={() => openCreateLesson(m.id)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add lesson
                    </Button>
                  </div>
                </div>
              );
            }}
          </SortableList>

          {/* Unsorted (no module) lessons */}
          {unsorted.length > 0 && (
            <div className="rounded-md border bg-card/30">
              <div className="flex items-center gap-2 p-3 border-b">
                <div className="flex-1">
                  <div className="font-medium text-sm">No module</div>
                  <div className="text-xs text-muted-foreground">Lessons not yet grouped into a module.</div>
                </div>
              </div>
              <LessonList lessons={unsorted} onEdit={openEditLesson} onDelete={removeLesson} />
            </div>
          )}
        </div>

        {/* Inline "Add module" row */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Input
            placeholder="New module title…"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addModule(); }}
            className="flex-1"
          />
          <Button onClick={addModule} disabled={savingModule || !newModuleTitle.trim()}>
            {savingModule ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Add module
          </Button>
          <Button variant="outline" onClick={() => openCreateLesson(null)}>
            <Plus className="h-4 w-4 mr-1" /> Add unfiled lesson
          </Button>
        </div>

        {/* Lesson create/edit dialog */}
        <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingLessonId ? "Edit lesson" : "New lesson"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="l-title">Title</Label>
                <Input
                  id="l-title"
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="What the learner will see"
                />
              </div>
              <div>
                <Label htmlFor="l-summary">Summary (optional)</Label>
                <Input
                  id="l-summary"
                  value={lessonForm.summary}
                  onChange={(e) => setLessonForm((f) => ({ ...f, summary: e.target.value }))}
                  placeholder="One line shown in the lesson list"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Module</Label>
                  <Select
                    value={lessonForm.moduleId ?? "__none__"}
                    onValueChange={(v) => setLessonForm((f) => ({ ...f, moduleId: v === "__none__" ? null : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No module (unfiled)</SelectItem>
                      {modules.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source type</Label>
                  <Select
                    value={lessonForm.sourceType}
                    onValueChange={(v) => setLessonForm((f) => ({ ...f, sourceType: v as CourseLessonSourceType }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LESSON_SOURCE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Source-type-specific fields — one switch, no parallel forms. */}
              {lessonForm.sourceType === "text_md" && (
                <div>
                  <Label htmlFor="l-md">Lesson body (Markdown)</Label>
                  <Textarea
                    id="l-md"
                    rows={10}
                    value={lessonForm.bodyMd}
                    onChange={(e) => setLessonForm((f) => ({ ...f, bodyMd: e.target.value }))}
                    placeholder="# Heading\n\nLesson content in Markdown. Headings, lists, code blocks all render in the learner UI."
                  />
                </div>
              )}

              {lessonForm.sourceType === "studio_video" && (
                <div>
                  <Label htmlFor="l-spid">Studio project id</Label>
                  <Input
                    id="l-spid"
                    value={lessonForm.studioProjectId}
                    onChange={(e) => setLessonForm((f) => ({ ...f, studioProjectId: e.target.value }))}
                    placeholder="UUID of the studio_projects row backing this lesson"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Tip: in Studio, use Save → "Save as Course Lesson" to attach a
                    finished video to this course without typing the id by hand.
                  </p>
                </div>
              )}

              {lessonForm.sourceType === "scorm_package" && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="l-scorm-manifest">imsmanifest.xml URL</Label>
                    <Input
                      id="l-scorm-manifest"
                      value={lessonForm.scormManifestUrl}
                      onChange={(e) => setLessonForm((f) => ({ ...f, scormManifestUrl: e.target.value }))}
                      placeholder="https://r2.example.com/scorm-packages/abc123/imsmanifest.xml"
                    />
                  </div>
                  <div>
                    <Label htmlFor="l-scorm-entry">Entry URL (HTML launch page)</Label>
                    <Input
                      id="l-scorm-entry"
                      value={lessonForm.scormEntryUrl}
                      onChange={(e) => setLessonForm((f) => ({ ...f, scormEntryUrl: e.target.value }))}
                      placeholder="https://r2.example.com/scorm-packages/abc123/index.html"
                    />
                  </div>
                  <div>
                    <Label>SCORM version</Label>
                    <Select
                      value={lessonForm.scormVersion}
                      onValueChange={(v) => setLessonForm((f) => ({ ...f, scormVersion: v as ScormVersion }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SCORM_VERSION_OPTIONS.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      SCORM zip upload + R2 ingest pipeline is tracked as gap #1400.
                      For now, paste the URLs of a package already hosted on R2 / S3.
                    </p>
                  </div>
                </div>
              )}

              {lessonForm.sourceType === "external_url" && (
                <div>
                  <Label htmlFor="l-url">External URL</Label>
                  <Input
                    id="l-url"
                    value={lessonForm.externalUrl}
                    onChange={(e) => setLessonForm((f) => ({ ...f, externalUrl: e.target.value }))}
                    placeholder="https://"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <Label htmlFor="l-est">Estimated minutes</Label>
                  <Input
                    id="l-est"
                    type="number"
                    min={0}
                    value={lessonForm.estimatedMinutes}
                    onChange={(e) => setLessonForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <input
                    id="l-required"
                    type="checkbox"
                    checked={lessonForm.isRequired}
                    onChange={(e) => setLessonForm((f) => ({ ...f, isRequired: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="l-required" className="!mb-0 text-sm">
                    Required for course completion
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLessonDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveLesson} disabled={savingLesson || !lessonForm.title.trim()}>
                {savingLesson ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editingLessonId ? "Save changes" : "Add lesson"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function LessonList({
  lessons,
  onEdit,
  onDelete,
}: {
  lessons: CourseLesson[];
  onEdit: (l: CourseLesson) => void;
  onDelete: (l: CourseLesson) => void;
}) {
  if (lessons.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground italic">
        No lessons in this module yet.
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {lessons.map((l) => {
        const Icon = SOURCE_ICON[l.sourceType];
        return (
          <li key={l.id} className="flex items-center gap-2 p-3 hover:bg-muted/30">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{l.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {l.sourceType.replace("_", " ")}
                {l.estimatedMinutes ? ` · ${l.estimatedMinutes}m` : ""}
                {!l.isRequired ? " · optional" : ""}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onEdit(l)} aria-label="Edit lesson">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(l)} aria-label="Delete lesson">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
