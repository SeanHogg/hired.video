/**
 * useThisLine — reads the kit's line selection, resolves it against the
 * draft, and derives the line's findings, suggestions and keywords; Save
 * commits ONE history step grouped by the line, and keeps the selection on
 * the edited line.
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import {
  KitLineSelectionProvider,
  createKitLineSelectionStore,
  type KitLineRef,
} from "@/lib/workspace/kit/use-kit-line-selection";
import type { JobMatch } from "@/lib/build/job-match";
import type { PageFinding } from "@/lib/build/page-findings";
import { useThisLine } from "../use-this-line";

const ID = "w1";
const LINE = "Cut operating costs 43% by consolidating vendors.";

const content: ResumeContent = ResumeContentSchema.parse({
  basics: { name: "Sean Hogg" },
  work: [{ id: ID, name: "AiM", position: "CIO", highlights: [LINE, "Grew the team."] }],
});

const rewrite: PageFinding = {
  id: "7:0",
  source: "roast",
  kind: "rewrite",
  severity: "important",
  labelKey: "build.findings.flag.roastRewrite",
  rewrite: { before: LINE, after: "Cut costs 43% ($1.79M)." },
  anchor: { path: "work.0.highlights.0", section: "work", itemId: ID, field: "highlights", text: LINE, start: 0, end: LINE.length },
};
const elsewhere: PageFinding = { ...rewrite, id: "7:1", anchor: { ...rewrite.anchor, path: "work.0.highlights.1" } };

const jobMatch: JobMatch = { jobLabel: "CIO · Macomb", score: 85, found: ["operating costs"], missing: ["budget"], source: "tool" };

function setup(initial: KitLineRef | null) {
  const store = createKitLineSelectionStore(initial);
  const commit = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <KitLineSelectionProvider store={store}>{children}</KitLineSelectionProvider>
  );
  const hook = renderHook(() => useThisLine({ content, findings: [rewrite, elsewhere], jobMatch, commit }), { wrapper });
  return { store, commit, hook };
}

describe("useThisLine", () => {
  it("is empty with nothing selected", () => {
    const { hook } = setup(null);
    expect(hook.result.current.line).toBeNull();
    expect(hook.result.current.findings).toEqual([]);
    expect(hook.result.current.keywords).toBeNull();
  });

  it("derives the selected line's findings, suggestions and keywords", () => {
    const { hook } = setup({ section: "work", itemId: ID, lineIndex: 0, text: LINE });
    const { line, findings, suggestions, keywords } = hook.result.current;
    expect(line).toMatchObject({ path: "work.0.highlights.0", itemTitle: "CIO" });
    expect(findings.map((f) => f.id)).toEqual(["7:0"]);
    expect(suggestions).toEqual([{ id: "7:0", text: "Cut costs 43% ($1.79M)." }]);
    expect(keywords).toEqual({ matched: ["operating costs"], missing: ["budget"] });
  });

  it("commits an edit as one step grouped by the line and follows it with the selection", () => {
    const { hook, commit, store } = setup({ section: "work", itemId: ID, lineIndex: 0, text: LINE });
    act(() => hook.result.current.commitLine("Cut costs 43%."));
    expect(commit).toHaveBeenCalledTimes(1);
    const [next, group] = commit.mock.calls[0];
    expect((next as ResumeContent).work[0].highlights).toEqual(["Cut costs 43%.", "Grew the team."]);
    expect(group).toBe("line:work.0.highlights.0");
    expect(content.work[0].highlights[0]).toBe(LINE);
    expect(store.get()).toEqual({ section: "work", itemId: ID, lineIndex: 0, text: "Cut costs 43%." });
  });

  it("doesn't commit an unchanged line", () => {
    const { hook, commit } = setup({ section: "work", itemId: ID, lineIndex: 0, text: LINE });
    act(() => hook.result.current.commitLine(LINE));
    expect(commit).not.toHaveBeenCalled();
  });

  it("clear() drops the selection", () => {
    const { hook, store } = setup({ section: "work", itemId: ID, lineIndex: 0, text: LINE });
    act(() => hook.result.current.clear());
    expect(store.get()).toBeNull();
    expect(hook.result.current.line).toBeNull();
  });
});
