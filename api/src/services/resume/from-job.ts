/**
 * Create a résumé for a job from the person's own evidence — the use case
 * behind POST /api/resumes { source: "job" } (/build "Create a new one for
 * it").
 *
 *   1. Source = the master (or the résumé they picked). With
 *      `includeVersions`, bullets / skills that exist only in the master's
 *      versions are folded onto the matching master entries first — they
 *      are the person's own words, so they are fair evidence.
 *   2. The model lists the job's requirements and, for each, the evidence
 *      ids (content paths) that prove it; returns the same compact EDIT
 *      op-set as tailor (tailor-edits.ts) built only from that evidence;
 *      names what to leave out; and asks about what has no evidence.
 *   3. The server, not the model, decides what counts: unknown evidence ids
 *      are dropped, a requirement left without evidence is a GAP (a
 *      question on the page), a skill the résumé never mentions is removed
 *      from the draft, and left-out items may not be anything cited.
 *
 * Nothing is persisted — the person reviews and saves a version of the
 * master (lineage.ts). Pure apart from the repo reads and the LLM port.
 */
import { z } from "zod";
import type { IResumeOwnerReader } from "../../repositories/resumeRepository.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { defineLenientIngest } from "../adapters/llm-client.js";
import type { ParsedJob } from "../job/job-page-parse.js";
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";
import { entryPathOf, joinPath, normalizeText, readAt } from "../../../../shared/resume-path.js";
import { entryNaturalKey, type JobGap } from "../../../../shared/resume-tailor.js";
import type { FromJobDraft, JobRequirement, LeftOutItem } from "../../../../shared/resume-from-job.js";
import { TailorEditSchemaWire, TailorGapWireSchema } from "../job/tailor-edit-contract.js";
import { applyResumeEdits, dropUnsupportedSkills, toJobGaps } from "../job/tailor-apply.js";

type Entry = Record<string, unknown>;
const ENTRY_SECTIONS = ["work", "volunteer", "projects"] as const;
const OMITTABLE = new Set(["work", "volunteer", "projects", "skills", "awards", "certificates", "publications", "interests", "languages"]);

// ─── Evidence corpus ────────────────────────────────────────────────────────

export interface EvidenceItem {
  id: string;
  text: string;
}

/** Every citable line of a résumé, keyed by its content path. */
export function evidenceCorpus(content: ResumeContent): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const push = (id: string, text: unknown) => {
    if (typeof text === "string" && text.trim()) items.push({ id, text: text.trim() });
  };
  push("basics.summary", content.basics?.summary);
  for (const section of ENTRY_SECTIONS) {
    ((content[section] ?? []) as Entry[]).forEach((e, i) => {
      const who = [e.position, entryNaturalKey(section, e)].filter(Boolean).join(" @ ");
      push(joinPath(section, i, "summary"), e.summary ? `${who}: ${String(e.summary)}` : "");
      push(joinPath(section, i, "description"), e.description ? `${who}: ${String(e.description)}` : "");
      ((e.highlights ?? []) as string[]).forEach((h, j) => push(joinPath(section, i, "highlights", j), `${who}: ${h}`));
    });
  }
  (content.skills ?? []).forEach((s, i) => push(joinPath("skills", i), [s.name, ...(s.keywords ?? [])].filter(Boolean).join(", ")));
  (content.certificates ?? []).forEach((c, i) => push(joinPath("certificates", i), [c.name, c.issuer].filter(Boolean).join(" · ")));
  (content.education ?? []).forEach((e, i) => push(joinPath("education", i), [e.studyType, e.area, e.institution].filter(Boolean).join(" · ")));
  return items;
}

/** Fold bullets / skills found only in versions onto the master's matching
 *  entries (by natural key). Never adds an entry the master lacks. */
