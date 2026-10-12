// Job-actions card inside the InboxDetailSheet — surfaces the
// tools-catalog deep-links that make sense for a synced
// job_opportunity / application_status / interview_invite / offer
// email AND one [Title] | [Apply] button group per role the body
// listed, so the user doesn't have to leave the inbox to act on it.
//
// Self-gates: renders nothing when the category isn't a job-mail
// category or when there's no actionable target (no linkedJobId AND
// no applyUrl(s)). Tool-deep-links require a `linkedJobId` since the
// /tools/* pages bind to a job by id; rendering a "Tailor resume"
// button with no jobId would land the user on an empty picker.
//
// The emerald card visually separates "job actions" from the email
// actions (Mark unread / Dismiss / Mark as Junk / Open in gmail) the
// parent sheet renders at the very top.
//
// Anchor extraction can over-collect (Manage alerts, Edit alert,
// "Your job alert for X" all link to /jobs/ paths) and digest emails
// emit a title anchor + an Apply anchor for the same role — the
// shared [groupJobLinks](../../lib/email-rendering/group-job-links.ts)
// helper drops the admin anchors and pairs the title + Apply pair
// into one group so each role renders as `[Title] | [Apply]`.
//
// Tool sourcing goes through `getCatalogToolsForEntity` so this stays
// in lock-step with the Tools page and the entity action-menus — the
// "DRY shared-component self-gates on entitlement" rule.

import { Link } from "react-router-dom";
import { publicJobPath } from "@shared/public-paths";
import { Button } from "@/components/ui/button";
import { Briefcase, ExternalLink, Wand2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getCatalogToolsForEntity } from "@/data/tools-catalog";
import { groupJobLinks } from "@/lib/email-rendering/group-job-links";

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
  const rawLinks =
    applyUrls && applyUrls.length > 0
      ? applyUrls
      : applyUrl
        ? [{ url: applyUrl, label: null }]
        : [];

  const jobGroups = groupJobLinks(rawLinks);
  const hasJobContext = !!linkedJobId;

  const tools = hasJobContext
    ? getCatalogToolsForEntity("job", linkedJobId!, user?.role).filter((t) =>
        PROMOTED_TOOL_IDS.includes(t.id),
      )
    : [];

  if (!hasJobContext && jobGroups.length === 0) return null;

  return (
    <div className="rounded border bg-emerald-50/40 border-emerald-200 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
        <Briefcase className="h-3.5 w-3.5" />
        {jobGroups.length > 1
          ? `Job actions · ${jobGroups.length} roles in this message`
          : "Job actions"}
      </div>

      {hasJobContext && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <Link to={publicJobPath(linkedJobId)}>
              <Briefcase className="h-3.5 w-3.5 mr-1" />
              View tracked job
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
              </Link>
            </Button>
          ))}
        </div>
      )}

      {/* Per-role button groups. The title button + Apply button
          share a row so the user always sees which Apply belongs to
          which role. Multi-line text (long titles) wraps inside the
          title cell without expanding the Apply pill. */}
      {jobGroups.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {jobGroups.map((group, idx) => (
            <div
              key={group.jobId ?? `${group.viewUrl}-${idx}`}
              className="inline-flex rounded-md border border-emerald-200 bg-card overflow-hidden"
            >
              <a
                href={group.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-emerald-900 hover:bg-emerald-50 break-words"
              >
                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{truncateLabel(group.title)}</span>
              </a>
              <a
                href={group.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border-l border-emerald-200 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Apply
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default JobMailCTAs;
