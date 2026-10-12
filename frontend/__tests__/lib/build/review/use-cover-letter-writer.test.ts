/**
 * useCoverLetterWriter — the cover letter is written AUTOMATICALLY once a job
 * review is ready: straight away on Pro; on a free plan it waits "locked"
 * and is written the moment the plan turns Pro (no second click); a server
 * PRO_REQUIRED (stale client plan) lands as locked too. Plus the shared
 * letter helpers it relies on (shared/cover-letter.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ResumeContent } from "@shared/resume";
import {
  coverLetterSender,
  coverLetterToText,
  readCoverLetter,
  withCoverLetter,
  type CoverLetter,
} from "@shared/cover-letter";

const plan = { isPro: true, loading: false };
const writeCoverLetter = vi.fn();

const recordRun = vi.fn(() => Promise.resolve());

vi.mock("@/lib/hooks/useSubscription", () => ({ useSubscription: () => plan }));
vi.mock("@/lib/tools/use-tool-run-recorder", () => ({ useToolRunRecorder: () => ({ recordRun }) }));
vi.mock("@/lib/services/match-service", () => ({
  matchService: { writeCoverLetter: (req: unknown) => writeCoverLetter(req) },
}));

import { useCoverLetterWriter } from "@/lib/build/review/use-cover-letter-writer";

const RESUME = {
  basics: { name: "Sean Hogg", email: "sean@example.com", phone: "248-825-0176", location: { city: "Clinton Township", region: "MI" } },
  work: [{ id: "seed-work-002", name: "Alliance Inspection Management", position: "CIO / VP of Technology" }],
} as unknown as ResumeContent;

const LETTER: CoverLetter = {
  jobTitle: "Chief Information Officer",
  organization: "Macomb Community College",
  recipientLines: ["Search Committee", "Macomb Community College"],
  salutation: "Dear Members of the Search Committee:",
  opening: ["I am applying for the Chief Information Officer role."],
  highlightsIntro: "",
  highlights: [{ label: "Budget", text: "Cut operating costs by $1.79M." }],
  closing: ["Thank you for your consideration."],
  signOff: "Sincerely,",
  date: "2026-10-04",
};

const JOB = { jobHtml: "Chief Information Officer — Macomb Community College", label: "CIO" };

beforeEach(() => {
  plan.isPro = true;
  plan.loading = false;
  writeCoverLetter.mockReset();
  recordRun.mockClear();
});

describe("useCoverLetterWriter", () => {
  it("writes the letter as soon as it is requested on Pro", async () => {
    writeCoverLetter.mockResolvedValue(LETTER);
    const { result } = renderHook(() => useCoverLetterWriter());
    act(() => result.current.request(JOB, RESUME));
    await waitFor(() => expect(result.current.letter).toEqual(LETTER));
    expect(writeCoverLetter).toHaveBeenCalledWith({ jobId: undefined, jobHtml: JOB.jobHtml, resumeContent: RESUME });
    expect(result.current.draft(JOB, RESUME).status).toBe("ready");
    expect(recordRun).toHaveBeenCalledWith(expect.objectContaining({ summary: "Chief Information Officer · Macomb Community College" }));
  });

  it("waits locked on a free plan, then writes once the plan turns Pro", async () => {
    plan.isPro = false;
    writeCoverLetter.mockResolvedValue(LETTER);
    const { result, rerender } = renderHook(() => useCoverLetterWriter());
    act(() => result.current.request(JOB, RESUME));
    await waitFor(() => expect(result.current.draft(JOB, RESUME).status).toBe("locked"));
    expect(writeCoverLetter).not.toHaveBeenCalled();

    plan.isPro = true;
    rerender();
    await waitFor(() => expect(result.current.letter).toEqual(LETTER));
    expect(writeCoverLetter).toHaveBeenCalledTimes(1);
  });

  it("treats the server's PRO_REQUIRED as locked", async () => {
    writeCoverLetter.mockRejectedValue({ code: "PRO_REQUIRED", context: { serverCode: "PRO_REQUIRED" } });
    const { result } = renderHook(() => useCoverLetterWriter());
    act(() => result.current.request(JOB, RESUME));
    await waitFor(() => expect(result.current.draft(JOB, RESUME).status).toBe("locked"));
  });

  it("drops a letter that was being written when the review resets", async () => {
    let resolve: (l: CoverLetter) => void = () => {};
    writeCoverLetter.mockReturnValue(new Promise<CoverLetter>((r) => (resolve = r)));
    const { result } = renderHook(() => useCoverLetterWriter());
    act(() => result.current.request(JOB, RESUME));
    await waitFor(() => expect(writeCoverLetter).toHaveBeenCalled());
    act(() => result.current.reset());
    await act(async () => resolve(LETTER));
    expect(result.current.letter).toBeNull();
    expect(result.current.draft(JOB, RESUME).status).toBe("idle");
  });
});

describe("shared/cover-letter", () => {
  it("stores the letter on the résumé and removes it again", () => {
    const withLetter = withCoverLetter(RESUME, LETTER);
    expect(readCoverLetter(withLetter)).toEqual(LETTER);
    expect(readCoverLetter(withCoverLetter(withLetter, null))).toBeNull();
    expect(readCoverLetter(RESUME)).toBeNull();
  });

  it("ignores a malformed stored letter", () => {
    expect(readCoverLetter({ ...RESUME, meta: { coverLetter: { opening: [] } } } as ResumeContent)).toBeNull();
  });

  it("signs with the résumé header, never a stored copy", () => {
    expect(coverLetterSender(RESUME)).toEqual({
      name: "Sean Hogg",
      contact: ["sean@example.com", "248-825-0176", "Clinton Township, MI"],
    });
    const text = coverLetterToText(LETTER, RESUME, "October 4, 2026");
    expect(text.startsWith("Sean Hogg\nsean@example.com · 248-825-0176 · Clinton Township, MI")).toBe(true);
    expect(text).toContain("- Budget: Cut operating costs by $1.79M.");
    expect(text.endsWith("Sincerely,\n\nSean Hogg")).toBe(true);
  });
});
