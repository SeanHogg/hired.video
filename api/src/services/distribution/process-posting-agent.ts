/**
 * AI Posting Agent cron processor (#2300).
 *
 * Runs on quarter ticks that aren't half ticks (:15 and :45). Per run:
 *   1. expire up to 50 agent drafts past run_at
 *   2. claim AGENT_PLANS_PER_RUN users whose next_plan_at is due
 *   3. for each: Pro check (lapse → pause + cancel open jobs), quiet-hours
 *      slot shift, per-destination daily cap, TikTok "post it yourself",
 *      clip pick (fresh window + scene snap), template/LLM caption,
 *      insert draft (or scheduled, in auto mode) jobs, weekly digest
 *
 * Kill switch: POSTING_AGENT_ENABLED=false → planner returns immediately.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { resumeInformation, studioProjects } from "../../db/schema/resumes.js";
import { videos } from "../../db/schema/videos.js";
import { studioCaptions, studioChapters, studioVoiceovers } from "../../db/schema/studiofeatures.js";
import { userProfiles } from "../../db/schema/users.js";
import { loadTimezone } from "./agent-timezone.js";
import { sendAgentDigest } from "./agent-digest.js";
import { agentHubUrl, liveAgentDigestDeps } from "./agent-digest-live.js";
import { pausePostingAgent } from "./pause-posting-agent.js";
import {
  findDueForPlanning,
  updateNextPlanAt,
} from "../../repositories/postingAgentSettingsRepository.js";
import {
  insertJobs,
  expireAgentDrafts,
  countAgentJobs,
  countUserAgentJobsSince,
  listAgentClipHistory,
  type AgentClipHistory,
} from "../../repositories/socialPublishJobRepository.js";
import { loadIsProForUsers } from "../billing/effectiveUserPlan.js";
import { getTokenBudgetSummary } from "../billing/BillingService.js";
import { hasAiTextProvider, createAiTextCaller } from "../adapters/ai-text-caller.js";
import { hasTokensForAiCall } from "../../../../shared/pricing.js";
import {
  AGENT_PLANS_PER_RUN,
  AGENT_COOLDOWN_DAYS,
  AGENT_POST_IT_YOURSELF_EXPIRY_HOURS,
  AGENT_YOUTUBE_DAILY_MAX,
  captionLimitFor,
  type AgentCadence,
  type DistributionDestination,
} from "../../../../shared/social-publish-jobs.js";
import {
  computeNextPlanTime,
  isWithinDailyLimit,
  isTikTokReady,
  isInCooldown,
  nextPostSlot,
  localDayStart,
  localWeekStart,
  slotsForWeek,
  fitCaption,
  clipSecondsForMaster,
  normalizeVideoDurationSec,
  windowsFromDuration,
  selectAgentClip,
  rotateProjects,
  variantKeyForClip,
  transcriptForClip,
  type HighlightWindow,
  type TimedWord,
} from "../../../../shared/posting-agent.js";
import {
  generateSocialCaption,
  type CaptionSource,
  type CaptionTarget,
  type AiTextCaller,
} from "../../../../shared/social-caption.js";
import type { VideoPublishPlatform } from "../../../../shared/social-platforms.js";
import { logger } from "../../lib/logger.js";

export interface DistributionEnv {
  TIKTOK_CONTENT_POSTING_AUDIT?: string;
  POSTING_AGENT_ENABLED?: string;
}

const MAX_CAPTIONS_PER_CALL = 20;

export async function processPostingAgent(env?: DistributionEnv): Promise<void> {
  if (env?.POSTING_AGENT_ENABLED === "false") return;

  await expireAgentDrafts();

  const dueUsers = await findDueForPlanning(AGENT_PLANS_PER_RUN);
  for (const settings of dueUsers) {
    await planUser(settings, nowOr(), env);
  }
}

function nowOr(): Date {
  return new Date();
}

async function planUser(
  settings: Awaited<ReturnType<typeof findDueForPlanning>>[0],
  now: Date,
  env?: DistributionEnv,
): Promise<void> {
  const userId = settings.userId;
  const cadence = settings.cadence as AgentCadence;

  const pro = await loadIsProForUsers([userId]);
  if (!pro.get(userId)) {
    await pausePostingAgent(userId, "plan");
    return;
  }

  const dests = (Array.isArray(settings.destinations) ? settings.destinations : ["feed"]) as string[];
  const tz = await loadTimezone(userId);
  const slot = nextPostSlot(now, settings.postMinute, settings.quietStartMinute, settings.quietEndMinute, tz);
  const db = getDb();

  const candidates = await db
    .select({
      id: studioProjects.id,
      videoId: studioProjects.videoId,
      resumeId: studioProjects.resumeId,
      title: videos.title,
      duration: videos.duration,
      updatedAt: studioProjects.updatedAt,
    })
    .from(studioProjects)
    .innerJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(and(eq(studioProjects.userId, userId), eq(studioProjects.status, "ready")))
    .limit(20);

  if (candidates.length === 0) {
    await updateNextPlanAt(userId, computeNextPlanTime(now, cadence));
    return;
  }

  const history = await listAgentClipHistory(
    userId,
    candidates.map((p) => p.id),
  );
  const rotated = rotateProjects(
    candidates.map((p) => ({
      projectId: p.id,
      lastAgentPostedAt: lastPostedAt(history, p.id),
      lastPublishedAt: p.updatedAt ?? new Date(0),
    })),
  );
  const byId = new Map<string, AgentProject>(
    candidates.map((p) => [p.id, { id: p.id, title: p.title, duration: p.duration, resumeId: p.resumeId }]),
  );
  const sceneStarts = await loadSceneStarts(
    candidates.map((p) => p.id),
    db,
  );
  const wordsByProject = await loadClipWords(
    candidates.map((p) => p.id),
    db,
  );
  const resumePack = await loadResumeTexts(
    userId,
    candidates.map((p) => p.resumeId).filter((id): id is string => Boolean(id)),
    db,
  );

  const budget = await getTokenBudgetSummary(userId).catch(() => ({ totalAvailable: 0 }));
  const tokensOk = hasTokensForAiCall(budget.totalAvailable);
  const aiCaller = await buildCaptionCaller(userId, tokensOk, env);

  const dayStart = localDayStart(now, tz);
  const utcDayStart = localDayStart(now, "UTC");
  const weekStart = localWeekStart(now, tz);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weeklySlots = slotsForWeek(cadence, settings.postMinute, tz, weekStart, weekEnd);
  let remainingSlots = Math.max(0, weeklySlots.length - (await countUserAgentJobsSince(userId, weekStart)));
  let captionsThisRun = 0;
  const insertedDrafts: Array<{
    id: string;
    destination: string;
    caption: string;
    scheduledAt: Date | null;
    projectTitle: string | null;
  }> = [];

  for (const dest of dests) {
    if (remainingSlots <= 0) break;

    const todayCount = await countAgentJobs({ userId, destination: dest, since: dayStart });
    if (!isWithinDailyLimit(todayCount, dest)) continue;

    let postYourself = dest === "tiktok" && !isTikTokReady(env?.TIKTOK_CONTENT_POSTING_AUDIT === "true");
    if (dest === "youtube") {
      const ytCount = await countAgentJobs({ destination: "youtube", since: utcDayStart });
      if (ytCount >= AGENT_YOUTUBE_DAILY_MAX) postYourself = true;
    }

    const pick = pickProjectForDest(rotated, byId, history, dest, now, sceneStarts);
    if (!pick) continue;

    const runAt = postYourself
      ? new Date(slot.getTime() + AGENT_POST_IT_YOURSELF_EXPIRY_HOURS * 60 * 60 * 1000)
      : slot;

    const platform: VideoPublishPlatform =
      dest === "feed" || dest === "tiktok" ? "linkedin" : (dest as VideoPublishPlatform);
    const target: CaptionTarget = {
      platforms: [platform],
      tone: "professional",
      maxLength: captionLimitFor(dest as DistributionDestination),
    };
    const resumeText =
      (pick.project.resumeId ? resumePack.byResumeId.get(pick.project.resumeId) : undefined) ||
      resumePack.profile ||
      "";
    const windowTranscript = transcriptForClip(
      wordsByProject.get(pick.project.id) ?? [],
      pick.clip.startSecond,
      pick.clip.endSecond,
    );
    const captionSource: CaptionSource = {
      transcript: windowTranscript || resumeText || pick.project.title || "",
      resumeText,
    };

    const generated =
      captionsThisRun < MAX_CAPTIONS_PER_CALL
        ? await generateSocialCaption(captionSource, target, aiCaller)
        : await generateSocialCaption(captionSource, target, null);
    captionsThisRun += 1;

    const raw = [generated.hook, generated.caption, generated.hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
    const caption = fitCaption(raw, captionLimitFor(dest as DistributionDestination));

    const clipSec = Math.round(pick.clip.endSecond - pick.clip.startSecond);
    const status = settings.mode === "auto" && !postYourself ? "scheduled" : "draft";
    const rows = await insertJobs([
      {
        projectId: pick.project.id,
        createdBy: userId,
        destination: dest,
        lane: "self",
        caption,
        scheduledAt: slot,
        runAt,
        status,
        source: "agent",
        captionSource: aiCaller && captionsThisRun <= MAX_CAPTIONS_PER_CALL ? "ai" : "template",
        postSettings: {
          ...(postYourself ? { postYourself: true } : {}),
          clip: pick.clip,
          variantKey: variantKeyForClip("9x16", clipSec, pick.clip.startSecond),
        },
      },
    ]);
    remainingSlots -= 1;
    for (const row of rows) {
      if (row.status === "draft") {
        insertedDrafts.push({
          id: row.id,
          destination: row.destination,
          caption: row.caption,
          scheduledAt: row.scheduledAt,
          projectTitle: pick.project.title,
        });
      }
    }
  }

  if (settings.mode === "approve" && insertedDrafts.length > 0) {
    try {
      await sendAgentDigest(
        {
          userId,
          emailDigest: settings.emailDigest,
          quietStartMinute: settings.quietStartMinute,
          quietEndMinute: settings.quietEndMinute,
          timezone: tz,
          drafts: insertedDrafts.map((d) => ({
            id: d.id,
            projectTitle: d.projectTitle,
            destination: d.destination,
            scheduledAt: d.scheduledAt,
          })),
          hubUrl: agentHubUrl(),
        },
        liveAgentDigestDeps(),
      );
    } catch (err) {
      logger.warn("[posting-agent] digest failed", err);
    }
  }

  await updateNextPlanAt(userId, computeNextPlanTime(now, cadence));
}

function lastPostedAt(history: AgentClipHistory[], projectId: string, destination?: string): Date | null {
  const dates = history
    .filter((h) => h.projectId === projectId && (destination == null || h.destination === destination))
    .map((h) => h.createdAt.getTime());
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates));
}

function usedWindows(history: AgentClipHistory[], projectId: string, destination: string): HighlightWindow[] {
  return history
    .filter(
      (h) =>
        h.projectId === projectId &&
        h.destination === destination &&
        h.startSecond != null &&
        h.endSecond != null,
    )
    .map((h) => ({
      startSecond: h.startSecond as number,
      endSecond: h.endSecond as number,
      score: h.score ?? 0,
    }));
}

type AgentProject = {
  id: string;
  title: string | null;
  duration: number | null;
  resumeId: string | null;
};

function pickProjectForDest(
  rotated: ReturnType<typeof rotateProjects>,
  byId: Map<string, AgentProject>,
  history: AgentClipHistory[],
  dest: string,
  now: Date,
  sceneStarts: Map<string, number[]>,
): {
  project: AgentProject;
  clip: HighlightWindow;
} | null {
  for (const item of rotated) {
    const project = byId.get(item.projectId);
    if (!project) continue;
    if (isInCooldown(lastPostedAt(history, project.id, dest), now, AGENT_COOLDOWN_DAYS)) continue;
    const durationSec = normalizeVideoDurationSec(project.duration);
    if (durationSec <= 0) continue;
    const clipSec = clipSecondsForMaster(durationSec);
    const clip = selectAgentClip(
      windowsFromDuration(durationSec, clipSec),
      usedWindows(history, project.id, dest),
      clipSec,
      sceneStarts.get(project.id) ?? [],
    );
    if (!clip) continue;
    return { project, clip };
  }
  return null;
}

async function loadSceneStarts(
  projectIds: string[],
  db: ReturnType<typeof getDb>,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (projectIds.length === 0) return out;
  const rows = await db
    .select({
      projectId: studioChapters.projectId,
      startSeconds: studioChapters.startSeconds,
    })
    .from(studioChapters)
    .where(inArray(studioChapters.projectId, projectIds));
  for (const row of rows) {
    const list = out.get(row.projectId) ?? [];
    list.push(row.startSeconds);
    out.set(row.projectId, list);
  }
  return out;
}

function resumeBlurb(headline?: string | null, summary?: string | null): string {
  const h = (headline ?? "").trim();
  const s = (summary ?? "").trim();
  if (h && s) return `${h}\n${s}`;
  return h || s;
}

function resumeFromContent(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const rec = content as Record<string, unknown>;
  const basics = (rec.basics ?? rec.Basics ?? {}) as Record<string, unknown>;
  const headline = String(basics.label ?? basics.Label ?? "").trim();
  const summary = String(basics.summary ?? basics.Summary ?? "").trim();
  return resumeBlurb(headline, summary);
}

function parseTimedWord(raw: unknown): TimedWord | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as { word?: unknown; start?: unknown; end?: unknown };
  if (typeof w.word !== "string") return null;
  const start = Number(w.start);
  const end = Number(w.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { word: w.word, start, end };
}

function wordsFromTimestamps(raw: unknown): TimedWord[] {
  if (!Array.isArray(raw)) return [];
  const out: TimedWord[] = [];
  for (const w of raw) {
    const parsed = parseTimedWord(w);
    if (parsed) out.push(parsed);
  }
  return out;
}

function wordsFromCues(cues: unknown): TimedWord[] {
  if (!Array.isArray(cues)) return [];
  const out: TimedWord[] = [];
  for (const cue of cues) {
    if (!cue || typeof cue !== "object") continue;
    const c = cue as { words?: unknown; text?: unknown; start?: unknown; end?: unknown };
    if (Array.isArray(c.words) && c.words.length > 0) {
      for (const w of c.words) {
        const parsed = parseTimedWord(w);
        if (parsed) out.push(parsed);
      }
      continue;
    }
    const text = typeof c.text === "string" ? c.text.trim() : "";
    if (!text) continue;
    const start = Number(c.start);
    const end = Number(c.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ word: text, start, end });
  }
  return out;
}

/** Whisper stores seconds; TTS caption cues often store milliseconds. */
function normalizeWordTimes(words: TimedWord[]): TimedWord[] {
  let max = 0;
  for (const w of words) {
    if (w.end > max) max = w.end;
  }
  if (max <= 10_000) return words;
  return words.map((w) => ({ word: w.word, start: w.start / 1000, end: w.end / 1000 }));
}

