// Articles authoring panel. Lives inside Content Creator → Articles tab
// (/services/creator/articles) and is also embedded by the back-compat
// /articles page. Self-gates on creator enrollment: shows an enroll prompt
// when articlesActive is off and a sign-in prompt for anonymous viewers.
// Renders the list / editor without any page chrome so it drops into a tab
// cleanly.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, FileText, Sparkles, Lock, Send, Undo2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { studioEditHref } from "@/lib/studio/studio-authoring";
import { useToast } from "@/hooks/use-toast";
import { articleService, type Article } from "@/lib/services/article-service";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";
import { confirmDialog } from "@/lib/dialogs";
import ArticleDetailsForm from "./ArticleDetailsForm";
import ArticlesList from "./ArticlesList";
import { useArticleDetailsForm } from "./useArticleDetailsForm";

type Mode = "list" | "edit";


export default function ArticlesManagerPanel() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<Article | null>(null);

  const isEnrolledArticles = creator?.articlesActive === true && creator?.endedAt == null;

  const form = useArticleDetailsForm();
  /** A failed call's toast description. */
  const failure = (e: unknown) => (e instanceof Error ? e.message : t("actions.tryAgain"));
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
    form.reset();
    setMode("edit");
  };

  const beginEdit = (a: Article) => {
    setEditing(a);
    form.load(a);
    setMode("edit");
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: t("creator.articles.toast.titleRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = editing
        ? await articleService.update(editing.id, form.toInput())
        : await articleService.create(form.toInput());
      setArticles((cur) => {
        const filtered = cur.filter((x) => x.id !== saved.id);
        return [saved, ...filtered];
      });
      setEditing(saved);
      await form.saveTags(saved.id);
      toast({ title: t("messages.savedTitle") });
    } catch (e: unknown) {
      toast({ title: t("creator.articles.toast.saveFailed"), description: failure(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submitForReview = async () => {
    if (!editing) {
      toast({ title: t("creator.articles.toast.saveFirst"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const updated = await articleService.submitForReview(editing.id);
      setArticles((cur) => cur.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(updated);
      toast({
        title: t(
          updated.status === "submitted"
            ? "creator.articles.toast.submitted"
            : updated.status === "rejected"
              ? "creator.articles.toast.autoRejected"
              : "creator.articles.toast.updated",
        ),
        description:
          updated.status === "submitted"
            ? t("creator.articles.toast.submittedBody")
            : updated.rejectionReason ?? t("creator.articles.toast.resubmit"),
        variant: updated.status === "rejected" ? "destructive" : "default",
      });
    } catch (e: unknown) {
      toast({ title: t("creator.articles.toast.submitFailed"), description: failure(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async (a: Article) => {
    try {
      const updated = await articleService.withdraw(a.id);
      setArticles((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      if (editing?.id === a.id) setEditing(updated);
      toast({ title: t("creator.articles.toast.withdrawn") });
    } catch (e: unknown) {
      toast({ title: t("creator.articles.toast.withdrawFailed"), description: failure(e), variant: "destructive" });
    }
  };

  const unpublish = async (a: Article) => {
    try {
      const updated = await articleService.unpublish(a.id);
      setArticles((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      if (editing?.id === a.id) setEditing(updated);
      toast({ title: t("creator.articles.toast.reverted") });
    } catch (e: unknown) {
      toast({ title: t("creator.articles.toast.unpublishFailed"), description: failure(e), variant: "destructive" });
    }
  };

  const remove = async (a: Article) => {
    if (!(await confirmDialog({ title: t("dialogs.articles.deleteTitle"), description: t("dialogs.articles.deleteBody", { title: a.title }), confirmText: t("dialogs.articles.deleteConfirm"), destructive: true }))) return;
    const previous = articles;
    setArticles((cur) => cur.filter((x) => x.id !== a.id));
    try {
      await articleService.remove(a.id);
      if (editing?.id === a.id) { setEditing(null); setMode("list"); }
    } catch (e: unknown) {
      setArticles(previous);
      toast({ title: t("creator.articles.toast.deleteFailed"), description: failure(e), variant: "destructive" });
    }
  };

  const locked = editing?.status === "submitted";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> {t("creator.articles.heading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("creator.articles.intro")}
            <code className="ml-1">/search?category=articles</code>.
          </p>
        </div>
        {mode === "list" ? (
          isEnrolledArticles && (
            <Button onClick={beginCreate}><Plus className="h-4 w-4 mr-1" /> {t("creator.articles.newPiece")}</Button>
          )
        ) : (
          <Button variant="outline" onClick={() => setMode("list")}>{t("creator.articles.backToList")}</Button>
        )}
      </div>

      {!isAuthenticated ? (
        <Card><CardContent className="p-8 text-center">
          <p className="font-medium mb-2">{t("creator.articles.signInPrompt")}</p>
          <Button onClick={() => navigate("/login")}>{t("nav.header.signIn")}</Button>
        </CardContent></Card>
      ) : loading ? (
        <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("creator.articles.loading")}
        </CardContent></Card>
      ) : !isEnrolledArticles ? (
        <Card><CardContent className="p-8 text-center space-y-4">
          <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium mb-1">{t("creator.articles.enrollTitle")}</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{t("creator.articles.enrollBody")}</p>
          </div>
          <Button onClick={() => navigate("/services?wizard=open")}>{t("creator.articles.enrollCta")}</Button>
        </CardContent></Card>
      ) : mode === "list" ? (
        <ArticlesList
          articles={articles}
          onEdit={(a) => navigate(studioEditHref("article", a.id))}
          onDetails={beginEdit}
          onWithdraw={withdraw}
          onUnpublish={unpublish}
          onRemove={remove}
        />
      ) : (
        <Card><CardContent className="p-6 space-y-4">
          {locked && (
            <div className="rounded-md border border-amber-300/50 bg-amber-500/10 p-3 text-sm">
              {t("creator.articles.inReview")}
            </div>
          )}
          <ArticleDetailsForm form={form} locked={locked} editorKey={editing?.id ?? "new"} />

          {editing?.status === "rejected" && editing.rejectionReason && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span><strong>{t("creator.articles.reviewer")}</strong> {editing.rejectionReason}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              {editing
                ? t("creator.articles.status", { status: t(`creator.articles.statusValue.${editing.status}`) })
                : t("creator.articles.unsaved")}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={save} disabled={saving || locked}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t("actions.saveDraft")}
              </Button>
              {editing?.status === "submitted" ? (
                <Button variant="outline" onClick={() => withdraw(editing)}>
                  <Undo2 className="h-4 w-4 mr-1" /> {t("creator.articles.withdraw")}
                </Button>
              ) : (
                <Button onClick={submitForReview} disabled={submitting || !editing}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  {t("creator.articles.submit")}
                </Button>
              )}
            </div>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
