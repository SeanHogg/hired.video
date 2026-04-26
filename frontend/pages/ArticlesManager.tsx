import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, FileText, Eye, EyeOff, Trash2, Sparkles, Lock } from "lucide-react";
import { useSEO } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/hooks/use-sidebar";
import { articleService, type Article } from "@/lib/services/article-service";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";

type Mode = "list" | "edit";

export default function ArticlesManager() {
  useSEO("/articles");
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  const [articles, setArticles] = useState<Article[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<Article | null>(null);

  const isEnrolledArticles = creator?.articlesActive === true && creator?.endedAt == null;

  // Edit-form state
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

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
    setCategory("");
    setTagsInput("");
    setCoverImageUrl("");
    setMode("edit");
  };

  const beginEdit = (a: Article) => {
    setEditing(a);
    setTitle(a.title);
    setBodyMd(a.bodyMd);
    setCategory(a.category ?? "");
    setTagsInput((a.tags ?? []).join(", "));
    setCoverImageUrl(a.coverImageUrl ?? "");
    setMode("edit");
  };

  const buildInput = () => ({
    title: title.trim(),
    bodyMd,
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

  const publish = async () => {
    if (!editing) {
      toast({ title: "Save the draft first", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const pub = await articleService.publish(editing.id);
      setArticles((cur) => cur.map((a) => (a.id === pub.id ? pub : a)));
      setEditing(pub);
      toast({
        title: pub.status === "published" ? "Published" : "Flagged for review",
        description: pub.status === "published"
          ? "Your article is now public on /search?category=articles."
          : pub.qualityRationale ?? "Quality classifier flagged this article. Edit and republish.",
      });
    } catch (e: unknown) {
      toast({ title: "Publish failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setPublishing(false);
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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className="pt-16">
          <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <FileText className="h-6 w-6 text-primary" /> Articles
                </h1>
                <p className="text-sm text-muted-foreground">
                  Write long-form posts. Published articles appear in the marketplace under <code>/search?category=articles</code>.
                </p>
              </div>
              {mode === "list" ? (
                isEnrolledArticles && (
                  <Button onClick={beginCreate}><Plus className="h-4 w-4 mr-1" /> New article</Button>
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
                    Articles are gated behind the Creator Program. Enroll once, write as many articles as you like.
                    Your published articles surface in the community feed and in <code>/search?category=articles</code>.
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
                  <p className="text-sm mb-4">Click <strong>New article</strong> to start your first draft.</p>
                </CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {articles.map((a) => (
                    <Card key={a.id} className="hover:border-primary/40 transition-colors">
                      <CardContent className="p-4 flex items-start gap-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{a.title}</h3>
                            <Badge variant={a.status === "published" ? "default" : "secondary"} className="text-[10px]">
                              {a.status}
                            </Badge>
                            {a.qualityScore != null && (
                              <Badge variant="outline" className="text-[10px]">
                                AI {Math.round((a.qualityScore ?? 0) * 100)}/100
                              </Badge>
                            )}
                          </div>
                          {a.summary && <p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p>}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{a.readMinutes} min read</span>
                            {a.viewCount > 0 && <span>{a.viewCount} views</span>}
                            {a.category && <span>· {a.category}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => beginEdit(a)}>Edit</Button>
                          {a.status === "published" ? (
                            <Button size="sm" variant="ghost" onClick={() => unpublish(a)}>
                              <EyeOff className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
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
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A clear, specific title" />
                </div>
                <div>
                  <Label htmlFor="cover">Cover image URL (optional)</Label>
                  <Input id="cover" value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://…" />
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cat">Category</Label>
                    <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="career, hiring, AI…" />
                  </div>
                  <div>
                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                    <Input id="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="resume, ats, interview" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="body">Body (Markdown)</Label>
                  <Textarea
                    id="body"
                    value={bodyMd}
                    onChange={(e) => setBodyMd(e.target.value)}
                    rows={18}
                    placeholder="Write your article in Markdown. Headings, lists, code blocks, and links all supported."
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Approx {Math.max(1, Math.ceil(bodyMd.trim().split(/\s+/).filter(Boolean).length / 225))} min read
                  </p>
                </div>

                {editing?.qualityRationale && (
                  <div className="rounded-md border border-amber-300/50 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span><strong>AI reviewer:</strong> {editing.qualityRationale}</span>
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
                    <Button onClick={publish} disabled={publishing || !editing}>
                      {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                      Publish
                    </Button>
                  </div>
                </div>
              </CardContent></Card>
            )}
          </div>

          <Footer />
        </div>
      </div>
    </div>
  );
}
