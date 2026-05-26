import { describe, expect, it } from "vitest";
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
    it.each([
      ["off", "off"],
      ["anonymize_candidate", "anonymize_candidate"],
      ["hide_peer_scorecards", "hide_peer_scorecards"],
      ["both", "both"],
      [null, "off"],
      [undefined, "off"],
      ["nonsense", "off"],
    ])("parses %s → %s", (input, expected) => {
      expect(parseBlindReviewMode(input as string | null | undefined)).toBe(expected);
    });
  });

  describe("shouldAnonymizeCandidate", () => {
    it("returns true for anonymize_candidate + both, false otherwise", () => {
      expect(shouldAnonymizeCandidate(kit("anonymize_candidate"))).toBe(true);
      expect(shouldAnonymizeCandidate(kit("both"))).toBe(true);
      expect(shouldAnonymizeCandidate(kit("hide_peer_scorecards"))).toBe(false);
      expect(shouldAnonymizeCandidate(kit("off"))).toBe(false);
      expect(shouldAnonymizeCandidate(null)).toBe(false);
    });
  });

  describe("shouldHidePeerScorecards", () => {
    it("returns true for hide_peer_scorecards + both, false otherwise", () => {
      expect(shouldHidePeerScorecards(kit("hide_peer_scorecards"))).toBe(true);
      expect(shouldHidePeerScorecards(kit("both"))).toBe(true);
      expect(shouldHidePeerScorecards(kit("anonymize_candidate"))).toBe(false);
      expect(shouldHidePeerScorecards(kit("off"))).toBe(false);
      expect(shouldHidePeerScorecards(null)).toBe(false);
    });
  });

  describe("maskCandidateIdentity", () => {
    it("strips candidateUserId when requester is evaluator + policy is on", () => {
      const masked = maskCandidateIdentity(sub(), kit("anonymize_candidate"), true);
      expect(masked.candidateUserId).toBeNull();
    });

    it("returns row unchanged for HM (requesterIsEvaluator = false)", () => {
      const masked = maskCandidateIdentity(sub(), kit("anonymize_candidate"), false);
      expect(masked.candidateUserId).toBe("candidate-1");
    });

    it("returns row unchanged when policy is off", () => {
      const masked = maskCandidateIdentity(sub(), kit("off"), true);
      expect(masked.candidateUserId).toBe("candidate-1");
    });

    it("returns row unchanged when no governing kit", () => {
      const masked = maskCandidateIdentity(sub(), null, true);
      expect(masked.candidateUserId).toBe("candidate-1");
    });
  });

  describe("filterSubmissionsForRequester", () => {
    const own = sub({ id: "own", evaluatorUserId: "me", status: "draft" });
    const ownSubmitted = sub({ id: "own", evaluatorUserId: "me", status: "submitted" });
    const peer = sub({ id: "peer", evaluatorUserId: "other", status: "submitted" });

    it("returns everything when policy is off", () => {
      expect(filterSubmissionsForRequester([own, peer], kit("off"), "me")).toHaveLength(2);
    });

    it("hides peers when requester still has a draft", () => {
      const result = filterSubmissionsForRequester([own, peer], kit("hide_peer_scorecards"), "me");
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("own");
    });

    it("reveals peers once requester's own submission is submitted", () => {
      const result = filterSubmissionsForRequester(
        [ownSubmitted, peer],
        kit("hide_peer_scorecards"),
        "me",
      );
      expect(result).toHaveLength(2);
    });

    it("hides peers when requester has no submission at all", () => {
      // Edge: a reviewer browsing before they've created their own card.
      const result = filterSubmissionsForRequester([peer], kit("both"), "me");
      expect(result).toHaveLength(0);
    });

    it("treats null kit as policy=off", () => {
      const result = filterSubmissionsForRequester([own, peer], null, "me");
      expect(result).toHaveLength(2);
    });
  });
});
