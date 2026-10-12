/**
 * Agent draft list: approve / skip / rewrite, 10-minute undo, approve-all.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDestinationLabel } from "@/components/studio/distribution/useDestinationLabel";
import type { PostingAgentDraftDto } from "@/lib/services/distribution-service";

export function PostingAgentDrafts({
  drafts,
  captions,
  busy,
  pausedReason,
  prepareProgress = null,
  onCaption,
  onApprove,
  onSkip,
  onRewrite,
  onUndo,
  onApproveAll,
  onPrepareClips,
}: {
  drafts: PostingAgentDraftDto[];
  captions: Record<string, string>;
  busy: boolean;
  pausedReason: string | null;
  prepareProgress?: number | null;
  onCaption: (id: string, value: string) => void;
  onApprove: (draft: PostingAgentDraftDto) => void;
  onSkip: (id: string) => void;
  onRewrite: (id: string) => void;
  onUndo: (id: string) => void;
  onApproveAll: () => void;
  onPrepareClips?: () => void;
}) {
  const { t } = useTranslation();
  const pending = useMemo(() => drafts.filter((d) => d.status === "draft"), [drafts]);
  const needsPrepare = pending.some((d) => d.needsClip === true);
  const groups = useMemo(() => {
    const map = new Map<string, PostingAgentDraftDto[]>();
    for (const d of drafts) {
      const list = map.get(d.projectId) ?? [];
      list.push(d);
      map.set(d.projectId, list);
    }
    return [...map.entries()];
  }, [drafts]);
  const showMaterial = pending.length === 0 && pausedReason === "out_of_material";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-foreground">{t("studio.agent.drafts")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {needsPrepare && onPrepareClips ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={onPrepareClips}>
              {t("studio.agent.prepareClips")}
            </Button>
          ) : null}
          {pending.length > 0 ? (
            <Button size="sm" variant="outline" disabled={busy || needsPrepare} onClick={onApproveAll}>
              {t("studio.agent.approveAll")}
            </Button>
          ) : null}
        </div>
      </div>
      {typeof prepareProgress === "number" ? (
        <p className="text-sm text-muted-foreground">{t("studio.agent.preparingClips", { pct: prepareProgress })}</p>
      ) : null}

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("studio.agent.emptyDrafts")}</p>
      ) : (
        groups.map(([projectId, rows]) => (
          <div key={projectId} className="flex flex-col gap-3">
            {rows.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                caption={captions[draft.id] ?? draft.caption}
                busy={busy}
                onCaption={(value) => onCaption(draft.id, value)}
                onApprove={() => onApprove(draft)}
                onSkip={() => onSkip(draft.id)}
                onRewrite={() => onRewrite(draft.id)}
                onUndo={() => onUndo(draft.id)}
              />
            ))}
          </div>
        ))
      )}

      {showMaterial ? (
        <p className="text-sm text-muted-foreground">
          {t("studio.agent.outOfMaterial")}{" "}
          <Link to="/studio/new" className="font-semibold text-primary underline-offset-2 hover:underline">
            {t("studio.agent.outOfMaterialCta")}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function formatExpiry(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function DraftCard({
  draft,
  caption,
  busy,
  onCaption,
  onApprove,
  onSkip,
  onRewrite,
  onUndo,
}: {
  draft: PostingAgentDraftDto;
  caption: string;
  busy: boolean;
  onCaption: (value: string) => void;
  onApprove: () => void;
  onSkip: () => void;
  onRewrite: () => void;
  onUndo: () => void;
}) {
  const { t, i18n } = useTranslation();
  const destLabel = useDestinationLabel();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-foreground">{draft.projectTitle ?? t("studio.agent.untitled")}</p>
          <p className="text-sm text-muted-foreground">{destLabel(draft.destination, draft.lane)}</p>
        </div>
        {draft.expiresAt ? (
          <time dateTime={draft.expiresAt} className="text-sm text-muted-foreground">
            {t("labels.expiresOn", { date: formatExpiry(draft.expiresAt, i18n.language) })}
          </time>
        ) : null}
        {draft.postYourself ? (
          <p className="text-sm text-muted-foreground">{t("studio.agent.postYourself")}</p>
        ) : null}
        {draft.needsClip ? (
          <p className="text-sm text-muted-foreground">{t("studio.agent.needsClip")}</p>
        ) : null}
        <textarea
          className="min-h-24 rounded-md border border-input bg-background p-2 text-sm"
          value={caption}
          disabled={busy || draft.canUndo}
          onChange={(e) => onCaption(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {draft.canUndo ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onUndo}>
              {t("studio.agent.undo")}
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={busy || Boolean(draft.needsClip)} onClick={onApprove}>
                {t("studio.agent.approve")}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={onSkip}>
                {t("studio.agent.skip")}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onRewrite}>
                {t("studio.agent.rewrite")}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
