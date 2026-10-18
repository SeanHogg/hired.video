/**
 * teamLeaderboard.ts — per team-member rollup of pipeline activity for one
 * company (`GET /api/services/team/leaderboard`). Recruiters see this on
 * /companies?tab=team. Powers the "Performance dashboards & team
 * leaderboards" Pricing claim.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { HiringAnalyticsRepository } from "../../repositories/hiringAnalyticsRepository.js";
import { hasActiveCompanyMembership } from "../../repositories/listsRepository.js";

export interface TeamLeaderboardRow {
  userId: string;
  name: string;
  role: string;
  candidates: number;
  active: number;
  hires: number;
  rejected: number;
  submitted: number;
  touchpoints: number;
  stageChanges: number;
  lastActivityAt: string | null;
}

export interface TeamLeaderboard {
  rows: TeamLeaderboardRow[];
  days: number;
  generatedAt: string;
}

function bumpLastActivity(row: TeamLeaderboardRow, at: Date | string): void {
  const ts = at instanceof Date ? at : new Date(at);
  if (!row.lastActivityAt || ts > new Date(row.lastActivityAt)) row.lastActivityAt = ts.toISOString();
}

/**
 * Leaderboard for `companyId` over the last `days`. The caller must be an
 * active member of the company unless `bypassMembership` (super-admin).
 */
export async function getTeamLeaderboard(input: {
  userId: string;
  companyId: string;
  days: number;
  bypassMembership: boolean;
}): Promise<TeamLeaderboard> {
  const { userId, companyId, days } = input;
  if (!input.bypassMembership && !(await hasActiveCompanyMembership(userId, companyId))) {
    throw new DomainError(403, "FORBIDDEN", "You are not a member of this company");
  }

  const repo = new HiringAnalyticsRepository(getDb());
  const members = await repo.activeCompanyMembers(companyId);
  if (members.length === 0) return { rows: [], days, generatedAt: new Date().toISOString() };

  const memberIds = members.map((m) => m.userId);
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Company scope is approximated via jobs posted by any member, since
  // job_items has no company FK yet (#3 deferred). SECURITY: this leaks
  // across teams whose members co-posted jobs — same v1 constraint as the
  // rest of the recruit surface.
  const [owned, touchpoints] = await Promise.all([
    repo.pipelineOwnershipForPosters(memberIds),
    repo.touchpointsSince(memberIds, sinceDate),
  ]);

  const byUser = new Map<string, TeamLeaderboardRow>();
  for (const m of members) {
    byUser.set(m.userId, {
      userId: m.userId,
      name: m.name ?? m.email ?? "(no name)",
      role: m.role,
      candidates: 0,
      active: 0,
      hires: 0,
      rejected: 0,
      submitted: 0,
      touchpoints: 0,
      stageChanges: 0,
      lastActivityAt: null,
    });
  }

  for (const r of owned) {
    const row = r.ownerId ? byUser.get(r.ownerId) : undefined;
    if (!row) continue;
    row.candidates += 1;
    if (r.stage === "hired") row.hires += 1;
    else if (r.stage === "rejected") row.rejected += 1;
    else row.active += 1;
    if (r.stage === "submitted") row.submitted += 1;
    bumpLastActivity(row, r.stageChangedAt);
  }

  for (const t of touchpoints) {
    const row = t.performedByUserId ? byUser.get(t.performedByUserId) : undefined;
    if (!row) continue;
    row.touchpoints += 1;
    if (t.type === "stage_change") row.stageChanges += 1;
    bumpLastActivity(row, t.createdAt);
  }

  const rows = Array.from(byUser.values()).sort((a, b) => b.hires - a.hires || b.touchpoints - a.touchpoints);
  return { rows, days, generatedAt: new Date().toISOString() };
}
