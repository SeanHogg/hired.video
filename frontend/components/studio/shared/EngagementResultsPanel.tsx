/**
 * EngagementResultsPanel — read-only viewer-side rollup of every
 * engagement artifact attached to a studio project. This is the
 * "what did viewers actually do" surface that the Globe + Details
 * drawer's Engagement tab renders.
 *
 * Pairs with EngagementToolset (the authoring side, mounted only in
 * the editor's left ACTIONS panel). The two never appear on the same
 * surface: authoring lives where you can bind to scenes, results live
 * where you summon the drawer to inspect a saved project.
 *
 * Self-gates on `projectId` — returns null when there's nothing to
 * read against. Loading + per-section empty states render inline so
 * the host doesn't need its own skeleton plumbing.
 */

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Image as ImageIcon,
  Loader2,
  ListOrdered,
  MessageCircle,
} from "lucide-react";

import {
  listVideoForms,
  getVideoFormSubmissions,
  getChapters,
  listThumbnails,
  getProjectComments,
  type VideoForm,
  type VideoChapter,
  type ThumbnailCandidate,
  type ReviewComment,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
}

interface FormResult {
  form: VideoForm;
  total: number;
  recent: Array<{
    id: string;
    viewerEmail: string | null;
    viewerName: string | null;
    createdAt: string;
  }>;
}

interface ResultsBundle {
  forms: FormResult[];
  chapters: VideoChapter[];
  thumbnails: ThumbnailCandidate[];
  comments: ReviewComment[];
}

export default function EngagementResultsPanel({ projectId }: Props) {
  const [bundle, setBundle] = useState<ResultsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [forms, chapters, thumbnails, comments] = await Promise.all([
          listVideoForms(projectId).catch(() => [] as VideoForm[]),
          getChapters(projectId).catch(() => [] as VideoChapter[]),
          listThumbnails(projectId).catch(() => [] as ThumbnailCandidate[]),
          getProjectComments(projectId).catch(() => [] as ReviewComment[]),
        ]);

        const formResults: FormResult[] = await Promise.all(
          forms.map(async (form) => {
            const subs = await getVideoFormSubmissions(form.id).catch(() => ({
              submissions: [],
              total: 0,
            }));
            return {
              form,
              total: subs.total,
              recent: subs.submissions.slice(0, 5).map((s) => ({
                id: s.id,
                viewerEmail: s.viewerEmail,
                viewerName: s.viewerName,
                createdAt: s.createdAt,
              })),
            };
          }),
        );

        if (cancelled) return;
        setBundle({ forms: formResults, chapters, thumbnails, comments });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load engagement results.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading viewer engagement…
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/5 py-3 px-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!bundle) return null;

  const nothing =
    bundle.forms.length === 0 &&
    bundle.chapters.length === 0 &&
    bundle.thumbnails.length === 0 &&
    bundle.comments.length === 0;

  if (nothing) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/20 py-10 px-3 text-center text-sm text-muted-foreground">
        No engagement assets on this project yet. Add chapters, thumbnails,
        in-video forms, or a review link from the editor's Actions panel —
        viewer results will land here as they come in.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <FormsSection forms={bundle.forms} />
      <ReviewsSection comments={bundle.comments} />
      <ChaptersSection chapters={bundle.chapters} />
      <ThumbnailsSection thumbnails={bundle.thumbnails} />
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof ClipboardList;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <span className="text-xs text-muted-foreground">· {count}</span>
    </div>
  );
}

function FormsSection({ forms }: { forms: FormResult[] }) {
  if (forms.length === 0) return null;
  const totalSubs = forms.reduce((acc, f) => acc + f.total, 0);
  return (
    <section className="space-y-2">
      <SectionHeader icon={ClipboardList} title="Form submissions" count={totalSubs} />
      <ul className="space-y-2">
        {forms.map(({ form, total, recent }) => (
          <li key={form.id} className="rounded-md border border-border bg-card px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{form.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  @ {form.positionSeconds.toFixed(1)}s
                  {form.formType ? ` · ${form.formType.replace("_", " ")}` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {total}
              </span>
            </div>
            {total > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                {recent.map((s) => (
                  <li key={s.id} className="font-mono truncate">
                    {s.viewerEmail ?? s.viewerName ?? "(anonymous)"} ·{" "}
                    {new Date(s.createdAt).toLocaleString()}
                  </li>
                ))}
                {total > recent.length && (
                  <li className="italic">+{total - recent.length} more</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewsSection({ comments }: { comments: ReviewComment[] }) {
  if (comments.length === 0) return null;
  const open = comments.filter((c) => !c.resolved).length;
  const resolved = comments.length - open;
  const recent = [...comments]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  return (
    <section className="space-y-2">
      <SectionHeader icon={MessageCircle} title="Reviewer comments" count={comments.length} />
      <p className="text-[11px] text-muted-foreground">
        {open} open · {resolved} resolved
      </p>
      <ul className="space-y-1.5">
        {recent.map((c) => (
          <li
            key={c.id}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate font-medium text-foreground">{c.authorName}</span>
              <span className="shrink-0">
                {c.timestampSec != null ? `@ ${c.timestampSec.toFixed(1)}s · ` : ""}
                {new Date(c.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-foreground">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChaptersSection({ chapters }: { chapters: VideoChapter[] }) {
  if (chapters.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHeader icon={ListOrdered} title="Chapters" count={chapters.length} />
      <ul className="space-y-0.5 text-xs">
        {chapters
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((ch) => (
            <li key={ch.id} className="flex items-center justify-between gap-2 px-1">
              <span className="truncate">{ch.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {ch.startSeconds.toFixed(1)}s
              </span>
            </li>
          ))}
      </ul>
      <p className="text-[11px] text-muted-foreground italic">
        Per-chapter dwell isn't instrumented yet — see the heatmap in the
        Metrics tab for whole-video retention.
      </p>
    </section>
  );
}

function ThumbnailsSection({ thumbnails }: { thumbnails: ThumbnailCandidate[] }) {
  if (thumbnails.length === 0) return null;
  const selected = thumbnails.find((t) => t.isSelected);
  return (
    <section className="space-y-2">
      <SectionHeader icon={ImageIcon} title="Thumbnail variants" count={thumbnails.length} />
      <div className="grid grid-cols-3 gap-2">
        {thumbnails.slice(0, 6).map((t) => (
          <div
            key={t.id}
            className={`relative overflow-hidden rounded-md border ${
              t.isSelected ? "border-brand-purple ring-1 ring-brand-purple" : "border-border"
            }`}
          >
            <img
              src={t.imageUrl}
              alt={t.headlineText ?? "Thumbnail variant"}
              className="aspect-video w-full object-cover"
              loading="lazy"
            />
            {t.isSelected && (
              <span className="absolute top-1 left-1 rounded bg-brand-purple px-1.5 py-0.5 text-[9px] font-medium text-white">
                LIVE
              </span>
            )}
            {t.score != null && (
              <span className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-mono text-white">
                {t.score.toFixed(2)}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground italic">
        {selected
          ? "Per-variant click-through isn't instrumented yet — only the live thumbnail's surface-level views appear in Metrics."
          : "No thumbnail picked yet — viewers see a default frame."}
      </p>
    </section>
  );
}
