// Articles authoring panel. Lives inside Content Creator → Articles tab
// (/services/creator/articles) and is also embedded by the back-compat
// /articles page. Self-gates on creator enrollment: shows an enroll prompt
// when articlesActive is off and a sign-in prompt for anonymous viewers.
// Renders the list / editor without any page chrome so it drops into a tab
// cleanly.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, FileText, EyeOff, Trash2, Sparkles, Lock, Send, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  articleService,
  type Article,
  type ArticleKind,
  type ArticleStatus,
} from "@/lib/services/article-service";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";
import MediaPicker from "@/components/shared/MediaPicker";

type Mode = "list" | "edit";

const KIND_LABEL: Record<ArticleKind, string> = {
  article: "Article",
  faq: "FAQ",
  guide: "Guide",
};

function statusVariant(s: ArticleStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "published") return "default";
  if (s === "submitted") return "secondary";
  if (s === "rejected" || s === "flagged") return "destructive";
  return "outline";
}

export default function ArticlesManagerPanel() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<Article | null>(null);

  const isEnrolledArticles = creator?.articlesActive === true && creator?.endedAt == null;

  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [kind, setKind] = useState<ArticleKind>("article");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      articleService.listMine().catch(() => [] as Article[]),
      creatorService.getMine().catch(() => null),
    ])
      .then(([list, c]) => {
        if (cancelled) return;
        setArticles(list);
        setCreator(c);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const beginCreate = () => {
    setEditing(null);
    setTitle("");
    setBodyMd("");
    setKind("article");
    setCategory("");
    setTagsInput("");
    setCoverImageUrl("");
    setMode("edit");
  };

  const beginEdit = (a: Article) => {
    setEditing(a);
    setTitle(a.title);
    setBodyMd(a.bodyMd);
    setKind(a.kind);
    setCategory(a.category ?? "");
    setTagsInput((a.tags ?? []).join(", "));
    setCoverImageUrl(a.coverImageUrl ?? "");
    setMode("edit");
  };

  const buildInput = () => ({
    title: title.trim(),
    bodyMd,
    kind,
    category: category.trim() || undefined,
    tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    coverImageUrl: coverImageUrl.trim() || undefined,
  });

  const save = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = editing
        ? await articleService.update(editing.id, buildInput())
        : await articleService.create(buildInput());
      setArticles((cur) => {
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

  const submitForReview = async () => {
    if (!editing) {
      toast({ title: "Save the draft first", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const updated = await articleService.submitForReview(editing.id);
      setArticles((cur) => cur.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(updated);
      toast({
        title:
          updated.status === "submitted" ? "Submitted for review"
          : updated.status === "rejected" ? "Auto-rejected"
          : "Updated",
        description:
          updated.status === "submitted"
            ? "An administrator will review and approve before it goes public."
            : updated.rejectionReason ?? "Edit and re-submit.",
        variant: updated.status === "rejected" ? "destructive" : "default",
      });
    } catch (e: unknown) {
      toast({ title: "Submit failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (a: Article) => {
    try {
      const updated = await articleService.withdraw(a.id);
      setArticles((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      if (editing?.id === a.id) setEditing(updated);
      toast({ title: "Withdrawn from review" });
    } catch (e: unknown) {
      toast({ title: "Withdraw failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const unpublish = async (a: Article) => {
    try {
      const updated = await articleService.unpublish(a.id);
      setArticles((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      if (editing?.id === a.id) setEditing(updated);
      toast({ title: "Reverted to draft" });
    } catch (e: unknown) {
      toast({ title: "Unpublish failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const remove = async (a: Article) => {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    const previous = articles;
    setArticles((cur) => cur.filter((x) => x.id !== a.id));
    try {
      await articleService.remove(a.id);
      if (editing?.id === a.id) { setEditing(null); setMode("list"); }
    } catch (e: unknown) {
      setArticles(previous);
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    }
  };

  const locked = editing?.status === "submitted";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Articles, FAQs &amp; Guides
          </h2>
          <p className="text-sm text-muted-foreground">
            Write long-form content. Submit for SuperAdmin review — approved pieces appear on
            <code className="ml-1">/search?category=articles</code>.
          </p>
        </div>
        {mode === "list" ? (
          isEnrolledArticles && (
            <Button onClick={beginCreate}><Plus className="h-4 w-4 mr-1" /> New piece</Button>
          )
        ) : (
          <Button variant="outline" onClick={() => setMode("list")}>Back to list</Button>
        )}
      </div>

      {!isAuthenticated ? (
        <Card><CardContent className="p-8 text-center">
          <p className="font-medium mb-2">Sign in to write articles</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </CardContent></Card>
      ) : loading ? (
        <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading your articles…
        </CardContent></Card>
      ) : !isEnrolledArticles ? (
        <Card><CardContent className="p-8 text-center space-y-4">
          <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium mb-1">Enroll in the Articles Creator Program to publish</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Articles, FAQs, and Guides are gated behind the Creator Program. Enroll once,
              publish as many pieces as you like. All submissions are reviewed before going public.
            </p>
          </div>
          <Button onClick={() => navigate("/services?wizard=open")}>
            Enroll in Creator Program
          </Button>
        </CardContent></Card>
      ) : mode === "list" ? (
        articles.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3" />
            <p className="font-medium mb-1">No articles yet</p>
            <p className="text-sm mb-4">Click <strong>New piece</strong> to start your first draft.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {articles.map((a) => (
              <Card key={a.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{a.title}</h3>
                      <Badge variant="outline" className="text-[10px]">{KIND_LABEL[a.kind]}</Badge>
                      <Badge variant={statusVariant(a.status)} className="text-[10px]">
                        {a.status}
                      </Badge>
                      {a.moderationScore != null && (
                        <Badge variant="outline" className="text-[10px]">
                          Safety {Math.round((a.moderationScore ?? 0) * 100)}/100
                        </Badge>
                      )}
                    </div>
                    {a.summary && <p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p>}
                    {a.status === "rejected" && a.rejectionReason && (
                      <p className="text-xs text-destructive">Rejected: {a.rejectionReason}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{a.readMinutes} min read</span>
                      {a.viewCount > 0 && <span>{a.viewCount} views</span>}
                      {a.category && <span>· {a.category}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => beginEdit(a)}>Edit</Button>
                    {a.status === "submitted" && (
                      <Button size="sm" variant="ghost" onClick={() => withdraw(a)} title="Withdraw from review">
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {a.status === "published" && (
                      <Button size="sm" variant="ghost" onClick={() => unpublish(a)} title="Revert to draft">
                        <EyeOff className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(a)}>
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
          {locked && (
            <div className="rounded-md border border-amber-300/50 bg-amber-500/10 p-3 text-sm">
              This piece is in the review queue. Withdraw to make further edits.
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="kind">Content type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as ArticleKind)} disabled={locked}>
                <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="article">Article</SelectItem>
                  <SelectItem value="faq">FAQ</SelectItem>
                  <SelectItem value="guide">Guide</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A clear, specific title"
                disabled={locked}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cover image (optional)</Label>
            {coverImageUrl ? (
              <div className="flex items-start gap-3">
                <img src={coverImageUrl} alt="Cover preview" className="h-24 w-40 object-cover rounded-md border" />
                <div className="flex flex-col gap-2">
                  <MediaPicker
                    accept="image"
                    title="Choose article cover"
                    triggerLabel="Replace"
                    onPick={(asset) => setCoverImageUrl(asset.url)}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCoverImageUrl("")} disabled={locked}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <MediaPicker
                accept="image"
                title="Choose article cover"
                triggerLabel="Add cover image"
                onPick={(asset) => setCoverImageUrl(asset.url)}
              />
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cat">Category</Label>
              <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="career, hiring, AI…" disabled={locked} />
            </div>
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="resume, ats, interview" disabled={locked} />
            </div>
          </div>
          <div>
            <Label htmlFor="body">Body (Markdown)</Label>
            <Textarea
              id="body"
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={18}
              placeholder="Write your piece in Markdown. Headings, lists, code blocks, and links all supported."
              className="font-mono text-sm"
              disabled={locked}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Approx {Math.max(1, Math.ceil(bodyMd.trim().split(/\s+/).filter(Boolean).length / 225))} min read
            </p>
          </div>

          {editing?.status === "rejected" && editing.rejectionReason && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span><strong>Reviewer:</strong> {editing.rejectionReason}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              {editing ? `Status: ${editing.status}` : "Unsaved draft"}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={save} disabled={saving || locked}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save draft
              </Button>
              {editing?.status === "submitted" ? (
                <Button variant="outline" onClick={() => withdraw(editing)}>
                  <Undo2 className="h-4 w-4 mr-1" /> Withdraw
                </Button>
              ) : (
                <Button onClick={submitForReview} disabled={submitting || !editing}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Submit for review
                </Button>
              )}
            </div>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
