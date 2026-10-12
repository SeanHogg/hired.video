// Group the flat `applyUrls` array (one entry per `<a href>` the
// extractor pulled out of an email body) into per-job rows so the
// inbox detail sheet can render one `[Title] | [Apply]` button group
// per role instead of a wall of unlabeled / duplicated Apply buttons.
//
// Server-side extraction (`extractJobLinks` in
// `api/src/services/email-integration/dedup.ts`) is anchor-first +
// regex-keyword: every anchor whose href contains `apply|jobs|careers|
// posting|<ATS-domain>` is captured with its visible text. A LinkedIn
// Job Alerts digest typically yields BOTH a title anchor ("Founding
// CTO" → `/jobs/view/<id>`) AND an Apply anchor ("Apply" → same id)
// per role, plus a handful of alert-management anchors ("Manage
// alerts", "Edit alert", "Your job alert for X") that share the same
// `/jobs/` prefix and get swept in.
//
// This helper:
//   1. drops admin / alert-settings anchors by label + URL heuristics,
//   2. parses a stable job id from the URL (LinkedIn numeric, Indeed
//      `jk`, generic ATS slug),
//   3. merges the title-anchor + Apply-anchor pair for the same id
//      into one group, picking the longest non-Apply-like label as
//      the title,
//   4. emits ungrouped anchors as their own one-row entries so we
//      never lose a link the parser couldn't pair up.

export interface ExtractedJobLink {
  url: string;
  label: string | null;
}

export interface JobLinkGroup {
  /** Stable identifier the React key + group-merging logic both use.
   *  Carries a provider-prefix (`li:`, `ind:`, `slug:`) so two
   *  providers with overlapping numeric ranges don't collide. Null
   *  when no id could be parsed — the entry stays ungrouped. */
  jobId: string | null;
  /** Title shown on the primary button — the longest non-Apply-like
   *  anchor text, or "View role" when no descriptive label exists. */
  title: string;
  /** Destination of the title button (typically the job description
   *  page). Falls back to the apply URL when the title anchor itself
   *  was an "Apply"-labelled link. */
  viewUrl: string;
  /** Destination of the Apply button — distinct apply URL when the
   *  email shipped one, else the view URL so the button still works. */
  applyUrl: string;
}

const ADMIN_LABEL_RE =
  /\b(?:manage|edit|see all|view all|unsubscribe|preferences|your job alert|notification settings|email settings|alert settings)\b/i;
const ADMIN_PATH_RE =
  /\/(?:job[-_]?alert|jobs?\/alert|alerts?\/settings|preferences|notifications?\/settings|email[-_]?settings|unsubscribe|subscription)/i;
const APPLY_LABEL_RE = /^(?:easy\s+)?apply\b|^submit\b/i;

function parseJobId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname;

    // LinkedIn — /jobs/view/<id>, /comm/jobs/view/<id>, /jobs/<id>.
    // Numeric ids are 6+ digits; shorter matches would over-collide
    // with ATS posting numbers that happen to live under /jobs/.
    const linkedinMatch = /\/(?:comm\/)?jobs?\/(?:view\/)?(\d{6,})(?:\/|$)/.exec(path);
    if (linkedinMatch) return `li:${linkedinMatch[1]}`;

    // Indeed — viewjob?jk=<key>.
    const indeedJk = u.searchParams.get("jk");
    if (indeedJk) return `ind:${indeedJk}`;

    // Generic ATS posting slug — /jobs/<slug>, /postings/<slug>,
    // /opening/<slug>. Anchored at ≥6 chars so menu paths like
    // /jobs/alerts don't sneak in.
    const slugMatch =
      /\/(?:jobs?|postings?|opening|opportunit(?:y|ies))\/([a-z0-9][a-z0-9\-_]{5,})/i.exec(path);
    if (slugMatch) return `slug:${slugMatch[1].toLowerCase()}`;

    return null;
  } catch {
    return null;
  }
}

function isAdminLink(link: ExtractedJobLink): boolean {
  if (link.label && ADMIN_LABEL_RE.test(link.label)) return true;
  try {
    return ADMIN_PATH_RE.test(new URL(link.url).pathname);
  } catch {
    return false;
  }
}

function isApplyLabel(label: string | null): boolean {
  if (!label) return true;
  return APPLY_LABEL_RE.test(label.trim());
}

interface Accum {
  jobId: string;
  titleLabel: string | null;
  titleUrl: string | null;
  applyUrl: string | null;
  firstUrl: string;
}

export function groupJobLinks(links: ExtractedJobLink[]): JobLinkGroup[] {
  const filtered = links.filter((l) => !isAdminLink(l));

  const grouped = new Map<string, Accum>();
  const ungrouped: JobLinkGroup[] = [];

  for (const link of filtered) {
    const id = parseJobId(link.url);
    if (!id) {
      ungrouped.push({
        jobId: null,
        title:
          link.label && !isApplyLabel(link.label) ? link.label : "View role",
        viewUrl: link.url,
        applyUrl: link.url,
      });
      continue;
    }
    const acc = grouped.get(id) ?? {
      jobId: id,
      titleLabel: null,
      titleUrl: null,
      applyUrl: null,
      firstUrl: link.url,
    };
    if (isApplyLabel(link.label)) {
      if (!acc.applyUrl) acc.applyUrl = link.url;
    } else if (link.label) {
      // Prefer the longest descriptive label — LinkedIn often emits
      // both a short title and a longer "Director of X at Company"
      // anchor and we want the richer one on the button.
      if (!acc.titleLabel || link.label.length > acc.titleLabel.length) {
        acc.titleLabel = link.label;
        acc.titleUrl = link.url;
      }
    }
    grouped.set(id, acc);
  }

  const fromGrouped: JobLinkGroup[] = [...grouped.values()].map((acc) => ({
    jobId: acc.jobId,
    title: acc.titleLabel ?? "View role",
    viewUrl: acc.titleUrl ?? acc.applyUrl ?? acc.firstUrl,
    applyUrl: acc.applyUrl ?? acc.titleUrl ?? acc.firstUrl,
  }));

  return [...fromGrouped, ...ungrouped];
}
