// Shared blind-review constants for the scorecards UI (#1380). The mode
// labels + descriptions are the source of truth for every surface that
// renders the picker or the "Identity hidden" / "Peers hidden" badges.
//
// Backend authority: `interview_kits.blind_review_mode` + the masking
// rules in [blindReview.ts](api/src/domains/scorecards/blindReview.ts).

export const BLIND_REVIEW_MODES = [
  "off",
  "anonymize_candidate",
  "hide_peer_scorecards",
  "both",
] as const;
export type BlindReviewMode = (typeof BLIND_REVIEW_MODES)[number];

interface ModeMeta {
  label: string;
  description: string;
  anonymizesCandidate: boolean;
  hidesPeers: boolean;
}

export const BLIND_REVIEW_MODE_META: Record<BlindReviewMode, ModeMeta> = {
  off: {
    label: "Off",
    description: "Evaluators see the candidate's identity and peer scorecards as usual.",
    anonymizesCandidate: false,
    hidesPeers: false,
  },
  anonymize_candidate: {
    label: "Hide candidate identity",
    description:
      "Evaluators see the rubric only — candidate name + photo are hidden. Hiring managers always see the full record.",
    anonymizesCandidate: true,
    hidesPeers: false,
  },
  hide_peer_scorecards: {
    label: "Hide peer scorecards",
    description:
      "Evaluators can't see other interviewers' scorecards until they submit their own. Reduces groupthink.",
    anonymizesCandidate: false,
    hidesPeers: true,
  },
  both: {
    label: "Hide identity + peer scorecards",
    description:
      "Full blind review — candidate identity hidden AND peer scorecards locked until the evaluator submits.",
    anonymizesCandidate: true,
    hidesPeers: true,
  },
};

export function parseBlindReviewMode(raw: string | null | undefined): BlindReviewMode {
  if (raw && (BLIND_REVIEW_MODES as readonly string[]).includes(raw)) {
    return raw as BlindReviewMode;
  }
  return "off";
}
