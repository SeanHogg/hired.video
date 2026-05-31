/**
 * Company embedding SSoT — the surfaces a company can embed on its own site,
 * shared by the backend snippet builder, the embed key scopes, and the
 * frontend settings UI so they can't drift.
 */

export interface EmbedView {
  key: string;
  label: string;
  /** scope string an embed key must carry to render this view */
  scope: string;
  description: string;
}

export const EMBED_VIEWS: EmbedView[] = [
  {
    key: "roster",
    label: "Roster & Org Chart",
    scope: "people:roster",
    description: "Your team directory and org chart.",
  },
  {
    key: "one-on-ones",
    label: "1:1s",
    scope: "people:one-on-ones",
    description: "1:1 cadence with shared agendas and action items.",
  },
];

export const EMBED_VIEW_KEYS = EMBED_VIEWS.map((v) => v.key);

/** The placeholder shown in the copyable snippet. The real key is injected at
 *  build/deploy time from an env var — never committed to source. */
export const EMBED_KEY_PLACEHOLDER = "${HIRED_EMBED_KEY}";
