// @ts-ignore vitest types aren't in the api package's tsconfig; shared
// tests run under vitest (frontend) — same convention as the other tests.
import { expect, test } from "vitest";
import {
  isConfidentialIdentityRevealed,
  maskConfidentialCandidate,
  CONFIDENTIAL_CANDIDATE_LABEL,
} from "../recruiter-pipeline.js";

test("identity stays hidden before shortlist, reveals at/after it", () => {
  expect(isConfidentialIdentityRevealed("applied")).toBe(false);
  expect(isConfidentialIdentityRevealed("longlist")).toBe(false);
  expect(isConfidentialIdentityRevealed("screening")).toBe(false);
  expect(isConfidentialIdentityRevealed("interviewing")).toBe(false);
  expect(isConfidentialIdentityRevealed("shortlist")).toBe(true);
  expect(isConfidentialIdentityRevealed("submitted")).toBe(true);
  expect(isConfidentialIdentityRevealed("offer")).toBe(true);
  expect(isConfidentialIdentityRevealed("hired")).toBe(true);
});

test("rejected never reveals (confidential candidate rejected pre-shortlist stays anonymous)", () => {
  expect(isConfidentialIdentityRevealed("rejected")).toBe(false);
});

const entry = {
  candidateName: "Jane Executive",
  candidateEmail: "jane@corp.com",
  candidatePhone: "+1 555 0100",
  candidateLocation: "NYC",
  candidateLinkedinUrl: "https://linkedin.com/in/jane",
  candidateResumeUrl: "https://cdn/resume.pdf",
  candidateAvatarUrl: "https://cdn/jane.jpg",
  candidateUserId: "u-1",
};

test("masks a confidential candidate before shortlist", () => {
  const m = maskConfidentialCandidate(entry, { isConfidential: true, stage: "screening" });
  expect(m.confidentialMasked).toBe(true);
  expect(m.candidateName).toBe(CONFIDENTIAL_CANDIDATE_LABEL);
  expect(m.candidateEmail).toBeNull();
  expect(m.candidatePhone).toBeNull();
  expect(m.candidateLinkedinUrl).toBeNull();
  expect(m.candidateResumeUrl).toBeNull();
  expect(m.candidateAvatarUrl).toBeNull();
  expect(m.candidateUserId).toBeNull();
});

test("reveals a confidential candidate at shortlist", () => {
  const m = maskConfidentialCandidate(entry, { isConfidential: true, stage: "shortlist" });
  expect(m.confidentialMasked).toBe(false);
  expect(m.candidateName).toBe("Jane Executive");
  expect(m.candidateEmail).toBe("jane@corp.com");
});

test("never masks a non-confidential candidate", () => {
  const m = maskConfidentialCandidate(entry, { isConfidential: false, stage: "applied" });
  expect(m.confidentialMasked).toBe(false);
  expect(m.candidateName).toBe("Jane Executive");
});
