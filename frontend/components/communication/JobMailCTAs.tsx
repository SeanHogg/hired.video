// Job-related action buttons rendered into the InboxDetailSheet's
// top action bar — surfaces the tools-catalog deep-links that make
// sense for a synced job_opportunity / application_status /
// interview_invite / offer email so the user doesn't have to leave
// the inbox to act on it.
//
// Self-gates: renders nothing when the category isn't a job-mail
// category or when there's no actionable target (no linkedJobId AND
// no applyUrl(s)). Tool-deep-links require a `linkedJobId` since the
// /tools/* pages bind to a job by id; rendering a "Tailor resume"
// button with no jobId would land the user on an empty picker.
//
// Returns a Fragment of buttons (not a panel) so the parent's
// flex-wrap action bar lays them out alongside Mark unread / Dismiss
// / Mark as Junk / Open in gmail.
//
// Tool sourcing goes through `getCatalogToolsForEntity` so this stays
// in lock-step with the Tools page and the entity action-menus — the
// "DRY shared-component self-gates on entitlement" rule.

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
    <>
      {hasJobContext && (
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/jobs/${linkedJobId}`}>
              <Briefcase className="h-3.5 w-3.5 mr-1" />
              View job
            </Link>
          </Button>
          {tools.map((tool) => (
            <Button key={tool.id} variant="outline" size="sm" asChild>
              <Link to={tool.href}>
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                {tool.title}
              </Link>
            </Button>
          ))}
        </>
      )}
      {links.map((link, idx) => (
        <Button
          key={`${link.url}-${idx}`}
          variant="outline"
          size="sm"
          asChild
        >
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            {link.label ? truncateLabel(link.label, 50) : "Apply"}
          </a>
        </Button>
      ))}
    </>
  );
}

export default JobMailCTAs;
