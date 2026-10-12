// Pure client-side pivot scoring for /pivot-explorer: match user skills
// against each sector's transferable-from-tech bridges and rank sectors.
// Shared by the ranked list (PivotExplorer page) and the drilldown.

import { pivotTargetSectors, type AIResilience, type SectorMeta } from "@shared/sectors";

export interface ScoredSector {
  meta: SectorMeta;
  matchScore: number;
  matchedSkills: string[];
}

export function scoreSector(meta: SectorMeta, userSkills: string[]): ScoredSector {
  const userLower = userSkills.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const matched: string[] = [];
  for (const bridge of meta.transferableFromTech) {
    const bridgeLower = bridge.toLowerCase();
    for (const skill of userLower) {
      if (skill.length < 3) continue;
      if (bridgeLower.includes(skill) || skill.includes(bridgeLower.split(" ")[0] ?? "")) {
        matched.push(bridge);
        break;
      }
    }
  }
  // Baseline score: count of transferable bridges (richer = more credible pivot)
  // Bonus: number of user skills that hit bridges
  const matchScore = meta.transferableFromTech.length + matched.length * 3;
  return { meta, matchScore, matchedSkills: matched };
}

export function rankSectors(userSkills: string[]): ScoredSector[] {
  return pivotTargetSectors()
    .map((m) => scoreSector(m, userSkills))
    .sort((a, b) => b.matchScore - a.matchScore);
}

/** i18n key for a sector's AI-resilience level label. */
export const RESILIENCE_LABEL_KEYS: Record<AIResilience, string> = {
  high: "pivotExplorer.resilience.high",
  medium: "pivotExplorer.resilience.medium",
  low: "pivotExplorer.resilience.low",
};
