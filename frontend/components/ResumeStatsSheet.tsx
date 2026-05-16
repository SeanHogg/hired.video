/**
 * ResumeStatsSheet — slide-out details panel for a resume's status,
 * privacy, scores, and per-resume statistics.
 *
 * Why a sheet and not inline badges:
 *   The Active / Master / Public chips + score sub-scores (ATS, KW, Fmt,
 *   Cnt, Imp, Sentiment) are an *internal* signal. Showing them on the
 *   public resume header leaks competitive information (e.g. that the
 *   owner's ATS score is 30) to peers who can see the resume but have
 *   no business consuming the scoring. Consolidating into a gated
 *   side-panel keeps the chrome clean while keeping the data
 *   accessible to viewers who are entitled to it.
 *
 * Self-gates per DRY rule: returns null when the viewer can't see the
 * stats, so callers can drop `<ResumeStatsSheet resume={resume} />`
 * inline without their own gate.
 */

import { Globe, Lock, Users, Star, Target, Eye } from "lucide-react";
import { useState } from "react";
import ResumeScoreBadges from "@/components/tools/ResumeScoreBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const [open, setOpen] = useState(false);

  if (!perms.canViewStats) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 gap-1"
        onClick={() => setOpen(true)}
        aria-label="View resume details"
        title="View resume details"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="text-xs">Details</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Resume details</SheetTitle>
            <SheetDescription>
              Status, visibility, and scoring for{" "}
              <strong>{resume.title}</strong>.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Status
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {resume.isActive && (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800 flex items-center gap-1"
                  >
                    <Target className="w-3 h-3" />
                    Active
                  </Badge>
                )}
                {resume.isMaster && (
                  <Badge
                    variant="secondary"
                    className="bg-yellow-100 text-yellow-800 flex items-center gap-1"
                  >
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
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {privacyHint(resume.privacy)}
              </p>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Scores
              </h3>
              <div className="flex flex-wrap items-center gap-1">
                <ResumeScoreBadges resume={resume} size="md" />
              </div>
              {resume.scores == null && resume.sentimentScore == null && (
                <p className="text-xs text-muted-foreground mt-2">
                  No scores have been computed for this resume yet.
                </p>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Activity
              </h3>
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
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
