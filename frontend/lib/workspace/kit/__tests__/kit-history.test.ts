/** The kit's ONE undo history across the résumé and its free elements
 *  (kit-history.ts, use-kit-history.ts, useContentHistory's step hooks). */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import type { ResumeContent } from "@shared/resume";
import { useContentHistory } from "@/lib/build/use-content-history";
import {
  emptyJournal,
  emptySnapshots,
  forgetSource,
  joinStep,
  recordStep,
  snapshotCommit,
  snapshotRedo,
  snapshotUndo,
  takeRedo,
  takeUndo,
  JOURNAL_LIMIT,
} from "../kit-history";
import { useKitHistory } from "../use-kit-history";

type S = "content" | "layers";

/** The value, or the test fails here (no non-null assertions). */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

describe("journal", () => {
  it("undoes in time order across stores, and redoes back", () => {
    let j = recordStep(recordStep(recordStep(emptyJournal<S>(), "content"), "layers"), "content");
    const a = must(takeUndo(j));
    expect(a.source).toBe("content");
    j = a.next;
    const b = must(takeUndo(j));
    expect(b.source).toBe("layers");
    j = b.next;
    expect(j).toEqual({ past: ["content"], future: ["layers", "content"] });
    const r = must(takeRedo(j));
    expect(r.source).toBe("layers");
  });

  it("a new step drops what was left to redo", () => {
    const j = must(takeUndo(recordStep(emptyJournal<S>(), "layers"))).next;
    expect(recordStep(j, "content")).toEqual({ past: ["content"], future: [] });
  });

  it("forgets one store's steps (a new draft) and stays bounded", () => {
    let j = emptyJournal<S>();
    for (let i = 0; i < JOURNAL_LIMIT + 10; i += 1) j = recordStep(j, i % 2 ? "content" : "layers");
    expect(j.past).toHaveLength(JOURNAL_LIMIT);
    expect(forgetSource(j, "content").past.every((s) => s === "layers")).toBe(true);
    expect(takeUndo(emptyJournal<S>())).toBeNull();
    expect(takeRedo(emptyJournal<S>())).toBeNull();
  });
});

describe("joined steps", () => {
  it("a joined store undoes and redoes with the step it joined", () => {
    const j = joinStep(recordStep(recordStep(emptyJournal<S>(), "content"), "layers"), "content");
    expect(j.past).toEqual(["content", ["layers", "content"]]);
    const u = must(takeUndo(j));
    expect(u.sources).toEqual(["content", "layers"]);
    expect(u.next.past).toEqual(["content"]);
    const r = must(takeRedo(u.next));
    expect(r.sources).toEqual(["layers", "content"]);
  });

  it("joining with nothing to join is a new step; forgetting a store unwraps the join", () => {
    expect(joinStep(emptyJournal<S>(), "layers").past).toEqual(["layers"]);
    const j = joinStep(recordStep(emptyJournal<S>(), "layers"), "content");
    expect(forgetSource(j, "content").past).toEqual(["layers"]);
  });
});

describe("snapshots", () => {
  it("coalesces a burst in one group into one step", () => {
    let s = emptySnapshots<number>();
    const first = snapshotCommit(s, 0, "move:a", 1000, 1200, 50);
    expect(first.newStep).toBe(true);
    s = first.next;
    const second = snapshotCommit(s, 1, "move:a", 1500, 1200, 50);
    expect(second.newStep).toBe(false);
    s = second.next;
    expect(snapshotCommit(s, 2, "move:b", 1600, 1200, 50).newStep).toBe(true);
    expect(snapshotCommit(s, 2, "move:a", 5000, 1200, 50).newStep).toBe(true);
    const undone = must(snapshotUndo(s, 2));
    expect(undone.value).toBe(0);
    const redone = must(snapshotRedo(undone.next, 0, 50));
    expect(redone.value).toBe(2);
    expect(snapshotUndo(emptySnapshots<number>(), 1)).toBeNull();
  });
});

const resume = (summary: string) => ({ basics: { name: "Sean Hogg", summary }, work: [] }) as unknown as ResumeContent;

describe("useKitHistory", () => {
  it("walks the résumé and the elements as one history", () => {
    const { result } = renderHook(() => {
      const kit = useKitHistory();
      const [content, setContent] = useState(resume("v0"));
      const content$ = useContentHistory({
        content,
        draftKey: "draft",
        apply: setContent,
        onStep: () => kit.record("content"),
        onReset: () => kit.forget("content"),
      });
      // A minimal second store: a counter with its own stacks.
      const [layers, setLayers] = useState<number[]>([0]);
      kit.register("content", content$);
      kit.register("layers", {
        undo: () => {
          if (layers.length < 2) return false;
          setLayers(layers.slice(0, -1));
          return true;
        },
        redo: () => false,
      });
      return { kit, content, content$, layers, addLayer: (n: number) => {
        setLayers((l) => [...l, n]);
        kit.record("layers");
      } };
    });

    act(() => result.current.content$.commit(resume("v1"), "a"));
    act(() => result.current.addLayer(1));
    act(() => result.current.content$.commit(resume("v2"), "b"));
    expect(result.current.kit.canUndo).toBe(true);

    act(() => result.current.kit.undo());
    expect((result.current.content.basics as { summary: string }).summary).toBe("v1");
    expect(result.current.layers).toEqual([0, 1]);

    act(() => result.current.kit.undo());
    expect(result.current.layers).toEqual([0]);
    expect((result.current.content.basics as { summary: string }).summary).toBe("v1");

    act(() => result.current.kit.undo());
    expect((result.current.content.basics as { summary: string }).summary).toBe("v0");
    expect(result.current.kit.canUndo).toBe(false);
    expect(result.current.kit.canRedo).toBe(true);

    act(() => result.current.kit.redo());
    expect((result.current.content.basics as { summary: string }).summary).toBe("v1");
  });
});
