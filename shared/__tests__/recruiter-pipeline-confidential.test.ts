import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isConfidentialIdentityRevealed,
  maskConfidentialCandidate,
  CONFIDENTIAL_CANDIDATE_LABEL,
} from "../recruiter-pipeline.js";

describe("recruiter pipeline confidential masking", () => {
  it("identity stays hidden before shortlist, reveals at/after it", () => {
    assert.equal(isConfidentialIdentityRevealed("applied"), false);
    assert.equal(isConfidentialIdentityRevealed("longlist"), false);
    assert.equal(isConfidentialIdentityRevealed("screening"), false);
    assert.equal(isConfidentialIdentityRevealed("interviewing"), false);
    assert.equal(isConfidentialIdentityRevealed("shortlist"), true);
    assert.equal(isConfidentialIdentityRevealed("submitted"), true);
    assert.equal(isConfidentialIdentityRevealed("offer"), true);
    assert.equal(isConfidentialIdentityRevealed("hired"), true);
  });

  it("rejected never reveals (confidential candidate rejected pre-shortlist stays anonymous)", () => {
    assert.equal(isConfidentialIdentityRevealed("rejected"), false);
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

  it("masks a confidential candidate before shortlist", () => {
    const m = maskConfidentialCandidate(entry, { isConfidential: true, stage: "screening" });
    assert.equal(m.confidentialMasked, true);
    assert.equal(m.candidateName, CONFIDENTIAL_CANDIDATE_LABEL);
    assert.equal(m.candidateEmail, null);
    assert.equal(m.candidatePhone, null);
    assert.equal(m.candidateLinkedinUrl, null);
    assert.equal(m.candidateResumeUrl, null);
    assert.equal(m.candidateAvatarUrl, null);
    assert.equal(m.candidateUserId, null);
  });

  it("reveals a confidential candidate at shortlist", () => {
    const m = maskConfidentialCandidate(entry, { isConfidential: true, stage: "shortlist" });
    assert.equal(m.confidentialMasked, false);
    assert.equal(m.candidateName, "Jane Executive");
    assert.equal(m.candidateEmail, "jane@corp.com");
  });

  it("never masks a non-confidential candidate", () => {
    const m = maskConfidentialCandidate(entry, { isConfidential: false, stage: "applied" });
    assert.equal(m.confidentialMasked, false);
    assert.equal(m.candidateName, "Jane Executive");
  });
});
