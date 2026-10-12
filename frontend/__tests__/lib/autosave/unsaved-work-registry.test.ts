/**
 * The app-wide unsaved-work registry (hooks/use-unsaved-work.ts, #1991):
 * one signal the PWA update prompt and the browser's unload prompt both read.
 *   - registering marks work unsaved; releasing every owner clears it;
 *   - the beforeunload guard is attached only while something is dirty
 *     (pages without an editor keep the back/forward cache);
 *   - the declarative hook follows its `dirty` flag and releases on unmount.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  hasUnsavedWork,
  releaseAllUnsavedWork,
  setUnsavedWork,
  useRegisterUnsavedWork,
} from "@/hooks/use-unsaved-work";

function fireBeforeUnload(): Event {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

afterEach(() => {
  releaseAllUnsavedWork();
});

describe("unsaved-work registry", () => {
  it("is clean until an editor registers, and clean again once every editor is saved", () => {
    const resumeRow = Symbol("resume:3f2a9c1e");
    const studioProject = Symbol("studio:6b1f9a52");
    expect(hasUnsavedWork()).toBe(false);
    setUnsavedWork(resumeRow, true);
    setUnsavedWork(studioProject, true);
    expect(hasUnsavedWork()).toBe(true);
    setUnsavedWork(resumeRow, false);
    expect(hasUnsavedWork()).toBe(true); // the studio project is still unsaved
    setUnsavedWork(studioProject, false);
    expect(hasUnsavedWork()).toBe(false);
  });

  it("registering the same owner twice still needs only one release", () => {
    const owner = Symbol("resume:3f2a9c1e");
    setUnsavedWork(owner, true);
    setUnsavedWork(owner, true);
    setUnsavedWork(owner, false);
    expect(hasUnsavedWork()).toBe(false);
  });

  it("asks the browser to confirm leaving only while something is unsaved", () => {
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
    const owner = Symbol("studio:6b1f9a52");
    setUnsavedWork(owner, true);
    expect(fireBeforeUnload().defaultPrevented).toBe(true);
    setUnsavedWork(owner, false);
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it("releaseAllUnsavedWork lets a reload the user chose go through", () => {
    setUnsavedWork(Symbol("a"), true);
    setUnsavedWork(Symbol("b"), true);
    releaseAllUnsavedWork();
    expect(hasUnsavedWork()).toBe(false);
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it("useRegisterUnsavedWork follows its flag and releases on unmount", () => {
    const view = renderHook(({ dirty }: { dirty: boolean }) => useRegisterUnsavedWork(dirty), {
      initialProps: { dirty: false },
    });
    expect(hasUnsavedWork()).toBe(false);
    view.rerender({ dirty: true });
    expect(hasUnsavedWork()).toBe(true);
    view.unmount();
    expect(hasUnsavedWork()).toBe(false);
  });
});