async function loadClipWords(
  projectIds: string[],
  db: ReturnType<typeof getDb>,
): Promise<Map<string, TimedWord[]>> {
  const out = new Map<string, TimedWord[]>();
  if (projectIds.length === 0) return out;

  const captionRows = await db
    .select({
      projectId: studioCaptions.projectId,
      cues: studioCaptions.cues,
      createdAt: studioCaptions.createdAt,
    })
    .from(studioCaptions)
    .where(inArray(studioCaptions.projectId, projectIds));

  const latestCaption = new Map<string, { at: number; words: TimedWord[] }>();
  for (const row of captionRows) {
    const words = normalizeWordTimes(wordsFromCues(row.cues));
    if (words.length === 0) continue;
    const at = row.createdAt?.getTime() ?? 0;
    const prev = latestCaption.get(row.projectId);
    if (!prev || at >= prev.at) latestCaption.set(row.projectId, { at, words });
  }
  for (const [id, v] of latestCaption) out.set(id, v.words);

  const missing = projectIds.filter((id) => !out.has(id));
  if (missing.length === 0) return out;

  const voRows = await db
    .select({
      projectId: studioVoiceovers.projectId,
      wordTimestamps: studioVoiceovers.wordTimestamps,
      createdAt: studioVoiceovers.createdAt,
    })
    .from(studioVoiceovers)
    .where(inArray(studioVoiceovers.projectId, missing));

  const latestVo = new Map<string, { at: number; words: TimedWord[] }>();
  for (const row of voRows) {
    if (!row.projectId) continue;
    const words = normalizeWordTimes(wordsFromTimestamps(row.wordTimestamps));
    if (words.length === 0) continue;
    const at = row.createdAt?.getTime() ?? 0;
    const prev = latestVo.get(row.projectId);
    if (!prev || at >= prev.at) latestVo.set(row.projectId, { at, words });
  }
  for (const [id, v] of latestVo) out.set(id, v.words);
  return out;
}

