/**
 * #798 — Module + lesson authoring UI. Drops into the CoursesManager
 * page (when it ships) or any owner-side surface that needs to author
 * the hierarchy. The backend already exposes the full data model
 * (`POST /api/courses/:id/modules`, `POST /api/courses/:id/lessons`,
 * `PATCH /api/courses/modules/:moduleId`) — this is the missing UI.
 *
 * Self-gating: returns null when the caller can't manage this course
 * (no `canEdit` boolean drilled in — the component decides via the
 * loaded course's `isOwner` field).
 *
 * Lesson source types mirror the schema's enum:
 *   text_md | scorm_package | studio_video | external_url
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";

interface Lesson {
  id: string;
  title: string;
  summary: string | null;
  sourceType: "text_md" | "scorm_package" | "studio_video" | "external_url";
  externalUrl?: string | null;
  bodyMd?: string | null;
  studioProjectId?: string | null;
  companionStudioProjectId?: string | null;
  sortOrder: number;
  estimatedMinutes?: number | null;
}

interface CourseModule {
  id: string;
  title: string;
  summary: string | null;
  sortOrder: number;
  lessons: Lesson[];
}

interface CourseModulesEditorProps {
  courseId: string;
  /** When false the editor renders read-only (returns null) — owner check
   *  lives in the caller, this component just consumes the result. */
  canEdit: boolean;
}

export default function CourseModulesEditor({ courseId, canEdit }: CourseModulesEditorProps) {
  const [modules, setModules] = useState<CourseModule[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/courses/${encodeURIComponent(courseId)}/modules`);
      const body = (res as any).data?.data ?? (res as any).data ?? {};
      setModules((body.items ?? body.modules ?? []) as CourseModule[]);
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!canEdit) return null;
  if (loading || !modules) {
    return (
      <div className="py-6 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const addModule = async () => {
    try {
      const title = prompt("Module title?")?.trim();
      if (!title) return;
      await apiClient.post(`/api/courses/${encodeURIComponent(courseId)}/modules`, {
        title,
        sortOrder: modules.length,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add module");
    }
  };

  const addLesson = async (moduleId: string) => {
    const title = prompt("Lesson title?")?.trim();
    if (!title) return;
    try {
      await apiClient.post(`/api/courses/${encodeURIComponent(courseId)}/lessons`, {
        moduleId,
        title,
        sourceType: "text_md",
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add lesson");
    }
  };

  const deleteLesson = async (lessonId: string) => {
    if (!confirm("Delete this lesson?")) return;
    try {
      await apiClient.delete(`/api/courses/lessons/${encodeURIComponent(lessonId)}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete lesson");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Curriculum</h3>
        <Button size="sm" onClick={addModule}>
          <Plus className="h-4 w-4 mr-1" /> Module
        </Button>
      </div>

      {modules.length === 0 ? (
        <div className="rounded border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No modules yet — add one to start authoring lessons.
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map((m) => (
            <div key={m.id} className="rounded-md border bg-card">
              <div className="p-3 flex items-center gap-2 border-b">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{m.title}</span>
                {m.summary && (
                  <span className="text-xs text-muted-foreground">— {m.summary}</span>
                )}
                <div className="ml-auto">
                  <Button variant="ghost" size="sm" onClick={() => addLesson(m.id)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Lesson
                  </Button>
                </div>
              </div>
              {m.lessons.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">No lessons yet.</div>
              ) : (
                <div className="divide-y">
                  {m.lessons.map((l) => (
                    <LessonRow
                      key={l.id}
                      courseId={courseId}
                      lesson={l}
                      onChange={refresh}
                      onDelete={() => deleteLesson(l.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LessonRow({
  courseId,
  lesson,
  onChange,
  onDelete,
}: {
  courseId: string;
  lesson: Lesson;
  onChange: () => void | Promise<void>;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary ?? "");
  const [sourceType, setSourceType] = useState<Lesson["sourceType"]>(lesson.sourceType);
  const [externalUrl, setExternalUrl] = useState(lesson.externalUrl ?? "");
  const [bodyMd, setBodyMd] = useState(lesson.bodyMd ?? "");
  const [companionId, setCompanionId] = useState(lesson.companionStudioProjectId ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/api/courses/lessons/${encodeURIComponent(lesson.id)}`, {
        title,
        summary,
        sourceType,
        externalUrl: externalUrl || null,
        bodyMd: sourceType === "text_md" ? bodyMd : undefined,
        companionStudioProjectId: companionId || null,
      });
      toast.success("Lesson saved");
      await onChange();
      setExpanded(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save lesson");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-sm font-medium text-left flex-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {title || "Untitled lesson"}
        </button>
        <span className="text-xs text-muted-foreground capitalize">{sourceType.replace(/_/g, " ")}</span>
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Delete lesson">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as Lesson["sourceType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text_md">Markdown</SelectItem>
                <SelectItem value="studio_video">Studio video</SelectItem>
                <SelectItem value="scorm_package">SCORM package</SelectItem>
                <SelectItem value="external_url">External URL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Summary</Label>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          {sourceType === "text_md" && (
            <div className="md:col-span-2">
              <Label className="text-xs">Body (Markdown)</Label>
              <Textarea rows={6} value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} />
            </div>
          )}
          {sourceType === "external_url" && (
            <div className="md:col-span-2">
              <Label className="text-xs">External URL</Label>
              <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} />
            </div>
          )}
          <div className="md:col-span-2">
            <Label className="text-xs">Companion Studio video (#1520, optional)</Label>
            <Input
              placeholder="Studio project ID"
              value={companionId}
              onChange={(e) => setCompanionId(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setExpanded(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
