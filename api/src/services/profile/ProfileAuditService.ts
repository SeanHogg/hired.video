/**
 * ProfileAuditService — single owner of the "audit + rewrite my candidate
 * profile" flow that powers the /api/profile-audit endpoint and the
 * /tools/profile-audit page.
 *
 * Mirrors the structure of resume_optimize: read the user's persisted
 * profile, ask the LLM for a structured rewrite of headline + summary,
 * validate the JSON shape, charge tokens. The 5-step audit checklist is
 * a deterministic local computation (open-to-work flag, last activity
 * timestamp, avatar presence, headline character count) — we don't ask
 * the LLM to grade what we can grade ourselves.
 *
 * The handler does NOT mutate the user profile here. Acceptance round-
 * trips through the existing `PUT /api/users/me` so all profile-write
 * validation, audit, and notifications stay in one place.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { createLLMClient, type LLMClient, type LLMEnv } from "../adapters/llm-client.js";
import type { JwtPayload } from "../../types/index.js";

const { users, userProfiles } = schema;

// ── Output contract ───────────────────────────────────────────────────────────

const RewriteSchema = z.object({
  headline: z.string().min(1).max(200),
  headlineRationale: z.string().min(1),
  summary: z.string().min(1).max(2000),
  summaryRationale: z.string().min(1),
  currentRoleSuggestion: z.string().max(120).optional(),
  topFix: z.string().min(1),
});

export type ProfileRewrite = z.infer<typeof RewriteSchema>;

export interface AuditCheck {
  id: "headline" | "skim" | "activity" | "openToWork" | "avatar";
  label: string;
  /** "pass" / "warn" / "fail" — drives the colored pill in the UI. */
  status: "pass" | "warn" | "fail";
  /** Short, user-facing reason. */
  detail: string;
}

export interface ProfileSnapshot {
  fullName: string;
  headline: string | null;
  summary: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  skills: string[];
  industries: string[];
  yearsOfExperience: number | null;
  openToWork: boolean;
  avatarUrl: string | null;
  lastActiveAt: string | null;
  createdAt: string | null;
  role: string | null;
}

export interface ProfileAuditResult {
  current: ProfileSnapshot;
  proposed: {
    headline: string;
    summary: string;
    currentRole: string | null;
  };
  rationales: {
    headline: string;
    summary: string;
    topFix: string;
  };
  checks: AuditCheck[];
  /** 0–100. Average of the five deterministic checks (pass=100, warn=60, fail=20). */
  score: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read the authenticated user's profile, ask the LLM for a rewrite, run
 * the local 5-check audit, and record the LLM cost. Returns everything
 * the audit page needs to render the before/after preview.
 *
 * Throws when the user is missing or the LLM exhausts every profile in
 * its fallback chain — the route handler turns either into a 404 / 503
 * envelope.
 */
export async function runProfileAudit(args: {
  userId: string;
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
}): Promise<ProfileAuditResult> {
  const snapshot = await loadProfileSnapshot(args.userId);
  const checks = computeAuditChecks(snapshot);
  const score = scoreFromChecks(checks);

  const client = createLLMClient(args.env, args.user);
  const { rewrite } = await callRewrite(client, snapshot);

  return {
    current: snapshot,
    proposed: {
      headline: rewrite.headline.trim(),
      summary: rewrite.summary.trim(),
      currentRole: rewrite.currentRoleSuggestion?.trim() || null,
    },
    rationales: {
      headline: rewrite.headlineRationale,
      summary: rewrite.summaryRationale,
      topFix: rewrite.topFix,
    },
    checks,
    score,
  };
}

// ── Snapshot loader ───────────────────────────────────────────────────────────

async function loadProfileSnapshot(userId: string): Promise<ProfileSnapshot> {
  const db = getDb();

  const [account] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!account) {
    throw new Error("USER_NOT_FOUND");
  }

