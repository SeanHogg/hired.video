import { Eye, Calendar, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { publicResumePath } from "@shared/public-paths";
import type { ResumeScores } from "@shared/scores";
import { CardContent } from "@/components/ui/card";
import { OwnerMetricsRow, Metric } from "@/components/ui/OwnerMetricsRow";
import EntityMedia from "@/components/studio/EntityMedia";
import ResumeScoreBadges from "@/components/tools/ResumeScoreBadges";
import { formatDate } from "@/lib/utils";
import type { ResumeWithOwnership } from "@/types/resume";
import ResumeVariationsSlider from "./ResumeVariationsSlider";

interface ResumeCardContentProps {
  id: string;
  userId?: string;
  slug?: string;
  summary: string;
  createdAt: string;
  views: number;
  scores?: ResumeScores | null;
  sentimentScore?: number | null;
  parentId?: string;
  parentName?: string;
  variations?: ResumeWithOwnership[];
  hasChildren: boolean;
  isOwner: boolean;
  canViewStats: boolean;
  onScoreClick?: (toolIds: readonly string[]) => void;
}

/** Body of `ResumeCard` — parent ref, summary, metadata, media, variants. */
export default function ResumeCardContent({
  id,
  userId,
  slug,
  summary,
  createdAt,
  views,
  scores,
  sentimentScore,
  parentId,
  parentName,
  variations,
  hasChildren,
  isOwner,
  canViewStats,
  onScoreClick,
}: ResumeCardContentProps) {
  const { t } = useTranslation();
  return (
    <CardContent className="flex-1">
      <div className="space-y-4">
        {/* Parent reference — only rendered when this card is a variant.
            Clickable so the user can jump straight to the primary resume. */}
        {parentId && parentName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Copy className="w-3 h-3 shrink-0" />
            <span>{t("resumeCard.variationOf")}</span>
            <Link
              to={publicResumePath(parentId)}
              className="font-medium text-foreground hover:text-primary transition-colors truncate"
              title={parentName}
            >
              {parentName}
            </Link>
          </div>
        )}

        {/* Professional Summary */}
        <div className="p-4 bg-primary text-primary-foreground rounded-lg">
          <h4 className="font-bold text-lg mb-2">{t("resumeCard.professionalSummary")}</h4>
          <p className="text-sm leading-relaxed opacity-95 line-clamp-3">
            {summary}
          </p>
        </div>

        {/* Metadata - Mobile Responsive Layout */}
        <div className="space-y-2 text-xs text-muted-foreground">
          {/* Created date + view count share a row. Views are owner-only;
              non-owners just see the date. The "X views" Metric retains
              the eye icon so it stays visually parsable in the same row. */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span className="text-xs">{t("resumeCard.created")}</span>
              <span className="font-medium text-foreground">
                {formatDate(createdAt, { year: "numeric", month: "short", day: "numeric" }, t("resumeCard.noDate"))}
              </span>
            </div>
            <OwnerMetricsRow isOwner={isOwner} className="gap-2">
              <Metric icon={Eye} value={views || 0} label={t("resumeCard.views")} />
            </OwnerMetricsRow>
          </div>

          {/* Tool scores row — visible to anyone who can view resume
              stats (owner + recruiter / employer / admin / SA per #671).
              ResumeScoreBadges still self-gates on whether any score has
              been computed yet. Clicking a chip opens the tool-history
              sheet pre-expanded on the tool that produced the score. */}
          {canViewStats && (
            <ResumeScoreBadges
              resume={{ scores, sentimentScore }}
              onChipClick={onScoreClick}
            />
          )}

          {/* Slug Row - Only show if exists */}
          {slug && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t("resumeCard.slug")}</span>
              <span className="font-mono text-foreground break-all">{slug}</span>
            </div>
          )}
        </div>

        {/* Studio media linked to this resume (#270). EntityMedia
            re-runs `useEntityOwnership({ ownerUserId })` so its own
            create-chip gate stays in lockstep with this card's
            `isOwner`, and renders any mediaKind the owner attached
            (video / image / podcast / game / animation). */}
        <EntityMedia
          subject={{ kind: "resume", id }}
          ownerUserId={userId}
        />

        {hasChildren && variations && <ResumeVariationsSlider variations={variations} />}
      </div>
    </CardContent>
  );
}