export function withVersionEvidence(master: ResumeContent, versions: readonly ResumeContent[]): ResumeContent {
  const out = JSON.parse(JSON.stringify(master)) as ResumeContent;
  for (const version of versions) {
    for (const section of ENTRY_SECTIONS) {
      const target = (out[section] ?? []) as Entry[];
      for (const entry of (version[section] ?? []) as Entry[]) {
        const key = normalizeText(entryNaturalKey(section, entry));
        const match = key ? target.find((e) => normalizeText(entryNaturalKey(section, e)) === key) : undefined;
        if (!match) continue;
        const have = ((match.highlights ?? []) as string[]);
        const seen = new Set(have.map(normalizeText));
        const extra = ((entry.highlights ?? []) as string[]).filter((h) => h.trim() && !seen.has(normalizeText(h)));
        if (extra.length) match.highlights = [...have, ...extra];
      }
    }
    const names = new Set((out.skills ?? []).map((s) => normalizeText(s.name ?? "")));
    for (const skill of version.skills ?? []) {
      if (skill.name && !names.has(normalizeText(skill.name))) {
        out.skills = [...(out.skills ?? []), skill];
        names.add(normalizeText(skill.name));
      }
    }
  }
  return out;
}

// ─── Model contract ────────────────────────────────────────────────────────

const FromJobWireSchema = z.object({
  job: z.object({ title: z.string().default(""), company: z.string().default("") }).default({ title: "", company: "" }),
  requirements: z
    .array(
      z.object({
        text: z.string(),
        evidence: z.array(z.string()).default([]),
        status: z.string().default(""),
        note: z.string().default(""),
      }),
    )
    .default([]),
  edits: z.array(TailorEditSchemaWire).default([]),
  gaps: z.array(TailorGapWireSchema).default([]),
  leftOut: z.array(z.string()).default([]),
});
type FromJobWire = z.infer<typeof FromJobWireSchema>;

const FromJobIngest = defineLenientIngest({
  name: "ResumeFromJob",
  ingest: FromJobWireSchema,
  coerce: (wire): FromJobWire => wire,
});

const SYSTEM_PROMPT = `You build a resume for ONE job using ONLY the candidate's own evidence. You never invent employers, titles, dates, metrics, skills, tools or domains.

You get the JOB and an EVIDENCE list: each line is "[id] text" from the candidate's resume. Return JSON only (no code fences):
{
  "job": { "title": "<job title>", "company": "<company or empty>" },
  "requirements": [ { "text": "<requirement, short>", "evidence": ["<ids from the list>"], "status": "covered"|"partial"|"gap", "note": "<where the proof is, very short>" } ],
  "edits": [ ... ],
  "gaps": [ { "requirement": "<as the job states it>", "kind": "skill"|"experience", "question": "<short question to the candidate>", "skill": "<kind=skill>", "section": "work", "match": "<exact entry name where an answer would belong, optional>" } ],
  "leftOut": [ "<entry or skill ids not relevant to this job, e.g. work.5 or skills.9>" ]
}

requirements: 3 to 8, in the order the job lists them. "evidence" may ONLY contain ids from the EVIDENCE list. No evidence → status "gap" and add it to "gaps".
edits: the SAME shapes as a tailor (copy "match" EXACTLY from the resume names):
  { "op": "basics", "label": "<headline for this job>", "summary": "<summary built from the evidence>", "why": "<1 sentence>" }
  { "op": "highlights", "section": "work"|"volunteer"|"projects", "match": "<exact name>", "highlights": ["<bullet>", ...], "why": "<1 sentence>" }
  { "op": "skills", "skills": [{ "name": "<skill the resume already shows>", "keywords": [] }], "why": "<1 sentence>" }
Reorder and rephrase evidence so the job's requirements come first. A rephrased bullet must say nothing the evidence does not.
leftOut: old or unrelated roles and skills the job does not need. Never leave out something you cite as evidence.`;

function buildPrompt(job: ParsedJob, corpus: EvidenceItem[]) {
  const userMessage = [
    "JOB (JSON):",
    JSON.stringify(job, null, 2),
    "",
    "EVIDENCE:",
    ...corpus.map((e) => `[${e.id}] ${e.text}`),
  ].join("\n");
  return { useCase: "match_tailor" as const, systemPrompt: SYSTEM_PROMPT, userMessage, responseFormat: "json_object" as const };
}

// ─── Server-side truth ─────────────────────────────────────────────────────

/** Evidence ids that point at a bullet list the edits rewrote can't keep
 *  their bullet index — they are re-pointed at the entry. */
