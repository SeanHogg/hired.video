/**
 * Dedup an email's job reference against the candidate's existing
 * applied/saved jobs. Three strategies, in order of precision:
 *
 *   1. apply_url match — the email body contains a URL we already have
 *      on a `job_items.applyUrl`. Trivial when the ATS sender includes
 *      a tracking link to the job posting.
 *   2. ATS thread id match — Gmail threadId / Graph conversationId we
 *      already saw on a previously linked message; carry the link
 *      forward to the new reply.
 *   3. company + title fuzzy match — if the email's company / title can
 *      be extracted, fuzzy-match against applied/saved jobs.
 *
 * Confidence threshold for an automatic link is 0.8. Below that, we
 * leave `linkedJobId` null and let the dedup score surface the near-
 * miss for the optional auto-create flow.
 */

import type { Repos, JobApplicationRow, SavedJobRow, JobRow } from "../../repositories/index.js";
import type { ExternalEmailMessageRow } from "../../repositories/externalEmailMessagesRepository.js";
import type { NormalisedEmail } from "./providers/types.js";

export interface DedupResult {
  jobId: string | null;
  score: number;
  method: "apply_url" | "thread_id" | "company_title" | null;
}

const APPLY_URL_RE =
  /https?:\/\/[^\s"'<>]*?(?:apply|jobs?|careers?|posting|gh\/jobs|lever\.co|greenhouse\.io|ashbyhq|workday)[^\s"'<>]*/gi;

export function extractApplyUrls(email: NormalisedEmail): string[] {
  const haystack = `${email.bodyHtml ?? ""}\n${email.bodyText ?? ""}\n${email.snippet}`;
  const out = new Set<string>();
  for (const match of haystack.matchAll(APPLY_URL_RE)) {
    // Strip trailing punctuation that often glues onto URLs in HTML.
    const url = match[0].replace(/[).,;>'"\]]+$/, "");
    out.add(url);
  }
  return [...out].slice(0, 6);
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Token-based Jaccard similarity — cheap, fine for company + title. */
function tokenJaccard(a: string, b: string): number {
  const A = new Set(normalize(a).split(" ").filter((t) => t.length > 1));
  const B = new Set(normalize(b).split(" ").filter((t) => t.length > 1));
  if (A.size === 0 || B.size === 0) return 0;
  let intersect = 0;
  for (const t of A) if (B.has(t)) intersect += 1;
  return intersect / (A.size + B.size - intersect);
}

/** Try to pull "company" and "title" out of the email subject. ATS
 *  emails commonly use "Application for {Title} at {Company}" or
 *  "Your application to {Company}". We extract conservatively — when
 *  the heuristic fails, we just return what little we got. */
export function guessCompanyAndTitle(email: NormalisedEmail): { company: string | null; title: string | null } {
  const subject = email.subject || "";
  // "{Title} at {Company}" / "{Title} @ {Company}"
  const atMatch = /^(.*?)\s+(?:at|@)\s+(.+?)(?:\s+[-—–]|$)/i.exec(subject);
  if (atMatch) {
    return { title: atMatch[1].trim() || null, company: atMatch[2].trim() || null };
  }
  // "Application for {Title} – {Company}" / "Re: {Title} – {Company}"
  const dashMatch = /^(?:re:|fwd:|application for:?|application:?)\s*(.+?)\s+[-–—]\s+(.+)$/i.exec(subject);
  if (dashMatch) {
    return { title: dashMatch[1].trim() || null, company: dashMatch[2].trim() || null };
  }
  // Fallback: domain-derived company name.
  const domain = email.fromEmail.split("@")[1] ?? "";
  const company = domain.split(".")[0] ?? null;
  return { title: null, company: company && company.length > 2 ? company : null };
}

export interface DedupContext {
  applications: JobApplicationRow[];
  savedJobs: SavedJobRow[];
  jobs: JobRow[];
  /** Previously linked emails on the same thread, if any. */
  threadLinkedJobId: string | null;
}

export async function loadDedupContext(
  repos: Pick<Repos, "jobs" | "externalEmailMessages">,
  userId: string,
  email: NormalisedEmail,
): Promise<DedupContext> {
  const [applications, savedJobs] = await Promise.all([
    repos.jobs.findApplicationsForUser(userId),
    repos.jobs.findSavedForUser(userId),
  ]);
  const jobIds = [
    ...applications.map((a) => a.jobId).filter((x): x is string => !!x),
    ...savedJobs.map((s) => s.jobId),
  ];
  const jobs = jobIds.length > 0 ? await repos.jobs.findJobsByIds(jobIds) : [];

  // Carry forward link from earlier messages on the same Gmail thread /
  // Graph conversation — saves a re-classification round trip.
  let threadLinkedJobId: string | null = null;
  if (email.providerThreadId) {
    // We can't query by thread id without an index; the messages repo's
    // findByAccount is bounded per account so the user's account-scoped
    // count keeps this cheap in practice. P5 could index thread id.
    // For now skip the cross-thread carry — limited downside.
  }

  return { applications, savedJobs, jobs, threadLinkedJobId };
}

export function dedupAgainst(
  email: NormalisedEmail,
  ctx: DedupContext,
): DedupResult {
  if (ctx.threadLinkedJobId) {
    return { jobId: ctx.threadLinkedJobId, score: 0.95, method: "thread_id" };
  }

  // Strategy 1 — apply URL match.
  const urls = extractApplyUrls(email);
  if (urls.length > 0) {
    for (const job of ctx.jobs) {
      const target = (job.applyUrl ?? job.sourceUrl ?? "").toLowerCase();
      if (!target) continue;
      for (const u of urls) {
        const lower = u.toLowerCase();
        if (lower === target || lower.startsWith(target) || target.startsWith(lower.split("?")[0])) {
          return { jobId: job.id, score: 0.95, method: "apply_url" };
        }
      }
    }
  }

  // Strategy 2 — company + title fuzzy.
  const guess = guessCompanyAndTitle(email);
  let best: DedupResult = { jobId: null, score: 0, method: null };
  for (const job of ctx.jobs) {
    const companyScore = guess.company
      ? tokenJaccard(guess.company, job.company ?? "") * 0.4
      : 0;
    const titleScore = guess.title
      ? tokenJaccard(guess.title, job.title ?? "") * 0.6
      : 0;
    const score = companyScore + titleScore;
    if (score > best.score) {
      best = { jobId: job.id, score, method: "company_title" };
    }
  }
  if (best.score >= 0.6) return best;
  return { jobId: null, score: best.score, method: null };
}

/**
 * Auto-create a `job_items` row from an email when we're confident the
 * email is a real `job_opportunity` and dedup didn't find a match.
 *
 * Confidence gate: classifier confidence ≥ 0.85 AND a real apply URL
 * detected. Spammy "we have a job for you" blasts without a working
 * apply link slip through the gate and never pollute the job board.
 */
export interface AutoCreateContext {
  classifierScore: number;
  category: string;
}

export async function autoCreateJobFromEmail(
  repos: Pick<Repos, "jobs">,
  userId: string,
  email: NormalisedEmail,
  ctx: AutoCreateContext,
): Promise<{ jobId: string | null; applyUrl: string | null }> {
  if (ctx.category !== "job_opportunity") return { jobId: null, applyUrl: null };
  if (ctx.classifierScore < 0.85) return { jobId: null, applyUrl: null };

  const urls = extractApplyUrls(email);
  if (urls.length === 0) return { jobId: null, applyUrl: null };
  const applyUrl = urls[0];

  const guess = guessCompanyAndTitle(email);
  const title = (guess.title ?? email.subject ?? "Untitled role").slice(0, 240);
  const company = (guess.company ?? email.fromName ?? "").slice(0, 240) || null;
  const description =
    (email.bodyText ?? email.bodyHtml ?? email.snippet ?? "").slice(0, 8000);

  const created = await repos.jobs.insertJob({
    postedByUserId: userId,
    title,
    company,
    description,
    applyUrl,
    sourceUrl: applyUrl,
    isActive: true,
  } as any);

  return { jobId: created?.id ?? null, applyUrl };
}
