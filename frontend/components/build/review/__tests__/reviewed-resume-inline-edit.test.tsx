/**
 * The kit page's inline edit (#1916): the DRAFT is the form — a double-click
 * types in place and the commit carries only the edited field — while a
 * review's Before / After / Changes page is never editable.
 *
 * Run: vitest run components/build/review/__tests__/reviewed-resume-inline-edit.test.tsx
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { writeAt } from "@shared/resume-path";
import type { ResumeContent } from "@shared/resume";
import { DEFAULT_DESCRIPTOR } from "@/types/resume-template";
import { toPreviewResume } from "@/lib/build/preview-resume";
import type { BuildReview } from "@/lib/build/review/use-build-review";
import { resumeFixture } from "@/lib/studio/document/__tests__/resume-fixture";
import ReviewedResumePane from "../ReviewedResumePane";

// The review chrome around the page isn't under test here.
vi.mock("../ComparePanel", () => ({ default: () => null }));
vi.mock("../LineageBadge", () => ({ default: () => null }));
vi.mock("../ReviewBar", () => ({ default: () => null }));
vi.mock("../StalenessBanner", () => ({ default: () => null }));
vi.mock("../finding-annotations", () => ({ useFindingAnnotations: () => undefined }));
vi.mock("../use-review-annotations", () => ({ useReviewAnnotations: () => undefined }));

function review(active: boolean, pageContent: ResumeContent | null): BuildReview {
  return {
    active: active ? { kind: "tailor" } : null,
    pageContent,
    lineage: null,
    openCompare: vi.fn(),
    startPull: vi.fn(),
  } as unknown as BuildReview;
}

function mount(active: boolean) {
  const draft = resumeFixture();
  const onChange = vi.fn();
  const proposed = writeAt(resumeFixture(), "basics.label", "Chief Technology Officer");
  const utils = render(
    <ReviewedResumePane
      review={review(active, active ? proposed : null)}
      draft={draft}
      resume={toPreviewResume(draft, "Sean Hogg")}
      resumeId="res-1"
      descriptor={DEFAULT_DESCRIPTOR}
      onEditSection={vi.fn()}
      zoom={1}
      renderPage={(page) => page}
      inlineEdit={{ content: draft, onChange }}
    />,
  );
  return { ...utils, draft, onChange };
}

describe("ReviewedResumePane inline edit", () => {
  it("the draft edits in place and commits only the edited field", () => {
    const { container, draft, onChange } = mount(false);
    const name = container.querySelector<HTMLElement>('[data-inline-path="basics.name"]');
    expect(name).not.toBeNull();
    fireEvent.doubleClick(name!);
    const typing = container.querySelector<HTMLElement>('[data-inline-path="basics.name"][contenteditable]')!;
    typing.textContent = "Sean P. Hogg";
    fireEvent.blur(typing);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ResumeContent;
    expect(next).toEqual(writeAt(resumeFixture(), "basics.name", "Sean P. Hogg"));
    expect(next.work).toBe(draft.work);
    expect(next.metaData).toBe(draft.metaData);
    expect(next.skillEvidence).toBe(draft.skillEvidence);
  });

  it("an open review's page is read-only", () => {
    const { container, onChange } = mount(true);
    expect(container.querySelector("[data-inline-path]")).toBeNull();
    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
