import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  Upload,
  Download,
} from "lucide-react";
import { SortableList, SortableDragHandle } from "@/components/resume-sections/SortableList";
import { extractAndUploadScormZip, type ScormUploadProgress } from "@/lib/courses/scorm-upload";
import { buildScormZipForLesson, downloadScormZip } from "@/lib/courses/scorm-export";
import LessonAuthoringCTAs from "@/components/creator/LessonAuthoringCTAs";
import CourseGeneratorDialog, { type GeneratedCourse } from "@/components/creator/CourseGeneratorDialog";
import { importPptx } from "@/lib/courses/pptx-import";
import { confirmDialog } from "@/lib/dialogs";
import {
  commitCourseSkeleton,
  generatedCourseToSkeleton,
  pptxSlidesToSkeleton,
  uploadPptxThumbnails,
} from "@/lib/courses/commit-course-skeleton";
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
import ArticleEditor from "@/components/articles/ArticleEditor";
import { useToast } from "@/hooks/use-toast";
import {
  courseService,
  type Course,
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
  // Tiptap JSON kept in lockstep with bodyMd via ArticleEditor for
  // text_md lessons. Null when authoring a fresh lesson or editing a
  // legacy row that pre-dates the WYSIWYG editor.
  bodyJson: unknown | null;
  studioProjectId: string;
  scormManifestUrl: string;
  scormEntryUrl: string;
  scormVersion: ScormVersion;
  // #1440 — captured from extractAndUploadScormZip so the lesson row
  // carries the R2 prefix uuid; delete cleanup uses it server-side.
  scormPkgId: string;
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
    bodyJson: null,
    studioProjectId: "",
    scormManifestUrl: "",
    scormEntryUrl: "",
    scormVersion: "1.2",
    scormPkgId: "",
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
    bodyJson: l.bodyJson ?? null,
    studioProjectId: l.studioProjectId ?? "",
    scormManifestUrl: l.scormManifestUrl ?? "",
    scormEntryUrl: l.scormEntryUrl ?? "",
    scormVersion: (l.scormVersion ?? "1.2"),
    scormPkgId: l.scormPkgId ?? "",
    externalUrl: l.externalUrl ?? "",
    estimatedMinutes: l.estimatedMinutes != null ? String(l.estimatedMinutes) : "",
    isRequired: l.isRequired,
  };
}

interface Props {
  courseId: string;
}