async function loadResumeTexts(
  userId: string,
  resumeIds: string[],
  db: ReturnType<typeof getDb>,
): Promise<{ profile: string; byResumeId: Map<string, string> }> {
  const [profile] = await db
    .select({
      headline: userProfiles.headline,
      summary: userProfiles.summary,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const profileText = resumeBlurb(profile?.headline, profile?.summary);

  const byResumeId = new Map<string, string>();
  const ids = [...new Set(resumeIds.filter(Boolean))];
  if (ids.length === 0) return { profile: profileText, byResumeId };

  const rows = await db
    .select({
      id: resumeInformation.id,
      content: resumeInformation.content,
    })
    .from(resumeInformation)
    .where(and(eq(resumeInformation.userId, userId), inArray(resumeInformation.id, ids)));

  for (const row of rows) {
    const text = resumeFromContent(row.content);
    if (text) byResumeId.set(row.id, text);
  }
  return { profile: profileText, byResumeId };
}

async function buildCaptionCaller(
  userId: string,
  tokensOk: boolean,
  env?: DistributionEnv,
): Promise<AiTextCaller | null> {
  if (!tokensOk || !env || !hasAiTextProvider(env)) return null;
  try {
    const adapter = createAiTextCaller(env, { sub: userId } as never, {
      label: "posting_agent_caption",
      useCase: "posting_agent",
    });
    return async (prompt) => adapter("You write social captions for video resumes.", prompt);
  } catch {
    return null;
  }
}
