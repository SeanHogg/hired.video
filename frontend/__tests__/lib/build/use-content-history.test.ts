/**
 * useContentHistory — undo / redo over the kit draft: one step per commit,
 * typing bursts coalesced per group, redo cleared by a new change, stacks
 * reset for a new draft, and bounded growth.
 */
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import type { ResumeContent } from "@shared/resume";
import { COALESCE_MS, HISTORY_LIMIT, useContentHistory } from "@/lib/build/use-content-history";

/** Shaped like a parsed résumé row: id-keyed items, as /api/resumes/parse returns. */
function resume(summary: string): ResumeContent {
  return {
    basics: { name: "Sean Hogg", label: "CTO and Technology Leader", summary },
    work: [
      {
        id: "3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11",
        name: "Alliance Inspection Management",
        position: "Chief Innovation Officer",
        startDate: "2021-03",
        highlights: ["$1.79M annual savings through IT modernization"],
      },
    ],
  } as unknown as ResumeContent;
}

function setup(initial: ResumeContent, draftKey: unknown = { kind: "file" }) {
  let clock = 1_000;
  const hook = renderHook(
    ({ key }: { key: unknown }) => {
      const [content, setContent] = useState<ResumeContent>(initial);
      const history = useContentHistory({ content, draftKey: key, apply: setContent, now: () => clock });
      return { content, history };
    },
    { initialProps: { key: draftKey } },
  );
  return {
    hook,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const summary = (r: { current: { content: ResumeContent } }) =>
  (r.current.content.basics as { summary?: string }).summary;

describe("useContentHistory", () => {
  it("undoes and redoes a single commit", () => {
    const { hook } = setup(resume("v0"));
    act(() => hook.result.current.history.commit(resume("v1")));
    expect(summary(hook.result)).toBe("v1");
    expect(hook.result.current.history.canUndo).toBe(true);

    act(() => hook.result.current.history.undo());
    expect(summary(hook.result)).toBe("v0");
    expect(hook.result.current.history.canUndo).toBe(false);
    expect(hook.result.current.history.canRedo).toBe(true);

    act(() => hook.result.current.history.redo());
    expect(summary(hook.result)).toBe("v1");
    expect(hook.result.current.history.canRedo).toBe(false);
  });

  it("coalesces a typing burst in one group into ONE undo step", () => {
    const { hook, tick } = setup(resume(""));
    for (const text of ["C", "CT", "CTO"]) {
      act(() => hook.result.current.history.commit(resume(text), "edit:basics"));
      tick(200);
    }
    act(() => hook.result.current.history.undo());
    expect(summary(hook.result)).toBe("");
    expect(hook.result.current.history.canUndo).toBe(false);
  });

  it("starts a new step after a pause or in a different group", () => {
    const { hook, tick } = setup(resume("v0"));
    act(() => hook.result.current.history.commit(resume("v1"), "edit:basics"));
    tick(COALESCE_MS + 1);
    act(() => hook.result.current.history.commit(resume("v2"), "edit:basics"));
    act(() => hook.result.current.history.commit(resume("v3"), "edit:work"));

    act(() => hook.result.current.history.undo());
    expect(summary(hook.result)).toBe("v2");
    act(() => hook.result.current.history.undo());
    expect(summary(hook.result)).toBe("v1");
    act(() => hook.result.current.history.undo());
    expect(summary(hook.result)).toBe("v0");
  });

  it("a new change after undo discards the redo stack", () => {
    const { hook } = setup(resume("v0"));
    act(() => hook.result.current.history.commit(resume("v1")));
    act(() => hook.result.current.history.undo());
    act(() => hook.result.current.history.commit(resume("other")));
    expect(hook.result.current.history.canRedo).toBe(false);
    expect(summary(hook.result)).toBe("other");
  });

  it("ignores undo / redo with empty stacks and a no-op commit", () => {
    const initial = resume("v0");
    const { hook } = setup(initial);
    act(() => hook.result.current.history.undo());
    act(() => hook.result.current.history.redo());
    act(() => hook.result.current.history.commit(hook.result.current.content));
    expect(hook.result.current.content).toBe(initial);
    expect(hook.result.current.history.canUndo).toBe(false);
  });

  it("clears both stacks for a new draft", () => {
    const { hook } = setup(resume("v0"));
    act(() => hook.result.current.history.commit(resume("v1")));
    act(() => hook.result.current.history.commit(resume("v2"), "other"));
    act(() => hook.result.current.history.undo());
    hook.rerender({ key: { kind: "existing" } });
    expect(hook.result.current.history.canUndo).toBe(false);
    expect(hook.result.current.history.canRedo).toBe(false);
  });

  it("keeps at most HISTORY_LIMIT undo steps", () => {
    const { hook, tick } = setup(resume("start"));
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      act(() => hook.result.current.history.commit(resume(`v${i}`)));
      tick(COALESCE_MS + 1);
    }
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      act(() => hook.result.current.history.undo());
    }
    expect(hook.result.current.history.canUndo).toBe(false);
    // The oldest five steps (incl. "start") were dropped.
    expect(summary(hook.result)).toBe("v4");
  });
});
