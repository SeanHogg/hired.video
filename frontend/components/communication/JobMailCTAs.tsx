// Job-related action panel inside the InboxDetailSheet — surfaces
// the tools-catalog deep-links that make sense for a synced
// job_opportunity / application_status / interview_invite / offer
// email so the user doesn't have to leave the inbox to act on it.
//
// Self-gates: renders nothing when the category isn't a job-mail
// category or when there's no actionable target (no linkedJobId AND
// no applyUrl(s)). Tool-deep-links require a `linkedJobId` since the
// /tools/* pages bind to a job by id; rendering a "Tailor resume"
// button with no jobId would land the user on an empty picker.
//
// Tool sourcing goes through `getCatalogToolsForEntity` so this stays
// in lock-step with the Tools page and the entity action-menus — the
// "DRY shared-component self-gates on entitlement" rule.

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, ExternalLink, Wand2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getCatalogToolsForEntity } from "@/data/tools-catalog";

/** Categories that warrant surfacing resume tools. Mirrors
 *  `JOB_INBOX_CATEGORIES` on the server but drops `rejection` — a
 *  rejection email doesn't need a Tailor button. */
const ACTIONABLE_JOB_CATEGORIES = new Set([
  "job_opportunity",
  "application_status",
  "recruiter_outreach",
  "interview_invite",
  "offer",
]);

/** Tool ids we want to surface as direct CTAs (top 3). Anything else
 *  from the catalog is reachable via /jobs/:id → Run Tool submenu. */
const PROMOTED_TOOL_IDS = ["resume-tailor", "job-resume-match", "value-proposition"];

export interface JobMailCTAsProps {
  category: string | null;
  linkedJobId: string | null;
  /** First extracted apply URL — kept for backwards compatibility
   *  with rows ingested before migration 0094 populated `applyUrls`. */
  applyUrl: string | null;
  /** Every apply URL the body contained, with optional anchor text.
   *  Populated for digest emails (LinkedIn Job Alerts, Indeed weekly,
   *  Wellfound newsletters) where one message lists N jobs. */
  applyUrls?: Array<{ url: string; label: string | null }> | null;
}

function truncateLabel(label: string, max = 70): string {
  if (label.length <= max) return label;
  return label.slice(0, max - 1).trimEnd() + "…";
}

export function JobMailCTAs({
  category,
  linkedJobId,
  applyUrl,
  applyUrls,
}: JobMailCTAsProps) {
  const { user } = useAuth();
  const isActionableCategory = !!category && ACTIONABLE_JOB_CATEGORIES.has(category);
  if (!isActionableCategory) return null;

  // Coalesce the two URL sources. Prefer the labelled array (post-
  // migration 0094); fall back to the scalar applyUrl for legacy
  // rows so the panel keeps rendering one Apply button.
  const links = (applyUrls && applyUrls.length > 0)
    ? applyUrls
    : applyUrl
      ? [{ url: applyUrl, label: null }]
      : [];

  const hasJobContext = !!linkedJobId;

  const tools = hasJobContext
    ? getCatalogToolsForEntity("job", linkedJobId!, user?.role).filter((t) =>
        PROMOTED_TOOL_IDS.includes(t.id),
      )
    : [];

  if (!hasJobContext && links.length === 0) return null;

  return (
    <div className="rounded border bg-emerald-50/40 border-emerald-200 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
        <Briefcase className="h-3.5 w-3.5" />
        {links.length > 1
          ? `Job actions · ${links.length} roles in this message`
          : "Job actions"}
      </div>

      {/* Tool deep-links require a linkedJobId. Rendered as a tight
          row above the apply-link list. */}
      {hasJobContext && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <Link to={`/jobs/${linkedJobId}`}>
              <Briefcase className="h-3.5 w-3.5 mr-1" />
              View job
            </Link>
          </Button>
          {tools.map((tool) => (
            <Button
              key={tool.id}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              asChild
            >
              <Link to={tool.href}>
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                {tool.title}
                {tool.tier === "pro" && (
                  <Badge
                    variant="outline"
                    className="ml-1 text-[9px] px-1 py-0 border-amber-300 text-amber-700 bg-amber-50"
                  >
                    PRO
                  </Badge>
                )}
              </Link>
            </Button>
          ))}
        </div>
      )}

      {/* Apply links — one per extracted URL. For digest emails this
          can be a list of 5+ roles; we render them as labelled
          buttons so the user can act on each without leaving the
          inbox. */}
      {links.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {links.map((link, idx) => (
            <Button
              key={`${link.url}-${idx}`}
              variant="outline"
              size="sm"
              className="h-auto py-1.5 px-2 text-xs justify-start whitespace-normal text-left"
              asChild
            >
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <span className="flex-1 break-words">
                  {link.label ? truncateLabel(link.label) : "Apply"}
                </span>
              </a>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export default JobMailCTAs;
