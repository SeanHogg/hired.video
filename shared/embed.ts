/**
 * Company embedding SSoT — the surfaces a company can embed on its own site
 * ("Powered by hired.video" shells). Shared
 * by the backend snippet builder, the embed key scopes, and the frontend
 * settings UI so they can't drift.
 *
 * This catalog is the authoritative list of hired.video's **Operational
 * Cadence (CHRO)** surfaces. Not every capability becomes a bespoke embedded
 * component — we offer the *functionality*, and reuse what hired.video already
 * has (e.g. the existing calendar) rather than rebuilding it.
 *
 * Each surface carries a `status`:
 *   • "available"      — embeddable now.
 *   • "reuse-existing" — the capability already exists in hired.video under
 *                        another surface; embedding wires to it (no rebuild).
 *   • "planned"        — net-new People-Ops surface, tracked to a build phase.
 */

export type EmbedSurfaceStatus = "available" | "reuse-existing" | "planned";

export interface EmbedSurface {
  key: string;
  label: string;
  /** scope string an embed key must carry to render this surface */
  scope: string;
  description: string;
  status: EmbedSurfaceStatus;
  /** for reuse-existing: where the capability already lives; for planned: the gap id */
  note?: string;
}

/**
 * The full Operational Cadence (CHRO) surface catalog for hired.video
 * People Ops. Snippets are only offered for
 * `available` surfaces; the rest are declared for the roadmap + so the embed
 * loader (#1826) knows the complete view set.
 */
export const EMBED_SURFACES: EmbedSurface[] = [
  // ── Available now ─────────────────────────────────────────────────────────
  {
    key: "roster",
    label: "Roster & Org Chart",
    scope: "people:roster",
    description: "Your team directory and org chart.",
    status: "available",
  },
  {
    key: "one-on-ones",
    label: "1:1s",
    scope: "people:one-on-ones",
    description: "1:1 cadence with shared agendas and action items.",
    status: "available",
  },
  {
    key: "goals",
    label: "Goals & OKRs",
    scope: "people:goals",
    description: "Team OKRs with key-result progress rollup.",
    status: "available",
  },
  {
    key: "team-health",
    label: "Team Health",
    scope: "people:team-health",
    description: "Composite team-health score across five dimensions.",
    status: "available",
  },

  // ── Reuse existing hired.video capability (no rebuild) ─────────────────────
  {
    key: "calendar",
    label: "Calendar",
    scope: "people:calendar",
    description: "Scheduling + calendar — reuses hired.video's existing calendar.",
    status: "reuse-existing",
    note: "calendar_connections / scheduled_events (routes/calendar.ts) — 1:1s, check-ins, syncs surface here too.",
  },
  {
    key: "bookings",
    label: "Bookings",
    scope: "people:bookings",
    description: "Bookable meeting/interview slots with magic-link reservations.",
    status: "reuse-existing",
    note: "Extend existing interview-assignments / live-screen scheduling rather than a parallel booking cluster.",
  },
  {
    key: "teams",
    label: "Team Management",
    scope: "people:teams",
    description: "Manage members & teams.",
    status: "reuse-existing",
    note: "user_company_role_associations + workforce roster + account invitations (the employee foundation).",
  },

  // ── Planned net-new People-Ops surfaces (build phases) ─────────────────────
  {
    key: "strategy",
    label: "Strategy (OKRs / Goals / Objectives / Milestones)",
    scope: "people:strategy",
    description: "Company → team → individual OKRs and strategic objectives.",
    status: "planned",
    note: "#1814 — extend performance_goals; net-new strategic_objectives/milestones.",
  },
  {
    key: "performance-reviews",
    label: "Performance Reviews",
    scope: "people:performance",
    description: "Review cycles, ratings, 360 feedback.",
    status: "planned",
    note: "#1814 — segment-scope the existing performance_cycles/reviews.",
  },
  {
    key: "check-ins",
    label: "Check-ins",
    scope: "people:check-ins",
    description: "Scheduled async check-ins (cron-driven).",
    status: "planned",
    note: "#1815.",
  },
  {
    key: "pulse-checks",
    label: "Pulse Checks",
    scope: "people:pulse",
    description: "Recurring team-health pulse surveys.",
    status: "planned",
    note: "#1815.",
  },
  {
    key: "weekly-syncs",
    label: "Weekly Syncs",
    scope: "people:weekly-syncs",
    description: "IDS-style weekly sync agenda + metrics.",
    status: "planned",
    note: "#1816 — action items mirror to the tasks-backed canonical store.",
  },
  {
    key: "scorecards",
    label: "Scorecards",
    scope: "people:scorecards",
    description: "Operating-cadence metric scorecards + period snapshots.",
    status: "planned",
    note: "#1816 — DISTINCT from the existing recruiting interview scorecards.",
  },
  {
    key: "meeting-intelligence",
    label: "Meeting Intelligence",
    scope: "people:meeting-intelligence",
    description: "AI meeting notes, summaries, and action-item extraction.",
    status: "planned",
    note: "#1816 — via the builderforce AI gateway (ops.* use cases).",
  },
  {
    key: "workflows",
    label: "Workflow Automation",
    scope: "people:workflows",
    description: "Trigger-action workflows for onboarding / offboarding / PTO.",
    status: "planned",
    note: "#1816 — includes the execution engine the source never built.",
  },
  {
    key: "slack",
    label: "Slack Integration",
    scope: "people:slack",
    description: "Slack notifications for People-Ops events.",
    status: "planned",
    note: "#1816.",
  },
];

/** Surfaces embeddable right now — what the snippet UI offers. */
export const EMBED_VIEWS = EMBED_SURFACES.filter((s) => s.status === "available");

export const EMBED_VIEW_KEYS = EMBED_VIEWS.map((v) => v.key);

/** The roadmap (reuse-existing + planned) — shown as "rolling out" + consumed
 *  by the embed-back rail to enumerate the complete Operational Cadence set. */
export const EMBED_ROADMAP = EMBED_SURFACES.filter((s) => s.status !== "available");

/** The placeholder shown in the copyable snippet. The real key is injected at
 *  build/deploy time from an env var — never committed to source. */
export const EMBED_KEY_PLACEHOLDER = "${HIRED_EMBED_KEY}";

// ── Video embed snippet (#1860) ──────────────────────────────────────────────
// Public video embeds are KEYLESS — a published Studio video is public
// marketing content, unlike the company-data surfaces above (which need a
// scoped key). Single source of truth for the snippet so the Studio
// "Embed" dialog and any docs/tests render identical markup.

/**
 * Build the copy-paste snippet that renders a published Studio video on
 * any third-party site. `videoId` is the Studio project id; the loader
 * resolves it to the rendered CDN video server-side.
 */
export function buildVideoEmbedSnippet(opts: {
  origin: string;
  videoId: string;
}): string {
  return [
    `<div data-hired-video-embed></div>`,
    `<script async src="${opts.origin}/embed/video/loader.js" data-hired-video="${opts.videoId}"></script>`,
  ].join("\n");
}
