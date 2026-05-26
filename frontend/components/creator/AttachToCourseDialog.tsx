import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from "@/hooks/use-toast";
import {
  courseService,
  type Course,
  type CourseModule,
} from "@/lib/services/course-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Studio project id that becomes `course_lessons.studio_project_id`
   *  on the created lesson. Required; the dialog returns early if null. */
  studioProjectId: string | null;
  /** Pre-fills the lesson title. Usually the Studio project's name. */
  defaultTitle?: string;
  /** Called after a successful attach so the parent can navigate or
   *  refresh the course list. */
  onAttached?: (info: { courseId: string; lessonId: string }) => void;
}

/**
 * AttachToCourseDialog — pick a course (+ optional module), title the lesson,
 * and POST it as `sourceType: studio_video` so the saved Studio project
 * becomes a course lesson without leaving the editor.
 *
 * Surfaced via:
 *   • StudioSaveMenuV2 "Save as Course Lesson" row
 *     (publishHandlers["course-lesson"] → opens this dialog)
 *
 * Self-fetches the user's courses + modules every time it opens so the
 * picker always reflects the latest catalog. The CTA at the bottom links
 * to /services/creator/courses for users who haven't created a course yet.
 */
export default function AttachToCourseDialog({
  open,
  onOpenChange,
  studioProjectId,
  defaultTitle,
  onAttached,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [moduleId, setModuleId] = useState<string>("__none__");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch courses on open. We only fetch when the dialog actually opens
  // so the list reflects any course the user authored since last attach.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setTitle(defaultTitle ?? "");
    courseService
      .listMine()
      .then((list) => {
        if (cancelled) return;
        setCourses(list);
        // Default to the most-recently-updated course (already first in
        // listMine's response because the API orders by createdAt DESC).
        if (list.length > 0 && list[0]) {
          setCourseId(list[0].id);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        toast({
          title: "Couldn't load your courses",
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
  }, [open, defaultTitle, toast]);

  // Fetch modules for the selected course.
  useEffect(() => {
    if (!courseId) {
      setModules([]);
      setModuleId("__none__");
      return;
    }
    let cancelled = false;
    courseService
      .getDetails(courseId)
      .then(({ modules: m }) => {
        if (cancelled) return;
        setModules(m);
        setModuleId(m[0]?.id ?? "__none__");
      })
      .catch(() => {
        if (cancelled) return;
        setModules([]);
        setModuleId("__none__");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const attach = async () => {
    if (!studioProjectId) {
      toast({ title: "Save the Studio project first", variant: "destructive" });
      return;
    }
    if (!courseId) {
      toast({ title: "Pick a course", variant: "destructive" });
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      toast({ title: "Lesson title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const lesson = await courseService.addLesson(courseId, {
        title: trimmed,
        moduleId: moduleId === "__none__" ? null : moduleId,
        sourceType: "studio_video",
        studioProjectId,
      });
      toast({
        title: "Attached as course lesson",
        description: `"${trimmed}" added to ${courses.find((c) => c.id === courseId)?.title ?? "course"}.`,
      });
      onAttached?.({ courseId, lessonId: lesson.id });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        title: "Attach failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Save as Course Lesson
          </DialogTitle>
          <DialogDescription>
            Attach this Studio project to a course as a video lesson.
            Learners will see it in the course player; xAPI completion
            events fire automatically.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading your courses…
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center space-y-3">
            <GraduationCap className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">No courses yet</p>
              <p className="text-sm text-muted-foreground">
                You haven't authored any courses. Create one first, then
                come back here to attach this lesson.
              </p>
            </div>
            <Button asChild>
              <Link to="/services/creator/courses">
                <Plus className="h-4 w-4 mr-1" /> Create a course <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}{c.status === "draft" ? " (draft)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Module</Label>
              <Select value={moduleId} onValueChange={setModuleId}>
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
              <Label htmlFor="lesson-title">Lesson title</Label>
              <Input
                id="lesson-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What learners will see"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {courses.length > 0 && (
            <Button onClick={attach} disabled={saving || !title.trim() || !studioProjectId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Attach as lesson
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
