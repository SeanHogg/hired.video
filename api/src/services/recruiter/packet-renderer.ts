/**
 * Candidate Packet renderer (#243).
 *
 * Builds a print-ready, multi-candidate HTML packet from a recruiter's
 * `candidateSubmissions` — the artefact a recruiter hands a hiring manager to
 * review a shortlist. Browser print-to-PDF (shared print-shell) is used, same
 * as workforce invoices/timesheets. With `anonymize` on, each candidate's
 * name → initials and email + photo are dropped (bias-reduced review); the
 * substance (target role, stage, salary ask, availability, recruiter notes,
 * cover letter) renders either way.
 *
 * Ownership is enforced in the query (recruiterId = caller), so a recruiter
 * can only ever export their own submissions.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { formatMoney, printShell } from "../print/print-shell.js";
import { escapeHtml } from "../../../../shared/html-escape.js";
import {
  anonymizeIdentity,
  candidateInitials,
  type PacketCandidateIdentity,
} from "../../domains/recruiter/candidatePacket.js";

const PACKET_CSS = `
  .cover { margin-bottom: 1.5rem; }
  .cover .badge { display: inline-block; font-size: 9pt; color: #555; background: #f0f0f1; border-radius: 999px; padding: 2px 10px; margin-top: 6px; }
  .candidate { border: 1px solid #e3e3e6; border-radius: 8px; padding: 14px 16px; margin: 0 0 12px; page-break-inside: avoid; }
  .candidate .top { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
  .avatar.placeholder { display: flex; align-items: center; justify-content: center; background: #2b2b30; color: #fff; font-weight: 600; font-size: 13pt; }
  .candidate .name { font-size: 13pt; font-weight: 700; }
  .candidate .sub { color: #666; font-size: 9pt; }
  .meta { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 9.5pt; margin: 6px 0; }
  .meta .k { color: #777; }
  .notes { font-size: 9.5pt; white-space: pre-wrap; margin-top: 6px; }
  .notes .label { color: #777; font-weight: 600; display: block; margin-top: 6px; }
`;

interface PacketRow {
  identity: PacketCandidateIdentity;
  jobTitle: string | null;
  companyName: string | null;
  status: string | null;
  proposedSalary: string | number | null;
  availableStartDate: Date | null;
  recruiterNotes: string | null;
  coverLetter: string | null;
  hasResume: boolean;
}

function renderCandidate(row: PacketRow): string {
  const { identity } = row;
  const avatar = identity.avatarUrl
    ? `<img class="avatar" src="${escapeHtml(identity.avatarUrl)}" alt="">`
    : `<div class="avatar placeholder">${escapeHtml(candidateInitials(identity.name))}</div>`;

  const metaRows: string[] = [];
  if (row.jobTitle) {
    metaRows.push(
      `<span class="k">Applying for</span><span>${escapeHtml(row.jobTitle)}${row.companyName ? ` · ${escapeHtml(row.companyName)}` : ""}</span>`,
    );
  }
  if (row.status) metaRows.push(`<span class="k">Stage</span><span>${escapeHtml(row.status)}</span>`);
  if (row.proposedSalary != null) {
    metaRows.push(`<span class="k">Salary ask</span><span>${formatMoney(row.proposedSalary)}</span>`);
  }
  if (row.availableStartDate) {
    metaRows.push(
      `<span class="k">Available</span><span>${escapeHtml(row.availableStartDate.toLocaleDateString())}</span>`,
    );
  }
  // Resume is only referenced when not anonymizing — the resume itself carries
  // the candidate's name/contact, which would defeat the blind-review intent.
  if (row.hasResume && identity.email !== null) {
    metaRows.push(`<span class="k">Resume</span><span>On file</span>`);
  }

  const notes: string[] = [];
  if (row.recruiterNotes) {
    notes.push(`<span class="label">Recruiter notes</span>${escapeHtml(row.recruiterNotes)}`);
  }
  if (row.coverLetter) {
    notes.push(`<span class="label">Cover letter</span>${escapeHtml(row.coverLetter)}`);
  }

  return `
    <div class="candidate">
      <div class="top">
        ${avatar}
        <div>
          <div class="name">${escapeHtml(identity.name)}</div>
          ${identity.email ? `<div class="sub">${escapeHtml(identity.email)}</div>` : ""}
        </div>
      </div>
      ${metaRows.length ? `<div class="meta">${metaRows.join("")}</div>` : ""}
      ${notes.length ? `<div class="notes">${notes.join("")}</div>` : ""}
    </div>`;
}

export async function renderCandidatePacketHtml(
  recruiterUserId: string,
  submissionIds: string[],
  anonymize: boolean,
  db = getDb(),
): Promise<string> {
  const ids = submissionIds.filter(Boolean);
  if (ids.length === 0) throw new ForbiddenError("No candidates selected for the packet");

  // Ownership is enforced here: only the caller's own submissions are loaded,
  // so an attacker-supplied id for someone else's submission is silently
  // excluded rather than exported.
  const subs = await db
    .select()
    .from(schema.candidateSubmissions)
    .where(
      and(
        inArray(schema.candidateSubmissions.id, ids),
        eq(schema.candidateSubmissions.recruiterId, recruiterUserId),
      ),
    );
  if (subs.length === 0) {
    throw new ForbiddenError("No exportable candidates found for this recruiter");
  }

  // Resolve current avatars in one query (avoid N+1) — only needed when we'll
  // actually render photos (i.e. not anonymizing).
  const avatarByUser = new Map<string, string | null>();
  if (!anonymize) {
    const candidateIds = [...new Set(subs.map((s) => s.candidateId).filter(Boolean))];
    if (candidateIds.length > 0) {
      const profiles = await db
        .select({ userId: schema.userProfiles.userId, avatarUrl: schema.userProfiles.avatarUrl })
        .from(schema.userProfiles)
        .where(inArray(schema.userProfiles.userId, candidateIds));
      for (const p of profiles) avatarByUser.set(p.userId, p.avatarUrl ?? null);
    }
  }

  const rows: PacketRow[] = subs.map((s) => {
    const identity = anonymizeIdentity(
      {
        name: s.candidateName,
        email: s.candidateEmail ?? null,
        avatarUrl: avatarByUser.get(s.candidateId) ?? null,
      },
      anonymize,
    );
    return {
      identity,
      jobTitle: s.jobTitle ?? null,
      companyName: s.companyName ?? null,
      status: s.status ?? null,
      proposedSalary: s.proposedSalary ?? null,
      availableStartDate: s.availableStartDate ?? null,
      recruiterNotes: s.recruiterNotes ?? null,
      coverLetter: s.coverLetter ?? null,
      hasResume: Boolean(s.resumeId),
    };
  });

  const targetRole = rows.find((r) => r.jobTitle)?.jobTitle ?? null;
  const body = `
    <div class="cover">
      <h1>Candidate Packet</h1>
      <div class="muted">${rows.length} candidate${rows.length === 1 ? "" : "s"}${targetRole ? ` · ${escapeHtml(targetRole)}` : ""}</div>
      ${anonymize ? `<div class="badge">Anonymized — names, emails &amp; photos hidden for unbiased review</div>` : ""}
    </div>
    ${rows.map(renderCandidate).join("")}
    <div class="footer">Generated from recruiter submissions · Hired.Video</div>`;

  return printShell("Candidate Packet", body, PACKET_CSS);
}
