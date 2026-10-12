/**
 * Approve-gate for agent drafts: daily caps, YouTube app-wide cap,
 * and TikTok/YouTube "post it yourself" overflow.
 *
 * A destination daily cap reschedules the draft to the next remaining
 * cadence slot this week, or expires it when none remain (R18).
 */
import {
  AGENT_CADENCES,
  AGENT_POST_IT_YOURSELF_EXPIRY_HOURS,
  AGENT_YOUTUBE_DAILY_MAX,
  type AgentCadence,
} from "../../../../shared/social-publish-jobs.js";
import {
  AGENT_DEFAULT_POST_MINUTE,
  AGENT_DEFAULT_QUIET_END,
  AGENT_DEFAULT_QUIET_START,
  isWithinDailyLimit,
  localDayStart,
  localWeekStart,
  nextPostSlot,
  slotsForWeek,
} from "../../../../shared/posting-agent.js";
import {
  countAgentJobs,
  expireOneAgentDraft,
  getAgentDraft,
  markAgentDraftPostYourself,
  updateAgentDraftSlot,
} from "../../repositories/socialPublishJobRepository.js";
import { getSettings } from "../../repositories/postingAgentSettingsRepository.js";
import { loadTimezone } from "./agent-timezone.js";

export type GateResult =
  | { ok: true }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "postYourself" }
  | { ok: false; reason: "capped" }
  | { ok: false; reason: "rescheduled"; runAt: Date }
  | { ok: false; reason: "expired" };

/** Written to last_error when a capped draft has no remaining cadence slot. */
export const AGENT_CAP_NO_SLOT_REASON = "Daily limit reached; no remaining slot this week.";

export interface AgentGateSettings {
  cadence: string;
  postMinute: number;
  quietStartMinute: number;
  quietEndMinute: number;
}

export interface GateAgentDraftDeps {
  getAgentDraft: typeof getAgentDraft;
  countAgentJobs: typeof countAgentJobs;
  markAgentDraftPostYourself: typeof markAgentDraftPostYourself;
  loadTimezone: (userId: string) => Promise<string>;
  getSettings: (userId: string) => Promise<AgentGateSettings | null>;
  updateAgentDraftSlot: typeof updateAgentDraftSlot;
  expireOneAgentDraft: typeof expireOneAgentDraft;
}

const defaults: GateAgentDraftDeps = {
  getAgentDraft,
  countAgentJobs,
  markAgentDraftPostYourself,
  loadTimezone,
  getSettings: async (userId) => {
    const row = await getSettings(userId);
    if (!row) return null;
    return {
      cadence: row.cadence,
      postMinute: row.postMinute,
      quietStartMinute: row.quietStartMinute,
      quietEndMinute: row.quietEndMinute,
    };
  },
  updateAgentDraftSlot,
  expireOneAgentDraft,
};

function asCadence(value: string | undefined): AgentCadence {
  return (AGENT_CADENCES as readonly string[]).includes(value ?? "")
    ? (value as AgentCadence)
    : "steady";
}

/** First cadence slot this week at/after nextPostSlot, not on today's (capped) local day. */
function nextFreeCadenceSlot(
  now: Date,
  tz: string,
  cadence: AgentCadence,
  postMinute: number,
  quietStart: number,
  quietEnd: number,
): Date | null {
  const next = nextPostSlot(now, postMinute, quietStart, quietEnd, tz);
  const weekStart = localWeekStart(now, tz);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weeklySlots = slotsForWeek(cadence, postMinute, tz, weekStart, weekEnd);
  const todayStart = localDayStart(now, tz);
  const remaining = weeklySlots.filter((slot) => {
    if (slot.getTime() < next.getTime()) return false;
    if (localDayStart(slot, tz).getTime() <= todayStart.getTime()) return false;
    return true;
  });
  return remaining[0] ?? null;
}

async function settleCappedDraft(
  draftId: string,
  userId: string,
  now: Date,
  tz: string,
  deps: GateAgentDraftDeps,
): Promise<GateResult> {
  const prefs = await deps.getSettings(userId);
  const cadence = asCadence(prefs?.cadence);
  const postMinute = prefs?.postMinute ?? AGENT_DEFAULT_POST_MINUTE;
  const quietStart = prefs?.quietStartMinute ?? AGENT_DEFAULT_QUIET_START;
  const quietEnd = prefs?.quietEndMinute ?? AGENT_DEFAULT_QUIET_END;
  const slot = nextFreeCadenceSlot(now, tz, cadence, postMinute, quietStart, quietEnd);
  if (slot) {
    const moved = await deps.updateAgentDraftSlot(draftId, userId, slot, slot, now);
    if (!moved) return { ok: false, reason: "missing" };
    return { ok: false, reason: "rescheduled", runAt: slot };
  }
  const expired = await deps.expireOneAgentDraft(draftId, userId, now, AGENT_CAP_NO_SLOT_REASON);
  if (!expired) return { ok: false, reason: "missing" };
  return { ok: false, reason: "expired" };
}

export async function gateAgentDraftApprove(
  draftId: string,
  userId: string,
  now: Date,
  deps: GateAgentDraftDeps = defaults,
): Promise<GateResult> {
  const draft = await deps.getAgentDraft(draftId, userId);
  if (!draft || draft.status !== "draft") return { ok: false, reason: "missing" };
  const settings = draft.postSettings as { postYourself?: boolean } | null;
  if (settings?.postYourself) return { ok: true };
  if (draft.destination === "youtube") {
    const yt = await deps.countAgentJobs({ destination: "youtube", since: localDayStart(now, "UTC") });
    if (yt >= AGENT_YOUTUBE_DAILY_MAX) {
      await deps.markAgentDraftPostYourself(
        draftId,
        userId,
        new Date(now.getTime() + AGENT_POST_IT_YOURSELF_EXPIRY_HOURS * 60 * 60 * 1000),
        now,
      );
      return { ok: false, reason: "postYourself" };
    }
  }
  const tz = await deps.loadTimezone(userId);
  const count = await deps.countAgentJobs({
    userId,
    destination: draft.destination,
    since: localDayStart(now, tz),
  });
  if (!isWithinDailyLimit(count, draft.destination)) {
    return settleCappedDraft(draftId, userId, now, tz, deps);
  }
  return { ok: true };
}
