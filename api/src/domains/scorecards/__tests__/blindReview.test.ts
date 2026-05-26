import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  filterSubmissionsForRequester,
  maskCandidateIdentity,
  parseBlindReviewMode,
  shouldAnonymizeCandidate,
  shouldHidePeerScorecards,
} from "../blindReview.js";
import type {
  InterviewKitRow,
  ScorecardSubmissionRow,
} from "../../../repositories/scorecardsRepository.js";

const kit = (mode: string): Pick<InterviewKitRow, "blindReviewMode"> => ({
  blindReviewMode: mode,
});

const sub = (overrides: Partial<ScorecardSubmissionRow> = {}): ScorecardSubmissionRow =>
  ({
    id: "s1",
    templateId: "t1",
    interviewId: null,
    kitStageId: null,
    applicationId: "app1",
    candidateUserId: "candidate-1",
    evaluatorUserId: "eval-1",
    overallRecommendation: null,
    overallScore: null,
    summary: null,
    strengths: null,
    concerns: null,
    status: "draft",
    submittedAt: null,
    dueAt: null,
    remindedAt: null,
    escalatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as ScorecardSubmissionRow;

describe("blindReview", () => {
  describe("parseBlindReviewMode", () => {
    const cases: Array<[string | null | undefined, string]> = [
      ["off", "off"],
      ["anonymize_candidate", "anonymize_candidate"],
      ["hide_peer_scorecards", "hide_peer_scorecards"],
      ["both", "both"],
      [null, "off"],
      [undefined, "off"],
      ["nonsense", "off"],
    ];
    for (const [input, expected] of cases) {
      it(`parses ${String(input)} → ${expected}`, () => {
        assert.equal(parseBlindReviewMode(input), expected);
      });
    }
  });

  describe("shouldAnonymizeCandidate", () => {
    it("returns true for anonymize_candidate + both, false otherwise", () => {
      assert.equal(shouldAnonymizeCandidate(kit("anonymize_candidate")), true);
      assert.equal(shouldAnonymizeCandidate(kit("both")), true);
      assert.equal(shouldAnonymizeCandidate(kit("hide_peer_scorecards")), false);
      assert.equal(shouldAnonymizeCandidate(kit("off")), false);
      assert.equal(shouldAnonymizeCandidate(null), false);
    });
  });

  describe("shouldHidePeerScorecards", () => {
    it("returns true for hide_peer_scorecards + both, false otherwise", () => {
      assert.equal(shouldHidePeerScorecards(kit("hide_peer_scorecards")), true);
      assert.equal(shouldHidePeerScorecards(kit("both")), true);
      assert.equal(shouldHidePeerScorecards(kit("anonymize_candidate")), false);
      assert.equal(shouldHidePeerScorecards(kit("off")), false);
      assert.equal(shouldHidePeerScorecards(null), false);
    });
  });

  describe("maskCandidateIdentity", () => {
    it("strips candidateUserId + flags _anonymized when requester is evaluator + policy is on", () => {
      const masked = maskCandidateIdentity(sub(), kit("anonymize_candidate"), true);
      assert.equal(masked.candidateUserId, null);
      assert.equal(masked._anonymized, true);
    });

    it("returns row unchanged for HM (requesterIsEvaluator = false), no _anonymized flag", () => {
      const masked = maskCandidateIdentity(sub(), kit("anonymize_candidate"), false);
      assert.equal(masked.candidateUserId, "candidate-1");
      assert.equal(masked._anonymized, undefined);
    });

    it("returns row unchanged when policy is off", () => {
      const masked = maskCandidateIdentity(sub(), kit("off"), true);
      assert.equal(masked.candidateUserId, "candidate-1");
      assert.equal(masked._anonymized, undefined);
    });

    it("returns row unchanged when no governing kit", () => {
      const masked = maskCandidateIdentity(sub(), null, true);
      assert.equal(masked.candidateUserId, "candidate-1");
      assert.equal(masked._anonymized, undefined);
    });
  });

  describe("filterSubmissionsForRequester", () => {
    const own = sub({ id: "own", evaluatorUserId: "me", status: "draft" });
    const ownSubmitted = sub({ id: "own", evaluatorUserId: "me", status: "submitted" });
    const peer = sub({ id: "peer", evaluatorUserId: "other", status: "submitted" });

    it("returns everything when policy is off", () => {
      assert.equal(filterSubmissionsForRequester([own, peer], kit("off"), "me").length, 2);
    });

    it("hides peers when requester still has a draft", () => {
      const result = filterSubmissionsForRequester([own, peer], kit("hide_peer_scorecards"), "me");
      assert.equal(result.length, 1);
      assert.equal(result[0]?.id, "own");
    });

    it("reveals peers once requester's own submission is submitted", () => {
      const result = filterSubmissionsForRequester(
        [ownSubmitted, peer],
        kit("hide_peer_scorecards"),
        "me",
      );
      assert.equal(result.length, 2);
    });

    it("hides peers when requester has no submission at all", () => {
      // Edge: a reviewer browsing before they've created their own card.
      const result = filterSubmissionsForRequester([peer], kit("both"), "me");
      assert.equal(result.length, 0);
    });

    it("treats null kit as policy=off", () => {
      const result = filterSubmissionsForRequester([own, peer], null, "me");
      assert.equal(result.length, 2);
    });
  });
});
