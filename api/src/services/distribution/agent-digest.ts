/**
 * Weekly digest sender for the AI posting agent (§3 / R6).
 *
 * Bell always fires when there are pending drafts. Push is skipped
 * during quiet hours (and when the user has the push channel off).
 * Email is a custom HTML digest — gated by posting_agent_settings.email_digest
 * and the weekly-digest notification preference — not the bell dispatcher.
 */
import { isInQuietHours, localDayStart } from "../../../../shared/posting-agent.js";
import { isChannelAllowed, type NotificationPreferences } from "../../../../shared/notification-preferences.js";

export type AgentDigestDraft = {
  id: string;
  projectTitle: string | null;
  destination: string;
  scheduledAt: Date | null;
};

export type AgentDigestDeps = {
  emitBell: (input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    url: string;
    push: boolean;
    email: boolean;
  }) => Promise<void>;
  loadPrefs: (userId: string) => Promise<{ emailWeeklyDigest: boolean; pushJobMatches: boolean; [k: string]: boolean } | null>;
  sendEmail: (input: { to: string; subject: string; html: string }) => Promise<void>;
  loadUserEmail: (userId: string) => Promise<string | null>;
  buildPauseUrl: (userId: string) => string;
  now?: Date;
};

const DIGEST_TYPE = "weekly_digest";
/** Bell/push deep-link — relative so InboxOverlay `navigate()` can consume it. */
const BELL_PATH = "/studio/distribution?tab=agent";

export async function sendAgentDigest(
  args: {
    userId: string;
    emailDigest: boolean; // posting_agent_settings.email_digest
    quietStartMinute: number;
    quietEndMinute: number;
    timezone: string; // IANA, e.g. America/Toronto
    drafts: AgentDigestDraft[];
    hubUrl: string; // e.g. https://hired.video/studio/distribution?tab=agent
  },
  deps: AgentDigestDeps,
): Promise<{ bell: boolean; email: boolean; push: boolean }> {
  if (args.drafts.length === 0) {
    return { bell: false, email: false, push: false };
  }

  const now = deps.now ?? new Date();
  let prefs: Awaited<ReturnType<AgentDigestDeps["loadPrefs"]>> = null;
  try {
    prefs = await deps.loadPrefs(args.userId);
  } catch {
    prefs = null;
  }
  const quiet = isInQuietHours(
    localMinuteOfDay(now, args.timezone),
    args.quietStartMinute,
    args.quietEndMinute,
  );
  const push = !quiet && channelAllowed(prefs, "push");
  const n = args.drafts.length;
  const title = n === 1 ? "1 draft waiting" : `${n} drafts waiting`;
  const message =
    n === 1
      ? "Your agent lined up 1 post for this week."
      : `Your agent lined up ${n} posts for this week.`;

  await deps.emitBell({
    userId: args.userId,
    type: DIGEST_TYPE,
    title,
    message,
    url: BELL_PATH,
    push,
    email: false,
  });

  let email = false;
  if (args.emailDigest && channelAllowed(prefs, "email")) {
    const to = await deps.loadUserEmail(args.userId);
    if (to) {
      const pauseUrl = deps.buildPauseUrl(args.userId);
      await deps.sendEmail({
        to,
        subject: title,
        html: buildDigestHtml(args.drafts, args.hubUrl, pauseUrl, args.timezone),
      });
      email = true;
    }
  }

  return { bell: true, email, push };
}

function localMinuteOfDay(now: Date, timeZone: string): number {
  const start = localDayStart(now, timeZone);
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60_000));
}

function channelAllowed(
  prefs: Awaited<ReturnType<AgentDigestDeps["loadPrefs"]>>,
  channel: "email" | "push",
): boolean {
  if (!prefs) return true;
  return isChannelAllowed(prefs as NotificationPreferences, channel, DIGEST_TYPE);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatScheduled(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(at);
}

function buildDigestHtml(
  drafts: AgentDigestDraft[],
  hubUrl: string,
  pauseUrl: string,
  timezone: string,
): string {
  const hub = escapeHtml(hubUrl);
  const pause = escapeHtml(pauseUrl);
  const items = drafts
    .map((d) => {
      const title = escapeHtml(d.projectTitle ?? "Untitled");
      const dest = escapeHtml(d.destination);
      const when = d.scheduledAt ? escapeHtml(formatScheduled(d.scheduledAt, timezone)) : "Unscheduled";
      return (
        `<li>` +
        `<strong>${title}</strong> · ${dest} · ${when}` +
        `<br/>` +
        `<a href="${hub}">Approve</a> · <a href="${hub}">Skip</a>` +
        `</li>`
      );
    })
    .join("");
  const n = drafts.length;
  const intro =
    n === 1
      ? "Your agent lined up 1 post for this week."
      : `Your agent lined up ${n} posts for this week.`;
  return (
    `<p>${intro}</p>` +
    `<ul>${items}</ul>` +
    `<p><a href="${hub}">Review drafts</a> · <a href="${pause}">Pause the posting agent</a></p>`
  );
}
