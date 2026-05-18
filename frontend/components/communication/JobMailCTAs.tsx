// Job-related action panel inside the InboxDetailSheet — surfaces
// the tools-catalog deep-links that make sense for a synced
// job_opportunity / application_status / interview_invite / offer
// email so the user doesn't have to leave the inbox to act on it.
//
// Self-gates: rendering nothing when (a) the category isn't a
// job-mail category or (b) we don't have a linkedJobId to bind tools
// to (without an id, the deep-links degrade to "pick a job" — same
// flow the user gets from /tools, no inbox-specific value).
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
  applyUrl: string | null;
}

export function JobMailCTAs({ category, linkedJobId, applyUrl }: JobMailCTAsProps) {
  const { user } = useAuth();
  const isActionableCategory = !!category && ACTIONABLE_JOB_CATEGORIES.has(category);
  if (!isActionableCategory) return null;

  // Without a linkedJobId, deep-linking tools is meaningless (they'd
  // ask the user to pick a job). The Apply URL is still useful, so
  // we render a minimal panel below if applyUrl is set.
  const hasJobContext = !!linkedJobId;

  const tools = hasJobContext
    ? getCatalogToolsForEntity("job", linkedJobId!, user?.role).filter((t) =>
        PROMOTED_TOOL_IDS.includes(t.id),
      )
    : [];

  if (!hasJobContext && !applyUrl) return null;

  return (
    <div className="rounded border bg-emerald-50/40 border-emerald-200 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
        <Briefcase className="h-3.5 w-3.5" />
        Job actions
      </div>
      <div className="flex flex-wrap gap-2">
        {hasJobContext && (
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <Link to={`/jobs/${linkedJobId}`}>
              <Briefcase className="h-3.5 w-3.5 mr-1" />
              View job
            </Link>
          </Button>
        )}
        {applyUrl && (
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <a href={applyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Apply
            </a>
          </Button>
        )}
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
    </div>
  );
}

export default JobMailCTAs;
