/**
 * useBuildChat — a revision replaces the draft and its turn names what
 * changed; a revision that changed nothing leaves the draft (and the undo
 * stack) alone; a question's answer never touches the draft; a failure is a
 * failed turn.
 */
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ResumeContent } from "@shared/resume";

// A plain stub, not a vi.fn spy: each test sets `stub.reply`.
const stub = vi.hoisted(() => ({ reply: (): Promise<unknown> => Promise.resolve(null) }));
vi.mock("@/lib/services/resume-service", () => ({
  resumeService: { reviseResumeContent: () => stub.reply() },
}));

import { useBuildChat } from "@/lib/build/use-build-chat";

const DRAFT = {
  basics: { name: "Sean Hogg", label: "CTO and Technology Leader", summary: "25 years leading engineering." },
  work: [
    {
      id: "3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11",
      name: "BuilderForce.ai",
      position: "Chief Innovation Officer",
      startDate: "2025-12",
      highlights: ["Built an agentic coding platform used by 40 teams"],
    },
  ],
} as unknown as ResumeContent;

function setup() {
  const onRevised = vi.fn();
  const hook = renderHook(() => useBuildChat({ content: DRAFT, draftKey: "draft-1", resumeId: null, focus: { view: "page" }, onRevised }));
  return { hook, onRevised };
}


describe("useBuildChat", () => {
  it("applies a revision and records the areas it changed", async () => {
    const revised = { ...DRAFT, basics: { ...DRAFT.basics, summary: "Punchier." } };
    stub.reply = async () => ({ content: revised, changed: ["summary"] });
    const { hook, onRevised } = setup();
    await act(() => hook.result.current.send("make the summary punchier"));
    expect(onRevised).toHaveBeenCalledWith(revised);
    expect(hook.result.current.turns.at(-1)).toMatchObject({ outcome: "revised", changed: ["summary"] });
  });

  it("doesn't touch the draft when the revision changed nothing", async () => {
    stub.reply = async () => ({ content: DRAFT, changed: [] });
    const { hook, onRevised } = setup();
    await act(() => hook.result.current.send("fit it on one page"));
    expect(onRevised).not.toHaveBeenCalled();
    expect(hook.result.current.turns.at(-1)).toMatchObject({ outcome: "revised", changed: [] });
  });

  it("answers a question without touching the draft", async () => {
    stub.reply = async () => ({ reply: "No dated role from Dec 2024 to Nov 2025." });
    const { hook, onRevised } = setup();
    await act(() => hook.result.current.send("how did you determine I have a career break?"));
    expect(onRevised).not.toHaveBeenCalled();
    expect(hook.result.current.turns.at(-1)).toMatchObject({
      outcome: "answered",
      text: "No dated role from Dec 2024 to Nov 2025.",
    });
  });

  it("records a failed turn when the request fails", async () => {
    stub.reply = async () => {
      throw new Error("network");
    };
    const { hook, onRevised } = setup();
    await act(() => hook.result.current.send("make it punchier"));
    expect(onRevised).not.toHaveBeenCalled();
    expect(hook.result.current.turns.at(-1)).toMatchObject({ outcome: "failed" });
  });
});