export default function CourseContentEditor({ courseId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<Course | null>(null);
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
  // #1410 — client-side SCORM zip extract + per-file R2 upload progress.
  // Null when no upload is in flight.
  const [scormProgress, setScormProgress] = useState<ScormUploadProgress | null>(null);
  // #1497 — AI generator dialog open state.
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorCommitting, setGeneratorCommitting] = useState(false);
  // #1498 — PPTX import progress. Same null-or-string indicator as
  // scormProgress so the UI can render a single in-flight chip.
  const [pptxBusy, setPptxBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    courseService
      .getDetails(courseId)
      .then(({ course: c, modules: m, lessons: l }) => {
        if (cancelled) return;
        setCourse(c);
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
    if (!(await confirmDialog({ title: t("dialogs.courses.deleteModuleTitle"), description: t("dialogs.courses.deleteModuleBody", { title: m.title }), confirmText: t("dialogs.courses.deleteConfirm"), destructive: true }))) return;
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
  const openCreateLesson = (
    moduleId: string | null,
    initialSourceType?: CourseLessonSourceType,
  ) => {
    setEditingLessonId(null);
    const base = emptyLessonForm(moduleId);
    setLessonForm(initialSourceType ? { ...base, sourceType: initialSourceType } : base);
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
      bodyJson: lessonForm.sourceType === "text_md" ? (lessonForm.bodyJson ?? null) : null,
      studioProjectId: lessonForm.sourceType === "studio_video" ? (lessonForm.studioProjectId.trim() || null) : null,
      scormManifestUrl: lessonForm.sourceType === "scorm_package" ? (lessonForm.scormManifestUrl.trim() || null) : null,
      scormEntryUrl: lessonForm.sourceType === "scorm_package" ? (lessonForm.scormEntryUrl.trim() || null) : null,
      scormVersion: lessonForm.sourceType === "scorm_package" ? lessonForm.scormVersion : null,
      scormPkgId: lessonForm.sourceType === "scorm_package" ? (lessonForm.scormPkgId.trim() || null) : null,
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
    if (!(await confirmDialog({ title: t("dialogs.courses.deleteLessonTitle"), description: t("dialogs.courses.deleteLessonBody", { title: l.title }), confirmText: t("dialogs.courses.deleteConfirm"), destructive: true }))) return;
    const previous = lessons;
    setLessons((cur) => cur.filter((x) => x.id !== l.id));
    try {
      await courseService.removeLesson(l.id);
    } catch (e: unknown) {
      setLessons(previous);
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  // #1400 — Export a text_md lesson as a portable SCORM 1.2 zip the
  // employer can re-host in Cornerstone / Workday / Docebo / etc. The
  // launcher HTML carries the lesson body + an optional knowledge check
  // (when the lesson has a knowledgeCheckFormId) — both branches drive
  // `cmi.score.raw` and `cmi.core.lesson_status` so a third-party LMS
  // gets the same passed/completed signal we use internally.
  const exportLessonAsScorm = async (l: CourseLesson) => {
    if (!course) return;
    if (l.sourceType !== "text_md") {
      toast({
        title: "Export not supported",
        description: "SCORM export today covers text_md lessons. SCORM-package lessons are already SCORM zips; studio_video export is tracked as a follow-up.",
        variant: "destructive",
      });
      return;
    }
    try {
      // The knowledgeCheckFormId on a course_lesson points at a
      // studio_video_form row; the SCORM export reads the answer key so
      // the third-party LMS can score the check identically to the
      // hired.video player. When the lesson has no knowledge check, the
      // exporter emits a body-only SCO that completes on pagehide.
      const knowledgeCheck = l.knowledgeCheckFormId
        ? await courseService.loadKnowledgeCheck(l.knowledgeCheckFormId).catch(() => null)
        : null;
      const result = await buildScormZipForLesson({
        lesson: l,
        courseTitle: course.title,
        knowledgeCheck: knowledgeCheck ?? undefined,
      });
      downloadScormZip(result);
      toast({
        title: "SCORM zip ready",
        description: `${result.filename} downloaded.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  // ── Bulk-import handlers — #1497 + #1498. Both route through the
  //    shared commitCourseSkeleton walker so module + lesson row creation
  //    is identical regardless of source. ──
  const commitSkeleton = async (
    sourceLabel: string,
    skeleton: Awaited<ReturnType<typeof generatedCourseToSkeleton>>,
  ): Promise<void> => {
    try {
      const { modules: createdModules, lessons: createdLessons } = await commitCourseSkeleton(
        courseId,
        skeleton,
        modules.length,
      );
      setModules((cur) => [...cur, ...createdModules]);
      setLessons((cur) => [...cur, ...createdLessons]);
      toast({
        title: `${sourceLabel} imported`,
        description: `${createdModules.length} module${createdModules.length === 1 ? "" : "s"}, ${createdLessons.length} lesson${createdLessons.length === 1 ? "" : "s"} added.`,
      });
    } catch (e: unknown) {
      toast({
        title: `${sourceLabel} import failed`,
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const handleGenerated = async (course: GeneratedCourse) => {
    setGeneratorCommitting(true);
    try {
      await commitSkeleton("AI course", generatedCourseToSkeleton(course));
    } finally {
      setGeneratorCommitting(false);
    }
  };

  const handlePptxFile = async (file: File) => {
    setPptxBusy(`Parsing ${file.name}…`);
    try {
      const { slides } = await importPptx(file);
      if (slides.length === 0) {
        toast({ title: "No slides found in deck", variant: "destructive" });
        return;
      }
      setPptxBusy(`Uploading slide thumbnails (${slides.filter((s) => s.thumbnailUrl).length})…`);
      const uploaded = await uploadPptxThumbnails(slides);
      await commitSkeleton("PowerPoint deck", pptxSlidesToSkeleton(slides, uploaded));
    } catch (e: unknown) {
      toast({
        title: "PPTX import failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setPptxBusy(null);
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
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Step 2</Badge>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" /> Modules &amp; lessons
            </h3>
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            Organise the course into modules; add lessons of any source type
            (markdown, Studio video, SCORM 1.2 / 2004 package, or external URL).
            The published course needs at least one lesson before the Publish
            gate will let it go live.
          </p>
          <LessonAuthoringCTAs
            courseId={courseId}
            onPickSource={(sourceType) => openCreateLesson(null, sourceType)}
            onGenerate={() => setGeneratorOpen(true)}
            onImportPptx={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) void handlePptxFile(file);
              };
              input.click();
            }}
          />
          {(generatorCommitting || pptxBusy) && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {generatorCommitting ? "Committing AI-generated course…" : pptxBusy}
            </div>
          )}
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
                    onExportScorm={exportLessonAsScorm}
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
              <LessonList lessons={unsorted} onEdit={openEditLesson} onDelete={removeLesson} onExportScorm={exportLessonAsScorm} onReorder={(next) => reorderLessons(next)} />
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
                  <Label>Lesson body</Label>
                  {/* Keyed by lesson id so the editor remounts with the
                      right content when the creator switches between
                      lessons — Tiptap's useEditor reads `content` only on
                      mount. */}
                  <ArticleEditor
                    key={editingLessonId ?? "new"}
                    initialJson={lessonForm.bodyJson ?? undefined}
                    initialMarkdown={lessonForm.bodyMd}
                    placeholder="Lesson content. Headings, lists, code blocks, and links all render in the learner UI."
                    onChange={({ json, markdown }) =>
                      setLessonForm((f) => ({ ...f, bodyJson: json, bodyMd: markdown }))
                    }
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
                  {/* Primary path: upload a .zip and let the client extract +
                      push every asset to R2 via /api/upload/single. The
                      returned manifest + entry URLs auto-fill the form
                      fields below, which stay editable for the "paste URLs
                      of a pre-hosted package" power-user path. */}
                  <div className="rounded-md border border-dashed p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <Label className="text-sm">Upload SCORM zip</Label>
                        <p className="text-xs text-muted-foreground">
                          We extract <code>imsmanifest.xml</code>, parse the
                          version, push every asset to R2, and fill the URLs
                          below. SCORM 1.2 + 2004 1st–4th supported.
                        </p>
                      </div>
                      <label>
                        <input
                          type="file"
                          accept=".zip,application/zip,application/x-zip-compressed"
                          className="hidden"
                          disabled={!!scormProgress}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = ""; // allow re-picking the same file
                            if (!file) return;
                            setScormProgress({ done: 0, total: 0, lastPath: file.name });
                            try {
                              const result = await extractAndUploadScormZip(file, (p) => setScormProgress(p));
                              setLessonForm((f) => ({
                                ...f,
                                scormManifestUrl: result.manifestUrl,
                                scormEntryUrl: result.entryUrl,
                                scormVersion: result.version,
                                scormPkgId: result.pkgId,
                              }));
                              toast({
                                title: "SCORM package uploaded",
                                description: `${result.fileCount} files extracted, SCORM ${result.version}.`,
                              });
                            } catch (err: unknown) {
                              toast({
                                title: "SCORM upload failed",
                                description: err instanceof Error ? err.message : "Try again",
                                variant: "destructive",
                              });
                            } finally {
                              setScormProgress(null);
                            }
                          }}
                        />
                        <Button asChild type="button" size="sm" variant="outline" disabled={!!scormProgress}>
                          <span>
                            {scormProgress ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <Upload className="h-3.5 w-3.5 mr-1" />
                            )}
                            {scormProgress ? "Uploading…" : "Choose .zip"}
                          </span>
                        </Button>
                      </label>
                    </div>
                    {scormProgress && scormProgress.total > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {scormProgress.done} / {scormProgress.total} files — {scormProgress.lastPath}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="l-scorm-manifest">imsmanifest.xml URL</Label>
                    <Input
                      id="l-scorm-manifest"
                      value={lessonForm.scormManifestUrl}
                      onChange={(e) => setLessonForm((f) => ({ ...f, scormManifestUrl: e.target.value }))}
                      placeholder="Auto-filled after upload, or paste a URL for a pre-hosted package"
                    />
                  </div>
                  <div>
                    <Label htmlFor="l-scorm-entry">Entry URL (HTML launch page)</Label>
                    <Input
                      id="l-scorm-entry"
                      value={lessonForm.scormEntryUrl}
                      onChange={(e) => setLessonForm((f) => ({ ...f, scormEntryUrl: e.target.value }))}
                      placeholder="Auto-filled after upload"
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

        {/* #1497 — AI generator. The dialog stays decoupled from the
            persistence walker; `handleGenerated` is what commits. */}
        <CourseGeneratorDialog
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          onGenerated={(course) => void handleGenerated(course)}
        />
      </CardContent>
    </Card>
  );
}

function LessonList({
  lessons,
  onEdit,
  onDelete,
  onExportScorm,
  onReorder,
}: {
  lessons: CourseLesson[];
  onEdit: (l: CourseLesson) => void;
  onDelete: (l: CourseLesson) => void;
  /** #1400 — Export a text_md lesson as a SCORM 1.2 zip. Self-gates per
   *  row (the button only renders for text_md lessons), so the parent
   *  doesn't have to thread an exportable flag down. */
  onExportScorm?: (l: CourseLesson) => void;
  /** Optional drag-handle reorder via SortableList. Omit to render a
   *  plain static list (no handles, no DndContext). */
  onReorder?: (next: CourseLesson[]) => void;
}) {
  if (lessons.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground italic">
        No lessons in this module yet.
      </div>
    );
  }
  return (
    <div className="divide-y">
      <SortableList items={lessons} getId={(l) => l.id} onReorder={onReorder}>
        {(l) => {
          const Icon = SOURCE_ICON[l.sourceType];
          return (
            <div className="flex items-center gap-2 p-3 hover:bg-muted/30">
              <SortableDragHandle className="!h-6 !w-6 shrink-0" />
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
              {onExportScorm && l.sourceType === "text_md" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onExportScorm(l)}
                  aria-label="Export lesson as SCORM 1.2 zip"
                  title="Export as SCORM 1.2 zip"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onDelete(l)} aria-label="Delete lesson">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          );
        }}
      </SortableList>
    </div>
  );
}
