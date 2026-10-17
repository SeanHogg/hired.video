/**
 * Résumé creation use cases — every `source` of `POST /api/resumes`
 * except the HTTP-only steps (multipart read, OCR gate, job resolution),
 * which stay in routes/resumes/create.ts. All inserts go through
 * `insertOwnedResume`, so every path heals content, auto-promotes the
 * account's first résumé to master+active, and gets a stable slug.
 * Return domain data; throw DomainError.
 */
import { z } from "zod";
import type { Resume } from "../../../../shared/resume.js";
import { CreateResumeSchema } from "../../../../shared/resume.js";
import { CloneResumeRequestSchema, VariationResumeRequestSchema } from "../../../../shared/resume-create.js";
import { DomainError } from "../../domains/errors.js";
import { PRIVACY_TO_LEVEL, rowToResume } from "../../handlers/resume-serializer.js";
import { logger } from "../../lib/logger.js";
import { hasRealObjectContent, hasRealSectionContent, healAndValidateContent } from "./content.js";
import { invalidResumeBody, invalidResumeContent, resumeNotFound, slugTaken } from "./errors.js";
import { saveVersionOfMaster } from "./lineage.js";
import type { ResumeDeps } from "./ports.js";

const OWNER_EXTRAS = { isOwner: true, isWatched: false, viewCount: 0 };

interface NewResume {
  title: string;
  content: unknown;
  slug?: string | null;
  status?: string;
  privacyLevel?: number;
  isMaster?: boolean;
}

/** Heal → insert → slug fallback. The first résumé on an account becomes
 *  master + active so the extension and /studio have one to work with. */
async function insertOwnedResume(deps: ResumeDeps, ownerId: string, input: NewResume): Promise<Resume> {
  const heal = healAndValidateContent(input.content);
  if (!heal.ok) throw invalidResumeContent(heal.issues);
  if (input.slug && (await deps.repo.findBySlug(input.slug))) throw slugTaken(input.slug);

  const isFirst = (await deps.repo.countByOwner(ownerId)) === 0;
  const created = await deps.repo.insertOne({
    userId: ownerId,
    title: input.title,
    slug: input.slug ?? null,
    content: heal.content as Record<string, unknown>,
    status: input.status ?? "draft",
    isMaster: (input.isMaster ?? false) || isFirst,
    isActive: isFirst,
    privacyLevel: input.privacyLevel ?? 10,
  });
  // No caller slug → the id, so the row always has a stable URL segment.
  const final = input.slug ? created : ((await deps.repo.updateByIdForOwner(created.id, ownerId, { slug: created.id })) ?? created);
  return rowToResume(final, OWNER_EXTRAS);
}

/** "Name — Label" from a JSON Resume, else the file name sans extension. */
export function deriveTitleFromContent(content: unknown, filename?: string): string {
  const basics = content && typeof content === "object"
    ? ((content as Record<string, unknown>).basics ?? (content as Record<string, unknown>).Basics) as Record<string, unknown> | undefined
    : undefined;
  const name = basics?.name ?? basics?.Name;
  const label = basics?.label ?? basics?.Label;
  if (typeof name === "string" && name.trim()) {
    return typeof label === "string" && label.trim() ? `${name} — ${label}` : name;
  }
  return filename ? filename.replace(/\.[^/.]+$/, "") : "";
}

