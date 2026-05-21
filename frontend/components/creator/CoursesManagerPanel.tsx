import { useEffect, useState } from "react";
import { Loader2, Plus, GraduationCap, Eye, EyeOff, Trash2, Lock, DollarSign } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { courseService, type Course, type CreateCourseInput } from "@/lib/services/course-service";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";
import MediaPicker from "@/components/shared/MediaPicker";

type Mode = "list" | "edit";

interface Props {
  /** Optional pre-loaded creator profile. When provided, skips the in-panel fetch. */
  profile?: CreatorProfile | null;
  /** Called when the user clicks "Enroll" from the lock screen. Defaults to switching to the Offerings sub-tab. */
  onEnrollClick?: () => void;
}

// Body of the courses authoring surface. Hosted inside CreatorWorkspace's
// "Courses" tab at `/services/creator/courses`. Self-gates on enrollment so
// it can also render for non-enrolled creators with an inline enroll CTA.
export default function CoursesManagerPanel({ profile: profileProp, onEnrollClick }: Props = {}) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(profileProp ?? null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<Course | null>(null);

  const isEnrolledCourses = creator?.coursesActive === true && creator?.endedAt == null;

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const profileFetch = profileProp !== undefined
      ? Promise.resolve(profileProp)
      : creatorService.getMine().catch(() => null);
    Promise.all([
      courseService.listMine().catch(() => [] as Course[]),
      profileFetch,
    ])
      .then(([list, c]) => {
        if (cancelled) return;
        setCourses(list);
        setCreator(c);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, profileProp]);

  const beginCreate = () => {
    setEditing(null);
    setTitle("");
    setSummary("");
    setDescription("");
    setCategory("");
    setTagsInput("");
    setCoverImageUrl("");
    setPriceDollars("");
    setMode("edit");
  };

  const beginEdit = (c: Course) => {
    setEditing(c);
    setTitle(c.title);
    setSummary(c.summary ?? "");
    setDescription(c.description ?? "");
    setCategory(c.category ?? "");
    setTagsInput((c.tags ?? []).join(", "));
    setCoverImageUrl(c.coverImageUrl ?? "");
    setPriceDollars(c.priceCents ? (c.priceCents / 100).toFixed(2) : "");
    setMode("edit");
  };

  const buildInput = (): CreateCourseInput => ({
    title: title.trim(),
    summary: summary.trim() || undefined,
    description: description.trim() || undefined,
    category: category.trim() || undefined,
    tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    coverImageUrl: coverImageUrl.trim() || undefined,
    priceCents: priceDollars ? Math.round(parseFloat(priceDollars) * 100) : undefined,
  });

  const save = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = editing
        ? await courseService.update(editing.id, buildInput())
        : await courseService.create(buildInput());
      setCourses((cur) => {
        const filtered = cur.filter((x) => x.id !== saved.id);
        return [saved, ...filtered];
      });
      setEditing(saved);
      toast({ title: "Saved" });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!editing) {
      toast({ title: "Save the draft first", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const pub = await courseService.publish(editing.id);
      setCourses((cur) => cur.map((c) => (c.id === pub.id ? pub : c)));
      setEditing(pub);
      toast({
        title: pub.status === "published" ? "Published" : "Flagged for review",
        description: pub.status === "published"
          ? "Your course is now public on /search?category=courses."
          : "Review the course and republish.",
      });
    } catch (e: unknown) {
      toast({ title: "Publish failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async (c: Course) => {
    try {
      const updated = await courseService.unpublish(c.id);
      setCourses((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      if (editing?.id === c.id) setEditing(updated);
      toast({ title: "Reverted to draft" });
    } catch (e: unknown) {
      toast({ title: "Unpublish failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const remove = async (c: Course) => {
    if (!confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    const previous = courses;
    setCourses((cur) => cur.filter((x) => x.id !== c.id));
    try {
      await courseService.remove(c.id);
      if (editing?.id === c.id) { setEditing(null); setMode("list"); }
    } catch (e: unknown) {
      setCourses(previous);
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> Courses
          </h2>
          <p className="text-sm text-muted-foreground">
            Author paid or free courses. Published courses appear in the marketplace under <code>/search?category=courses</code>.
          </p>
        </div>
        {mode === "list" ? (
          isEnrolledCourses && (
            <Button onClick={beginCreate}><Plus className="h-4 w-4 mr-1" /> New course</Button>
          )
        ) : (
          <Button variant="outline" onClick={() => setMode("list")}>Back to list</Button>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading your courses…
        </CardContent></Card>
      ) : !isEnrolledCourses ? (
        <Card><CardContent className="p-8 text-center space-y-4">
          <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium mb-1">Enroll in the Courses Creator Program to publish</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Courses are gated behind the Creator Program. Enable Courses from
              the Offerings tab to start authoring. Published courses surface in <code>/search?category=courses</code>.
            </p>
          </div>
          {onEnrollClick && (
            <Button onClick={onEnrollClick}>Go to Offerings</Button>
          )}
        </CardContent></Card>
      ) : mode === "list" ? (
        courses.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            <GraduationCap className="h-10 w-10 mx-auto mb-3" />
            <p className="font-medium mb-1">No courses yet</p>
            <p className="text-sm mb-4">Click <strong>New course</strong> to start your first draft.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <Card key={c.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{c.title}</h3>
                      <Badge variant={c.status === "published" ? "default" : "secondary"} className="text-[10px]">
                        {c.status}
                      </Badge>
                      {c.priceCents > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          ${(c.priceCents / 100).toFixed(2)}
                        </Badge>
                      )}
                    </div>
                    {c.summary && <p className="text-sm text-muted-foreground line-clamp-2">{c.summary}</p>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {c.enrollmentCount > 0 && <span>{c.enrollmentCount} enrolled</span>}
                      {c.category && <span>· {c.category}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => beginEdit(c)}>Edit</Button>
                    {c.status === "published" ? (
                      <Button size="sm" variant="ghost" onClick={() => unpublish(c)}>
                        <EyeOff className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card><CardContent className="p-6 space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A clear, specific title" />
          </div>
          <div className="space-y-2">
            <Label>Cover image (optional)</Label>
            {coverImageUrl ? (
              <div className="flex items-start gap-3">
                <img
                  src={coverImageUrl}
                  alt="Cover preview"
                  className="h-24 w-40 object-cover rounded-md border"
                />
                <div className="flex flex-col gap-2">
                  <MediaPicker
                    accept="image"
                    title="Choose course cover"
                    triggerLabel="Replace"
                    onPick={(asset) => setCoverImageUrl(asset.url)}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCoverImageUrl("")}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <MediaPicker
                accept="image"
                title="Choose course cover"
                triggerLabel="Add cover image"
                onPick={(asset) => setCoverImageUrl(asset.url)}
              />
            )}
          </div>
          <div>
            <Label htmlFor="summary">Summary</Label>
            <Input id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line pitch shown on the course card" />
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="cat">Category</Label>
              <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="career, AI, leadership…" />
            </div>
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="interviewing, leadership" />
            </div>
            <div>
              <Label htmlFor="price">Price (USD)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="price" type="number" min={0} step={0.01} className="pl-8" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={10}
              placeholder="What learners will know by the end. Outline modules and lessons."
            />
          </div>

          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Module &amp; lesson authoring (chapters, video lessons, SCORM, knowledge checks)
            is not yet wired into this surface — tracked as Gap #785. The backend already
            supports the full data model via <code>POST /api/courses/:id/modules</code> and
            <code> /lessons</code>.
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              {editing ? `Status: ${editing.status}` : "Unsaved draft"}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save draft
              </Button>
              <Button onClick={publish} disabled={publishing || !editing}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                Publish
              </Button>
            </div>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
