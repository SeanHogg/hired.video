/**
 * EntityDocumentCanvas — the document-canvas design of a job posting or a
 * company page, rendered on that entity's public page (#274/#275). The page
 * renders through the SAME read-only `DocumentPagedView` the studio previews
 * and prints with (preview === render === view), filled with the entity row's
 * live content.
 *
 * Replaces the retired InteractiveCanvas plan (`InteractiveCanvasEditor` in the
 * edit form + `InteractiveCanvasView` on the page): the edit form is now the
 * studio's document canvas — its overlay plane carries the interactive layers
 * (charts, webcam, media) — so the owner edits there and this component shows
 * the result.
 *
 * Self-gating (no `canX` props): it resolves ownership itself.
 *   • Owner — sees their design (draft or public) with "Edit on canvas" and a
 *     "Show to visitors" switch; with no design yet, a start card.
 *   • Visitor — sees the design only when an owner made it public; otherwise
 *     the page's standard view (`children`) renders unchanged.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutTemplate, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { studioEditHref } from "@/lib/studio/studio-authoring";
import { useEntityDocument } from "@/lib/studio/document/use-entity-document";
import DocumentPagedView from "@/components/studio/document/DocumentPagedView";
import { cn } from "@/lib/utils";

type CanvasEntityKind = "job" | "company";

interface EntityDocumentCanvasProps {
  subject: { kind: CanvasEntityKind; id: string };
  /** The entity's owner (job poster / company account owner). */
  ownerUserId?: string | null;
  /** Further owners — a company's team members. */
  teamUserIds?: readonly string[];
  /** The page's standard view, shown whenever no design is visible. */
  children?: ReactNode;
  className?: string;
}

export default function EntityDocumentCanvas({
  subject,
  ownerUserId,
  teamUserIds = [],
  children,
  className,
}: EntityDocumentCanvasProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isOwner } = useEntityOwnership({
    ownerUserId,
    extraOwnerPredicates: [(viewerUserId) => teamUserIds.includes(viewerUserId)],
  });
  const authorIds = [ownerUserId, ...teamUserIds].filter((id): id is string => !!id);
  const { doc, loading, setPublic } = useEntityDocument({ subject, isOwner, authorIds });
  const editHref = studioEditHref(subject.kind, subject.id);

  if (loading) return <>{children}</>;

  if (!doc) {
    return (
      <>
        {isOwner && (
          <div className={cn("mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between", className)}>
            <div className="flex min-w-0 items-start gap-3">
              <LayoutTemplate className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{t(`entityCanvas.empty.${subject.kind}`)}</p>
                <p className="text-sm text-muted-foreground">{t("entityCanvas.emptyBody")}</p>
              </div>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link to={editHref}>{t("entityCanvas.start")}</Link>
            </Button>
          </div>
        )}
        {children}
      </>
    );
  }

  // A visitor sees only a design an owner made public.
  if (!isOwner && !doc.project.isPublic) return <>{children}</>;

  const toggleVisibility = async (isPublic: boolean) => {
    try {
      // Showing the design publishes the page: required fields first.
      const issues = await setPublic(isPublic);
      if (issues.length > 0) {
        toast({
          title: t("entityCanvas.publishBlocked"),
          description: issues.slice(0, 4).join(" · "),
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: t("entityCanvas.visibilityFailed"), variant: "destructive" });
    }
  };

  return (
    <section aria-label={t("entityCanvas.heading")} className={cn("mb-4 min-w-0", className)}>
      {isOwner && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">{t("entityCanvas.heading")}</span>
            {!doc.project.isPublic && (
              <span className="text-xs text-muted-foreground">{t("entityCanvas.privateNote")}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch
                checked={doc.project.isPublic}
                onCheckedChange={(checked) => void toggleVisibility(checked)}
                aria-label={t("entityCanvas.showToVisitors")}
              />
              {t("entityCanvas.showToVisitors")}
            </label>
            <Button asChild size="sm" variant="outline">
              <Link to={editHref}>
                <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("entityCanvas.edit")}
              </Link>
            </Button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30 p-2 sm:p-4">
        <DocumentPagedView state={doc.state} content={doc.content} mode="continuous" />
      </div>
    </section>
  );
}