function remapEvidence(ids: string[], rewritten: Set<string>): string[] {
  return [...new Set(ids.map((id) => {
    const entry = entryPathOf(id);
    return entry && rewritten.has(joinPath(entry, "highlights")) ? entry : id;
  }))];
}

function entryLabel(content: ResumeContent, path: string): string {
  const value = readAt(content, path);
  if (!value || typeof value !== "object") return path;
  const e = value as Entry;
  return String(
    [e.position, e.name ?? e.organization ?? e.title ?? e.language].filter(Boolean).join(" · ") || path,
  );
}

export function assembleDraft(
  source: ResumeContent,
  sourceResumeId: string,
  job: ParsedJob,
  wire: FromJobWire,
): FromJobDraft {
  const corpusIds = new Set(evidenceCorpus(source).map((e) => e.id));
  const applied = applyResumeEdits(source, wire.edits);
  const content = dropUnsupportedSkills(source, applied.content);
  const changes = applied.changes;
  const rewritten = new Set(changes.map((c) => c.path).filter((p): p is string => !!p));

  const requirements: JobRequirement[] = wire.requirements.slice(0, 8).map((r, i) => {
    const evidence = remapEvidence(r.evidence.filter((id) => corpusIds.has(id)), rewritten);
    const claimed = r.status.toLowerCase();
    const status: JobRequirement["status"] =
      evidence.length === 0 ? "gap" : claimed === "partial" ? "partial" : "covered";
    return { id: `R${i + 1}`, text: r.text.trim(), status, evidence, note: r.note.trim() };
  });

  // Every requirement without evidence becomes a question, keyed by its
  // requirement id so the page card and the checklist line up.
  const modelGaps = toJobGaps(wire.gaps, source);
  const gaps: JobGap[] = requirements
    .filter((r) => r.status === "gap")
    .map((r) => {
      const said = modelGaps.find(
        (g) => normalizeText(g.requirement).includes(normalizeText(r.text)) || normalizeText(r.text).includes(normalizeText(g.requirement)),
      );
      return said ? { ...said, id: r.id } : { id: r.id, requirement: r.text, kind: "experience" as const, question: r.text };
    });

  const cited = new Set(requirements.flatMap((r) => r.evidence.map((p) => entryPathOf(p) ?? p)));
  const leftOut: LeftOutItem[] = [...new Set(wire.leftOut)]
    .filter((p) => OMITTABLE.has(p.split(".")[0]) && /^\w+\.\d+$/.test(p) && readAt(content, p) !== undefined && !cited.has(p))
    .map((path) => ({ path, label: entryLabel(content, path) }));

  return {
    job: { title: wire.job.title.trim() || job.title || "", company: wire.job.company.trim() || job.company || "" },
    sourceResumeId,
    sourceContent: source,
    requirements,
    gaps,
    content: ResumeContentSchema.parse(content),
    changes,
    leftOut,
  };
}

export type FromJobOutcome =
  | { ok: true; draft: FromJobDraft }
  | { ok: false; code: "NO_SOURCE" | "AI_EMPTY"; error?: unknown };

/** Run the use case. `source` is resolved by the caller (route). */
export async function draftResumeFromJob(
  repo: IResumeOwnerReader,
  llm: LLMClient,
  ownerId: string,
  args: { job: ParsedJob; sourceId: string; includeVersions: boolean },
): Promise<FromJobOutcome> {
  const row = await repo.findByIdForOwner(args.sourceId, ownerId);
  if (!row) return { ok: false, code: "NO_SOURCE" };
  const parsed = ResumeContentSchema.safeParse(row.content ?? {});
  let source: ResumeContent = parsed.success ? parsed.data : ResumeContentSchema.parse({});
  if (args.includeVersions) {
    const versions = await repo.findChildrenForOwner(row.id, ownerId);
    source = withVersionEvidence(
      source,
      versions.map((v) => ResumeContentSchema.safeParse(v.content ?? {})).flatMap((r) => (r.success ? [r.data] : [])),
    );
  }
  const { data } = await llm.callJsonLenient("match_tailor", buildPrompt(args.job, evidenceCorpus(source)), FromJobIngest);
  if (data.requirements.length === 0) return { ok: false, code: "AI_EMPTY" };
  return { ok: true, draft: assembleDraft(source, row.id, args.job, data) };
}
