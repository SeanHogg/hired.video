"use client";

/**
 * ReviewCommentsDialog — gap #145 frontend.
 *
 * Lists time-coded review comments for a project, lets the owner reply,
 * resolve, or delete them, and exposes a "Create review link" button that
 * mints a public shareToken-based URL for anonymous external reviewers.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MessageSquare, Check, Trash2, Link2, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  getProjectComments,
  postProjectComment,
  resolveComment,
  deleteComment,
  createReviewLink,
  listReviewLinks,
  type ReviewComment,
  type ReviewLink,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
  /** Current playback time so new comments can be pinned to it. */
  currentTimeSec?: number;
  /** Controlled open state (e.g. the workspace ⋯ menu opens it); the dialog
   *  then renders no trigger of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Thread root to select on open — a review-pin widget clicked during
   *  playback (#1586). Its root and replies are highlighted and scrolled
   *  into view. */
  focusCommentId?: string;
}

function fmt(generalLabel: string, time: number | null): string {
  if (time == null) return generalLabel;
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ReviewCommentsDialog({ projectId, currentTimeSec = 0, open: controlledOpen, onOpenChange, focusCommentId }: Props) {
  const { t } = useTranslation();
  const generalLabel = t("studio.review.general");
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : ownOpen;
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next));
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [links, setLinks] = useState<ReviewLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [pinToTime, setPinToTime] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const focusRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    Promise.all([getProjectComments(projectId), listReviewLinks(projectId)])
      .then(([c, l]) => {
        setComments(c);
        setLinks(l);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, projectId]);

  // Bring the selected thread root into view once the list has loaded.
  useEffect(() => {
    if (!open || loading || !focusCommentId) return;
    focusRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [open, loading, focusCommentId, comments]);

  async function handlePost() {
    if (!projectId || !draft.trim()) return;
    setPosting(true);
    try {
      const c = await postProjectComment(projectId, {
        body: draft.trim(),
        timestampSec: pinToTime ? currentTimeSec : null,
      });
      setComments((prev) => [...prev, c]);
      setDraft("");
    } finally {
      setPosting(false);
    }
  }

  async function handleResolve(c: ReviewComment) {
    const updated = await resolveComment(c.id, !c.resolved);
    setComments((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
  }

  async function handleDelete(id: string) {
    await deleteComment(id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleCreateLink() {
    if (!projectId) return;
    const link = await createReviewLink(projectId, { name: t("studio.review.defaultLinkName"), expiresInDays: 30 });
    setLinks((prev) => [link, ...prev]);
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/studio/review/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId} title={t("studio.review.triggerTitle")}>
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> {t("studio.review.trigger")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("studio.review.heading")}</DialogTitle>
          <DialogDescription>
            {t("studio.review.description")}
          </DialogDescription>
        </DialogHeader>

        {/* Share links */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("studio.review.publicLinksLabel")}</Label>
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={handleCreateLink}>
              <Link2 className="w-3 h-3 mr-1" /> {t("actions.create")}
            </Button>
          </div>
          {links.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">{t("studio.review.noLinks")}</p>
          ) : (
            <ul className="text-[10px] space-y-1">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-1">
                  <code className="font-mono truncate flex-1">/studio/review/{l.shareToken.slice(0, 12)}…</code>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    onClick={() => copyLink(l.shareToken)}
                  >
                    {copiedToken === l.shareToken ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Comments list */}
        <div className="border-t pt-3">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("studio.review.commentsLabel")}</Label>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t("studio.review.noComments")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto mt-1">
              {comments.map((c) => (
                <li
                  key={c.id}
                  ref={c.id === focusCommentId ? focusRef : undefined}
                  aria-current={c.id === focusCommentId ? "true" : undefined}
                  className={`border rounded-md px-2 py-1.5 ${c.resolved ? "opacity-50" : ""} ${
                    focusCommentId && (c.id === focusCommentId || c.parentId === focusCommentId) ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-medium">{c.authorName}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono">{fmt(generalLabel, c.timestampSec)}</Badge>
                    {c.resolved && <Badge className="h-4 px-1 text-[9px] bg-green-500/20 text-green-700">{t("studio.review.resolved")}</Badge>}
                    <span className="ml-auto flex items-center gap-0.5">
                      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => handleResolve(c)} title={t("studio.review.toggleResolve")}>
                        <Check className="w-3 h-3" />
                      </button>
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)} title={t("actions.delete")}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                  <p className="text-[11px] whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* New comment */}
        <div className="border-t pt-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={pinToTime
              ? t("studio.review.commentAtPlaceholder", { time: fmt(generalLabel, currentTimeSec) })
              : t("studio.review.generalCommentPlaceholder")}
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handlePost();
              }
            }}
          />
          <div className="flex items-center justify-between mt-1.5">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={pinToTime} onChange={(e) => setPinToTime(e.target.checked)} />
              {t("studio.review.pinToTime")}
            </label>
            <Button size="sm" className="h-7 text-xs" onClick={handlePost} disabled={posting || !draft.trim()}>
              {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : t("studio.review.post")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
