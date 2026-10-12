import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, GraduationCap, Eye, EyeOff, Trash2, Lock, DollarSign, Sparkles } from "lucide-react";
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
import CourseContentEditor from "@/components/creator/CourseContentEditor";
import LessonAuthoringCTAs from "@/components/creator/LessonAuthoringCTAs";
import { studioTemplatesService, type StudioTemplate } from "@/lib/services/studio-templates-service";
import { userService, type PublicUser } from "@/lib/services/user-service";
import { generateAndUploadCover } from "@/lib/courses/cover-generator";
import { confirmDialog } from "@/lib/dialogs";
import { courseCategoryLabel } from "@/lib/course-category";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(profileProp ?? null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<Course | null>(null);

  const isEnrolledCourses = creator?.coursesActive === true && creator?.endedAt == null;

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  // #2068 GAP-1 — one bullet per line; serialised to string[] on save.
  const [outcomesInput, setOutcomesInput] = useState("");
  const [requirementsInput, setRequirementsInput] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  // #1502 — optional reviewer. Blank = open queue (any SuperAdmin in the
  // review pool can claim). `reviewerUserId` is the submitted value (the
  // selected user's id); #1571 replaces the raw-UUID input with a
  // search-as-you-type autocomplete whose text lives in `reviewerQuery`
  // while the resolved id stays in `reviewerUserId`.
  const [reviewerUserId, setReviewerUserId] = useState("");
  const [reviewerQuery, setReviewerQuery] = useState("");
  const [reviewerResults, setReviewerResults] = useState<PublicUser[]>([]);
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [reviewerSearching, setReviewerSearching] = useState(false);
  // #1501 — theme picker. `null` = platform default; otherwise the
  // user's owned studio_template row supplies the SCORM-player chrome
  // tokens. Loaded once on mount via studioTemplatesService.
  const [themeId, setThemeId] = useState<string | null>(null);
  const [availableThemes, setAvailableThemes] = useState<StudioTemplate[]>([]);
  // #1400 — auto-cover generator in flight indicator.
  const [coverGenerating, setCoverGenerating] = useState(false);

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
      // #1501 — themes are populated from the user's owned studio
      // templates. Anonymous failure is fine; the picker just renders
      // only the platform-default option.
      studioTemplatesService.listMine().catch(() => [] as StudioTemplate[]),
    ])
      .then(([list, c, themes]) => {
        if (cancelled) return;
        setCourses(list);
        setCreator(c);
        setAvailableThemes(themes);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, profileProp]);

  // #1400 — Generate a deterministic SVG cover from the course title +
  // category + difficulty. Uploads to R2 via the existing single-file
  // route and writes the public URL into the cover field. Needs a saved
  // course (we use its id in the upload key); when the user is mid-
  // create we just write to the local field and the gradient regenerates
  // once the course is saved.
  const autoGenerateCover = async () => {
    if (!title.trim()) {
      toast({ title: "Add a title first", description: "The cover renders the title — give it something to render.", variant: "destructive" });
      return;
    }
    setCoverGenerating(true);
    try {
      const url = await generateAndUploadCover({
        courseId: editing?.id ?? "draft",
        title: title.trim(),
        category: category.trim() || null,
        difficulty: null,
      });
      setCoverImageUrl(url);
      toast({ title: "Cover generated", description: "A deterministic SVG cover landed; save the course to attach it." });
    } catch (e: unknown) {
      toast({ title: "Cover generation failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setCoverGenerating(false);
    }
  };

  const beginCreate = () => {
    setEditing(null);
    setTitle("");
    setSummary("");
    setDescription("");
    setOutcomesInput("");
    setRequirementsInput("");
    setCategory("");
    setTagsInput("");
    setCoverImageUrl("");
    setPriceDollars("");
    setThemeId(null);
    setReviewerUserId("");
    setReviewerQuery("");
    setReviewerResults([]);
    setReviewerOpen(false);
    setMode("edit");
  };

  const beginEdit = (c: Course) => {
    setEditing(c);
    setTitle(c.title);
    setSummary(c.summary ?? "");
    setDescription(c.description ?? "");
    setOutcomesInput((c.learningOutcomes ?? []).join("\n"));
    setRequirementsInput((c.requirements ?? []).join("\n"));
    setCategory(c.category ?? "");
    setTagsInput((c.tags ?? []).join(", "));
    setCoverImageUrl(c.coverImageUrl ?? "");
    setPriceDollars(c.priceCents ? (c.priceCents / 100).toFixed(2) : "");
    setThemeId(c.themeId ?? null);
    setReviewerUserId(c.assignedReviewerId ?? "");
    // Seed the autocomplete text with whatever the course already has
    // assigned so the field isn't blank for an in-flight review; the
    // resolved id is the source of truth and unchanged until the author
    // picks a new result.
    setReviewerQuery(c.assignedReviewerId ?? "");
    setReviewerResults([]);
    setReviewerOpen(false);
    setMode("edit");
  };

  // #1571 — derive a readable "Name — email" label for a public user;
  // falls back to id so an unresolved row is never blank in the list.
  const reviewerLabel = (u: PublicUser): string => {
    const name = u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.userName || "";
    return [name, u.email].filter(Boolean).join(" — ") || u.id || "Unknown user";
  };

  // #1521 — deep-link from /learn/:enrollmentId's "Edit" button.
  // Loads the course by id (works for SuperAdmin too — the backend
  // /api/courses/:id now honors SA), drops the user into edit mode,
  // and scrubs the query param so a browser back-then-forward
  // doesn't re-trigger the auto-open.
  useEffect(() => {
    const deepLinkId = searchParams.get("courseId");
    if (!deepLinkId || !isAuthenticated) return;
    let cancelled = false;
    courseService.getMine(deepLinkId)
      .then((c) => {
        if (cancelled) return;
        beginEdit(c);
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete("courseId");
        // lessonId is consumed by CourseContentEditor (scroll-to);
        // leave it in place for that hop, then it's stale.
        setSearchParams(next, { replace: true });
      });
    return () => { cancelled = true; };
    // searchParams change triggers re-evaluation; intentional that
    // setters aren't in deps (would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, searchParams.get("courseId")]);

  // #1571 — debounced reviewer search-as-you-type. Mirrors the
  // LocationFilter pattern: a 250ms setTimeout-debounce (cleanup-cancelled
  // on each keystroke) calls userService.searchUsers, and the results
  // render in an absolute dropdown. Selecting a row sets reviewerUserId to
  // the user's id while reviewerQuery holds the readable label — the
  // submit payload (submitForReview) still sends only the id.
  useEffect(() => {
    const q = reviewerQuery.trim();
    // Don't re-search when the box still shows the label of an already-
    // selected reviewer (avoids a redundant fetch right after a pick).
    if (!q || q === reviewerUserId) {
      setReviewerResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setReviewerSearching(true);
      try {
        const res = await userService.searchUsers({ search: q, limit: 8 });
        setReviewerResults(res.items ?? []);
      } catch {
        setReviewerResults([]);
      } finally {
        setReviewerSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
    // reviewerUserId intentionally omitted: it only gates the redundant-
    // fetch shortcut and is set synchronously alongside reviewerQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewerQuery]);

  const selectReviewer = (u: PublicUser) => {
    setReviewerUserId(u.id ?? "");
    setReviewerQuery(reviewerLabel(u));
    setReviewerResults([]);
    setReviewerOpen(false);
  };

  const clearReviewer = () => {
    setReviewerUserId("");
    setReviewerQuery("");
    setReviewerResults([]);
    setReviewerOpen(false);
  };

  const buildInput = (): CreateCourseInput => ({
    title: title.trim(),
    summary: summary.trim() || undefined,
    description: description.trim() || undefined,
    learningOutcomes: outcomesInput.split("\n").map((s) => s.trim()).filter(Boolean),
    requirements: requirementsInput.split("\n").map((s) => s.trim()).filter(Boolean),
    category: category.trim() || undefined,
    tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    coverImageUrl: coverImageUrl.trim() || undefined,
    priceCents: priceDollars ? Math.round(parseFloat(priceDollars) * 100) : undefined,
    themeId: themeId,
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

  const submitForReview = async () => {
    if (!editing) {
      toast({ title: "Save the draft first", variant: "destructive" });
      return;
    }
    setSubmittingReview(true);
    try {
      const updated = await courseService.submitForReview(
        editing.id,
        reviewerUserId.trim() || null,
      );
      setCourses((cur) => cur.map((c) => (c.id === updated.id ? updated : c)));
      setEditing(updated);
      toast({
        title: "Submitted for review",
        description: reviewerUserId.trim()
          ? "Assigned reviewer will see it in their queue at /courses/review-queue."
          : "Open for any SuperAdmin reviewer to claim from /courses/review-queue.",
      });
    } catch (e: unknown) {
      toast({ title: "Submit failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSubmittingReview(false);
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
    if (!(await confirmDialog({ title: t("dialogs.courses.deleteCourseTitle"), description: t("dialogs.courses.deleteCourseBody", { title: c.title }), confirmText: t("dialogs.courses.deleteConfirm"), destructive: true }))) return;
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
                      {c.category && <span>· {courseCategoryLabel(c.category, t)}</span>}
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
        <Card>
          <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 -mb-1">
            <Badge variant="outline" className="text-[10px]">Step 1</Badge>
            <h3 className="font-semibold text-sm">Course details</h3>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Title, summary, pricing — the metadata shown on the course card.
            You'll add modules and lessons in <strong>Step 2</strong> below.
          </p>
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
              <div className="flex items-center gap-2">
                <MediaPicker
                  accept="image"
                  title="Choose course cover"
                  triggerLabel="Add cover image"
                  onPick={(asset) => setCoverImageUrl(asset.url)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoGenerateCover}
                  disabled={coverGenerating || !title.trim()}
                  title="Generate a deterministic SVG cover from the title"
                >
                  {coverGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Auto-generate
                </Button>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="summary">Summary</Label>
            <Input id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line pitch shown on the course card" />
          </div>
          {/* #1501 — Theme picker. Pulls from the author's owned studio
              templates; the platform default is always available. */}
          <div className="space-y-1">
            <Label htmlFor="theme">Theme (optional)</Label>
            <Select
              value={themeId ?? "__none__"}
              onValueChange={(v) => setThemeId(v === "__none__" ? null : v)}
            >
              <SelectTrigger id="theme">
                <SelectValue placeholder="Platform default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Platform default</SelectItem>
                {availableThemes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Themes from your studio template marketplace listings; supplies
              the SCORM player chrome's background, text, accent, and border
              colors.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

          <div>
            <Label htmlFor="outcomes">{t("course.detail.whatYouWillLearn")}</Label>
            <Textarea
              id="outcomes"
              value={outcomesInput}
              onChange={(e) => setOutcomesInput(e.target.value)}
              rows={4}
              placeholder={t("courses.manager.outcomesPlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="requirements">{t("course.detail.requirements")}</Label>
            <Textarea
              id="requirements"
              value={requirementsInput}
              onChange={(e) => setRequirementsInput(e.target.value)}
              rows={3}
              placeholder={t("courses.manager.requirementsPlaceholder")}
            />
          </div>

          {/* #1502/#1571 — Optional named reviewer for in-review workflow.
              Blank = open queue for any SuperAdmin. Search-as-you-type
              autocomplete: the dropdown shows name/email, picking a row
              stores the user's id (submitted on "Submit for review"). */}
          {editing && (
            <div className="space-y-1 pt-2 border-t">
              <Label htmlFor="reviewer-search" className="text-xs">Reviewer (optional)</Label>
              <div className="relative">
                <Input
                  id="reviewer-search"
                  role="combobox"
                  aria-expanded={reviewerOpen && reviewerResults.length > 0}
                  aria-autocomplete="list"
                  aria-controls="reviewer-results"
                  autoComplete="off"
                  value={reviewerQuery}
                  onChange={(e) => {
                    setReviewerQuery(e.target.value);
                    // Typing invalidates a prior pick — clear the resolved
                    // id so a partial query is never submitted as an id.
                    if (reviewerUserId) setReviewerUserId("");
                    setReviewerOpen(true);
                  }}
                  onFocus={() => setReviewerOpen(true)}
                  onBlur={() => setReviewerOpen(false)}
                  placeholder="Search by name or email — leave blank to send to any SuperAdmin"
                  className="text-xs"
                />
                {reviewerSearching && (
                  <span className="absolute right-2 top-2 text-xs text-muted-foreground">…</span>
                )}
                {reviewerOpen && reviewerResults.length > 0 && (
                  <ul
                    id="reviewer-results"
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md"
                  >
                    {reviewerResults.map((u) => (
                      <li
                        key={u.id ?? reviewerLabel(u)}
                        role="option"
                        aria-selected={u.id === reviewerUserId}
                        className="cursor-pointer px-3 py-2 text-xs hover:bg-accent"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectReviewer(u);
                        }}
                      >
                        <div className="font-medium text-foreground">
                          {u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.userName || "Unnamed user"}
                        </div>
                        {u.email && (
                          <div className="text-[11px] text-muted-foreground">{u.email}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {reviewerUserId && (
                <button
                  type="button"
                  onClick={clearReviewer}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  Clear reviewer
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              {editing ? `Status: ${editing.status}` : "Unsaved draft"}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save draft
              </Button>
              {editing && editing.status !== "published" && editing.status !== "in_review" && (
                <Button
                  variant="outline"
                  onClick={() => void submitForReview()}
                  disabled={submittingReview}
                >
                  {submittingReview ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Submit for review
                </Button>
              )}
              <Button onClick={publish} disabled={publishing || !editing}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                Publish
              </Button>
            </div>
          </div>
        </CardContent></Card>
      )}

      {/* Step 2 — module + lesson authoring. Always rendered alongside
          Step 1 in edit mode so the two-step flow is visible up front;
          before the first save we render a placeholder with disabled
          authoring CTAs so the user knows what comes next. Closes
          gap #785/#798: lessons can be authored end-to-end without
          curling the API. */}
      {mode === "edit" ? (
        editing ? (
          <CourseContentEditor courseId={editing.id} />
        ) : (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Step 2</Badge>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" /> Modules &amp; lessons
                </h3>
              </div>
              <LessonAuthoringCTAs courseId={null} />
            </CardContent>
          </Card>
        )
      ) : null}
    </div>
  );
}
