/**
 * EventMatchmakingService — ranks attendees against the viewer to
 * surface "people you should meet."
 *
 * v1 implementation: heuristic-only scorer that combines:
 *   • Role complementarity (recruiter↔job_seeker, employer↔job_seeker
 *     pairs score higher when both are looking for the same opportunity)
 *   • Skill / industry overlap (shared interests = conversation starter)
 *   • Headline keyword affinity (recruiter targeting senior backend ↔
 *     senior backend candidate)
 *
 * Writes scored rows into `event_matchmaking` (per (event, viewer, match)
 * unique). Read-through cache: a refresh wipes and re-inserts viewer's
 * rows for that event so the result reflects the current attendee list.
 *
 * v2 (gap #1254): swap the heuristic for an LLM call via the existing
 * `createLLMClient` use-case profile system. The interface here doesn't
 * change — only the `scorePair` implementation.
 */
import type { ApiDeps } from "../apiDeps.js";
import type { EventRow, EventAttendeeRow } from "../../repositories/eventsRepository.js";

export type MatchmakingDeps = Pick<ApiDeps, "repos" | "now">;

interface Candidate {
  userId: string;
  role: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[];
}

export class EventMatchmakingService {
  constructor(private readonly deps: MatchmakingDeps) {}

  /**
   * Regenerate the viewer's match list for one event.
   * Returns the top N matches sorted by score desc.
   */
  async refreshForViewer(
    eventId: string,
    viewerUserId: string,
    limit = 10,
  ): Promise<Array<{ matchUserId: string; score: number; reason: string }>> {
    const event = await this.deps.repos.events.findById(eventId);
    if (!event || !event.matchmakingEnabled) return [];

    const viewer = await this.loadCandidate(viewerUserId);
    if (!viewer) return [];

    const attendees = await this.deps.repos.events.findAttendeesByEvent(eventId, "going");
    const others = attendees.filter((a) => a.userId && a.userId !== viewerUserId);
    if (others.length === 0) return [];

    // Score each other-attendee against the viewer.
    const scored: Array<{ matchUserId: string; score: number; reason: string }> = [];
    for (const a of others) {
      const cand = await this.loadCandidate(a.userId!);
      if (!cand) continue;
      const { score, reason } = this.scorePair(viewer, cand, event);
      if (score <= 0) continue;
      scored.push({ matchUserId: a.userId!, score, reason });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, Math.min(50, limit)));

    // Persist into event_matchmaking (upsert per pair).
    for (const m of top) {
      await this.deps.repos.events.upsertMatch({
        eventId,
        viewerUserId,
        matchUserId: m.matchUserId,
        score: m.score,
        reason: m.reason,
      });
    }

    return top;
  }

  /** Read-only: returns the previously cached matches without recomputing. */
  async topForViewer(
    eventId: string,
    viewerUserId: string,
    limit = 10,
  ): Promise<Array<{ matchUserId: string; score: number; reason: string | null }>> {
    const rows = await this.deps.repos.events.topMatchesForViewer(eventId, viewerUserId, limit);
    return rows.map((r) => ({
      matchUserId: r.matchUserId,
      score: r.score,
      reason: r.reason,
    }));
  }

  // ─── Private ───────────────────────────────────────────────────────

  private async loadCandidate(userId: string): Promise<Candidate | null> {
    const u: any = await this.deps.repos.users.findById(userId);
    if (!u) return null;
    const profile = u.profile ?? {};
    const skillsRaw: unknown = profile.skills ?? profile.industries ?? [];
    const skills = Array.isArray(skillsRaw)
      ? skillsRaw.map((s) => String(s).toLowerCase()).filter(Boolean)
      : [];
    return {
      userId,
      role: u.role ?? null,
      headline: profile.headline ?? null,
      bio: profile.bio ?? profile.about ?? null,
      skills,
    };
  }

  private scorePair(
    viewer: Candidate,
    other: Candidate,
    event: EventRow,
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    // Role complementarity (max +40).
    const v = viewer.role;
    const o = other.role;
    if ((v === "recruiter" && o === "job_seeker") || (v === "job_seeker" && o === "recruiter")) {
      score += 40;
      reasons.push("Hiring side meets talent side");
    } else if ((v === "employer" && o === "job_seeker") || (v === "job_seeker" && o === "employer")) {
      score += 35;
      reasons.push("Founder/employer meets candidate");
    } else if (v === o && v === "job_seeker") {
      score += 15;
      reasons.push("Both actively networking");
    } else if (v === o && v === "recruiter") {
      score += 10;
      reasons.push("Recruiter community overlap");
    }

    // Skill overlap (max +40 — capped at 4 shared skills × 10).
    const overlap = viewer.skills.filter((s) => other.skills.includes(s));
    if (overlap.length > 0) {
      const bonus = Math.min(40, overlap.length * 10);
      score += bonus;
      reasons.push(`Shared interests: ${overlap.slice(0, 3).join(", ")}`);
    }

    // Headline keyword affinity (max +20). Cheap stop-word filter so
    // common words don't inflate the score.
    const STOP = new Set([
      "the", "and", "for", "with", "from", "this", "that", "your", "their",
      "are", "have", "has", "into", "out", "of", "in", "on", "at", "by",
      "a", "an", "to", "is", "as", "be", "or", "if", "it",
    ]);
    const tokens = (s: string | null) =>
      new Set(
        (s ?? "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 3 && !STOP.has(t)),
      );
    const vh = tokens(viewer.headline);
    const oh = tokens(other.headline);
    let headlineHits = 0;
    for (const t of vh) if (oh.has(t)) headlineHits++;
    if (headlineHits > 0) {
      score += Math.min(20, headlineHits * 5);
      reasons.push("Similar professional focus");
    }

    // Bonus if the event itself is networking-themed.
    if (event.category === "networking" || event.category === "coffee" || event.category === "mixer") {
      score += 5;
    }

    return {
      score: Math.min(100, Math.round(score)),
      reason: reasons.slice(0, 3).join(" · ") || "Both attending this event",
    };
  }
}
