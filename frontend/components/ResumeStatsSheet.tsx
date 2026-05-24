/**
 * ResumeStatsSheet — thin adapter on top of the shared <EntityDetailsSheet>
 * shell. The pre-#1019 implementation hand-built the same Status / Scores /
 * Activity layout that every other entity now reuses through the shared
 * primitive. Keeping the file name lets callers drop in
 * `<ResumeStatsSheet resume={…} />` without touching imports.
 *
 * Sections: Status (Active/Master/Privacy chips) + Scores
 * (<MetricBadgeCluster> over <ResumeScoreBadges>) + Metrics
 * (<ArtifactAnalyticsDashboard kind="resume"> — heatmap, geo, viewer
 * list, referrers, CTR) + Activity (views, created, updated).
 *
 * Self-gates per DRY rule: returns null when the viewer isn't entitled
 * via useResumePermissions, so consumers don't need a wrapping guard.
 */

import { Eye, Globe, Lock, Star, Target, Users } from "lucide-react";

import EntityDetailsSheet, {
  type EntityDetailsSection,
} from "@/components/shared/EntityDetailsSheet";
import { ArtifactAnalyticsDashboard } from "@/components/analytics";
import ResumeScoreBadges from "@/components/tools/ResumeScoreBadges";
import { Badge } from "@/components/ui/badge";
import { useResumePermissions } from "@/hooks/use-resume-permissions";
import { formatDate } from "@/lib/utils";
import type { Resume } from "@/types/resume";

interface Props {
  resume: Resume;
}

function privacyIcon(privacy?: string) {
  switch (privacy) {
    case "public":
      return <Globe className="w-3 h-3" />;
    case "recruiter_only":
    case "connections":
      return <Users className="w-3 h-3" />;
    default:
      return <Lock className="w-3 h-3" />;
  }
}

function privacyLabel(privacy?: string) {
  switch (privacy) {
    case "public":
      return "Public";
    case "recruiter_only":
      return "Recruiter Only";
    case "connections":
      return "Connections";
    default:
      return "Private";
  }
}

function privacyHint(privacy?: string) {
  switch (privacy) {
    case "public":
      return "Anyone with the link can view this resume.";
    case "recruiter_only":
      return "Visible to recruiters and employers only.";
    case "connections":
      return "Visible only to the owner's network connections.";
    default:
      return "Only the owner can view this resume.";
  }
}

export default function ResumeStatsSheet({ resume }: Props) {
  const perms = useResumePermissions(resume);

  const chips = (
    <>
      {resume.isActive && (
        <Badge variant="secondary" className="bg-green-100 text-green-800 flex items-center gap-1">
          <Target className="w-3 h-3" />
          Active
        </Badge>
      )}
      {resume.isMaster && (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
          <Star className="w-3 h-3" />
          Master
        </Badge>
      )}
      <Badge variant="secondary" className="flex items-center gap-1">
        {privacyIcon(resume.privacy)}
        {privacyLabel(resume.privacy)}
      </Badge>
      {!resume.isActive && !resume.isMaster && (
        <span className="text-xs text-muted-foreground">
          Variant (not active or master)
        </span>
      )}
    </>
  );

  const sections: EntityDetailsSection[] = [
    {
      key: "scores",
      label: "Scores",
      render: () => (
        <>
          <div className="flex flex-wrap items-center gap-1">
            <ResumeScoreBadges resume={resume} size="md" />
          </div>
          {resume.scores == null && resume.sentimentScore == null && (
            <p className="text-xs text-muted-foreground mt-2">
              No scores have been computed for this resume yet.
            </p>
          )}
        </>
      ),
    },
    {
      key: "metrics",
      label: "Metrics",
      render: () => (
        <ArtifactAnalyticsDashboard kind="resume" artifactId={resume.id} />
      ),
    },
    {
      key: "activity",
      label: "Activity",
      render: () => (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            Views
          </dt>
          <dd className="tabular-nums">{resume.viewCount ?? 0}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatDate(resume.createdAt)}</dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd>{formatDate(resume.updatedAt)}</dd>
        </dl>
      ),
    },
  ];

  return (
    <EntityDetailsSheet
      title={resume.title ?? "Resume details"}
      subtitle={privacyHint(resume.privacy)}
      chips={chips}
      sections={sections}
      canView={perms.canViewStats}
      layout="tabs"
    />
  );
}