/** Title for a content-only save: content.title → content.name → basics.name. */
function inferTitle(content: Record<string, unknown>): string | null {
  const basics = content.basics as Record<string, unknown> | undefined;
  for (const v of [content.title, content.name, basics?.name]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const BlankResumeSchema = CreateResumeSchema.extend({ title: z.string().min(1).optional() });

/** `blank` — explicit content (or `rawText`: JSON Resume first, AI parse
 *  second). Title optional: inferred from the content. */
export async function createBlankResume(deps: ResumeDeps, ownerId: string, body: unknown): Promise<Resume> {
  const parsed = BlankResumeSchema.safeParse(body);
  if (!parsed.success) throw invalidResumeBody(parsed.error.flatten());

  let content: unknown = parsed.data.content ?? {};
  if (parsed.data.rawText) {
    content = deps.parser.tryParseJsonResume(parsed.data.rawText) ?? (await deps.parser.parseRawText(parsed.data.rawText));
  }
  return insertOwnedResume(deps, ownerId, {
    title: parsed.data.title ?? inferTitle(content as Record<string, unknown>) ?? "Untitled Resume",
    content,
    slug: parsed.data.slug ?? null,
    status: parsed.data.status,
    privacyLevel: PRIVACY_TO_LEVEL[parsed.data.privacy ?? "private"] ?? 10,
    isMaster: parsed.data.isMaster,
  });
}

/** AI parse with a raw-text fallback — a failed parse still saves the text. */
async function parseOrRaw(deps: ResumeDeps, text: string): Promise<Record<string, unknown>> {
  try {
    return await deps.parser.parseRawText(text);
  } catch (err) {
    logger.warn("[resume/create] AI parse failed, storing raw text fallback", {
      error: err instanceof Error ? err.message : err,
    });
    return { raw: text };
  }
}

const BINARY_TEXT_MESSAGE =
  "Couldn't read that file — it looks like raw binary instead of plain text. " +
  "Try a .txt, .md, .docx file, or a PDF containing selectable text (not a scan).";

/** `text` — pre-extracted plain text (Chrome extension, paste). Raw binary
 *  is rejected before it can reach the JSONB column. */
export async function createFromText(deps: ResumeDeps, ownerId: string, input: { text: string; title?: string }): Promise<Resume> {
  const raw = input.text ?? "";
  if (raw.includes("\u0000") || raw.startsWith("%PDF") || raw.startsWith("PK\u0003\u0004")) {
    throw new DomainError(422, "INVALID_RESUME_TEXT", BINARY_TEXT_MESSAGE);
  }
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  if (text.trim().length < 10) {
    throw new DomainError(422, "VALIDATION_ERROR", "Resume text is too short or empty. Please try a different file.");
  }
  const structured = deps.parser.tryParseJsonResume(text);
  const title = input.title?.trim() || "Uploaded Resume";
  return insertOwnedResume(deps, ownerId, {
    title: structured ? deriveTitleFromContent(structured) || title : title,
    content: structured ?? (await parseOrRaw(deps, text)),
  });
}

/** `file` — content the upload intake already read (structured JSON or
 *  text the caller classified). */
export async function createFromUpload(
  deps: ResumeDeps,
  ownerId: string,
  input: { structured: Record<string, unknown> | null; text: string; filename: string },
): Promise<Resume> {
  const content = input.structured ?? (input.text ? await parseOrRaw(deps, input.text) : { raw: "" });
  return insertOwnedResume(deps, ownerId, {
    title: deriveTitleFromContent(content, input.filename) || "Uploaded Resume",
    content,
  });
}

/** `clone` — a draft copy of one of the caller's résumés. */
export async function cloneResume(deps: ResumeDeps, ownerId: string, body: unknown): Promise<Resume> {
  const parsed = CloneResumeRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidResumeBody(parsed.error.flatten());
  const original = await deps.repo.findByIdForOwner(parsed.data.sourceId, ownerId);
  if (!original) throw resumeNotFound();
  return insertOwnedResume(deps, ownerId, { title: `${original.title} (copy)`, content: original.content ?? {} });
}

const CARRY_KEYS = [
  "basics", "work", "education", "skills", "volunteer", "awards",
  "certificates", "publications", "languages", "interests", "references", "projects",
];

/** Markdown import onto the source's JSON — only sections the parse really
 *  filled replace the source's (an empty parse never wipes history). */
async function withMarkdown(deps: ResumeDeps, base: Record<string, unknown>, markdown: string) {
  const merged: Record<string, unknown> = { ...base, markdown };
  try {
    const parsed = (await deps.parser.parseRawText(markdown)) as Record<string, unknown>;
    for (const key of CARRY_KEYS) {
      const val = parsed?.[key];
      if (val === undefined || val === null) continue;
      if (key === "basics" ? hasRealObjectContent(val) : hasRealSectionContent(val, key)) merged[key] = val;
    }
  } catch (err) {
    logger.warn("[resume/create] variation markdown parse failed; keeping source JSON", err);
  }
  return merged;
}

/** `variation` — save content as a version of the source's master (the
 *  lineage rules live in lineage.ts). Without `content` the source is copied. */
export async function createVariation(deps: ResumeDeps, ownerId: string, body: unknown): Promise<Resume & { masterId: string }> {
  const parsed = VariationResumeRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidResumeBody(parsed.error.flatten());
  const input = parsed.data;

  const source = await deps.repo.findByIdForOwner(input.sourceId, ownerId);
  if (!source) throw resumeNotFound();
  let content: Record<string, unknown> = input.content
    ? (input.content as Record<string, unknown>)
    : { ...((source.content as Record<string, unknown> | null) ?? {}) };
  if (!input.content && input.resumeData?.trim()) content = await withMarkdown(deps, content, input.resumeData.trim());

  const outcome = await saveVersionOfMaster(deps.repo, ownerId, input.sourceId, {
    content,
    title: input.title?.trim() || input.name?.trim() || null,
    description: input.description ?? null,
  }, deps.now);
  if (outcome.code === "NOT_FOUND") throw resumeNotFound();
  if (outcome.code === "INVALID_CONTENT") throw invalidResumeContent(outcome.issues);
  return { ...rowToResume(outcome.row, OWNER_EXTRAS), masterId: outcome.masterId };
}