  const [profile] = await db
    .select({
      headline: userProfiles.headline,
      summary: userProfiles.summary,
      currentRole: userProfiles.currentRole,
      currentCompany: userProfiles.currentCompany,
      location: userProfiles.location,
      skills: userProfiles.skills,
      industries: userProfiles.industries,
      yearsOfExperience: userProfiles.yearsOfExperience,
      openToWork: userProfiles.openToWork,
      avatarUrl: userProfiles.avatarUrl,
      updatedAt: userProfiles.updatedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  return {
    fullName: account.name ?? "",
    role: (account.role as string | null) ?? null,
    headline: profile?.headline ?? null,
    summary: profile?.summary ?? null,
    currentRole: profile?.currentRole ?? null,
    currentCompany: profile?.currentCompany ?? null,
    location: profile?.location ?? null,
    skills: Array.isArray(profile?.skills) ? (profile!.skills as string[]) : [],
    industries: Array.isArray(profile?.industries) ? (profile!.industries as string[]) : [],
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    openToWork: profile?.openToWork ?? false,
    avatarUrl: profile?.avatarUrl ?? null,
    lastActiveAt: toIsoOrNull(profile?.updatedAt) ?? toIsoOrNull(account.updatedAt),
    createdAt: toIsoOrNull(account.createdAt),
  };
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

// ── Deterministic 5-check audit ───────────────────────────────────────────────
//
// These mirror the 5 tests from the blog post "How to Audit Your Own
// Profile in 5 Minutes" — we grade them locally rather than asking the
// LLM, because they're cheap and unambiguous.

const DAY_MS = 24 * 60 * 60 * 1000;
const HEADLINE_MIN = 30;
const HEADLINE_MAX = 100;

function computeAuditChecks(p: ProfileSnapshot): AuditCheck[] {
  return [
    headlineCheck(p),
    skimCheck(p),
    activityCheck(p),
    openToWorkCheck(p),
    avatarCheck(p),
  ];
}

function headlineCheck(p: ProfileSnapshot): AuditCheck {
  const h = (p.headline ?? "").trim();
  if (!h) {
    return {
      id: "headline",
      label: "Headline",
      status: "fail",
      detail: "No headline set. Add a role + one specific differentiator (number, technology, or named outcome).",
    };
  }
  const len = h.length;
  const hasNumber = /\d/.test(h);
  const hasSeparator = /[•·\-—|]/.test(h);
  if (len < HEADLINE_MIN) {
    return { id: "headline", label: "Headline", status: "warn", detail: `Only ${len} characters — too short to land a role + differentiator. Aim for 60–80.` };
  }
  if (len > HEADLINE_MAX) {
    return { id: "headline", label: "Headline", status: "warn", detail: `${len} characters — won't read in one glance. Trim to 60–80.` };
  }
  if (!hasNumber && !hasSeparator) {
    return { id: "headline", label: "Headline", status: "warn", detail: "No quantified differentiator. Add a number, technology, or named outcome after your role." };
  }
  return { id: "headline", label: "Headline", status: "pass", detail: `${len} characters — within the 60–80 sweet spot.` };
}

function skimCheck(p: ProfileSnapshot): AuditCheck {
  const summary = (p.summary ?? "").trim();
  if (!summary) {
    return { id: "skim", label: "7-second skim", status: "fail", detail: "No about / summary set. Recruiters who skim won't see your specialty." };
  }
  const words = summary.split(/\s+/).filter(Boolean).length;
  const hasNumber = /\d/.test(summary);
  if (words < 30) {
    return { id: "skim", label: "7-second skim", status: "warn", detail: `Summary is ${words} words — likely too thin to convey specialty + outcome.` };
  }
  if (!hasNumber) {
    return { id: "skim", label: "7-second skim", status: "warn", detail: "Summary contains no numbers. Add at least one quantified outcome." };
  }
  return { id: "skim", label: "7-second skim", status: "pass", detail: "Summary has substance and at least one quantified anchor." };
}

function activityCheck(p: ProfileSnapshot): AuditCheck {
  if (!p.lastActiveAt) {
    return { id: "activity", label: "Recent activity", status: "warn", detail: "No activity timestamp on file. Edit any field to refresh it." };
  }
  const ageDays = (Date.now() - new Date(p.lastActiveAt).getTime()) / DAY_MS;
  if (ageDays > 90) {
    return { id: "activity", label: "Recent activity", status: "fail", detail: `Last update was ${Math.round(ageDays)} days ago. Recruiter search down-ranks stale profiles after 90 days.` };
  }
  if (ageDays > 30) {
    return { id: "activity", label: "Recent activity", status: "warn", detail: `Last update was ${Math.round(ageDays)} days ago. Touch the profile every 30–60 days.` };
  }
  return { id: "activity", label: "Recent activity", status: "pass", detail: `Updated ${Math.round(ageDays)} days ago.` };
}

function openToWorkCheck(p: ProfileSnapshot): AuditCheck {
  if (p.openToWork) {
    return { id: "openToWork", label: "Open to work", status: "pass", detail: "Open-to-work flag is on — you'll surface higher in recruiter search." };
  }
  return { id: "openToWork", label: "Open to work", status: "warn", detail: "Open-to-work is off. Turn it on (even with 'recruiters only' visibility) if you're passively open." };
}

function avatarCheck(p: ProfileSnapshot): AuditCheck {
  if (!p.avatarUrl) {
    return { id: "avatar", label: "Avatar", status: "fail", detail: "No avatar set. The default silhouette tanks recruiter click-through — the highest-leverage 30-second fix." };
  }
  return { id: "avatar", label: "Avatar", status: "pass", detail: "Avatar is set." };
}

function scoreFromChecks(checks: AuditCheck[]): number {
  if (checks.length === 0) return 0;
  const sum = checks.reduce((acc, c) => acc + (c.status === "pass" ? 100 : c.status === "warn" ? 60 : 20), 0);
  return Math.round(sum / checks.length);
}

// ── LLM call ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert career coach rewriting a candidate's profile headline and summary so they pass the recruiter "7-second skim" test.

Hard rules — if you violate any, the rewrite is unusable:
1. Never invent companies, titles, employers, schools, dates, metrics, or technologies the user didn't supply. If a number isn't provided, write a credible structural rewrite that doesn't quote a fake one.
2. Headline structure: "Role • specific differentiator". 60–80 characters. The differentiator must be a real signal from the supplied profile (technology, industry, named outcome, scale, specialization). No adjectives like "passionate", "driven", "results-oriented".
3. Summary: 3–5 sentences, first-person voice, lead with the most impressive concrete fact in the supplied profile. No marketing language, no clichés.
4. Output ONLY a JSON object matching the schema. No prose, no markdown fences.`;

async function callRewrite(client: LLMClient, p: ProfileSnapshot): Promise<{ rewrite: ProfileRewrite }> {
  const userPrompt = buildUserPrompt(p);
  const { data } = await client.callJson(
    "profile_audit",
    {
      useCase: "profile_audit",
      systemPrompt: SYSTEM_PROMPT,
      userMessage: userPrompt,
      responseFormat: "json_object",
    },
    RewriteSchema,
  );

  return { rewrite: data };
}

function buildUserPrompt(p: ProfileSnapshot): string {
  const parts: string[] = [];
  parts.push("Rewrite this candidate's profile. Use only facts present here.");
  parts.push("");
  parts.push(`Name: ${p.fullName || "(unset)"}`);
  parts.push(`Current headline: ${p.headline ?? "(unset)"}`);
  parts.push(`Current summary: ${p.summary ?? "(unset)"}`);
  parts.push(`Current role: ${p.currentRole ?? "(unset)"}${p.currentCompany ? ` at ${p.currentCompany}` : ""}`);
  parts.push(`Location: ${p.location ?? "(unset)"}`);
  if (p.yearsOfExperience != null) parts.push(`Years of experience: ${p.yearsOfExperience}`);
  if (p.skills.length > 0) parts.push(`Skills: ${p.skills.slice(0, 30).join(", ")}`);
  if (p.industries.length > 0) parts.push(`Industries: ${p.industries.slice(0, 10).join(", ")}`);
  parts.push("");
  parts.push("Return JSON with these exact keys:");
  parts.push('  "headline" — the rewritten headline (60–80 chars, "Role • differentiator" shape)');
  parts.push('  "headlineRationale" — one sentence on what changed and why');
  parts.push('  "summary" — the rewritten about/summary (3–5 sentences, first person)');
  parts.push('  "summaryRationale" — one sentence on what changed and why');
  parts.push('  "currentRoleSuggestion" — optional cleaner phrasing of the current role line, or omit');
  parts.push('  "topFix" — the single highest-impact change the candidate should make to their profile beyond headline/summary (one sentence)');
  return parts.join("\n");
}
