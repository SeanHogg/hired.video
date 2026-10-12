/**
 * The video page's ONE clipboard (useStripClipboard): which keystrokes it
 * takes, that the canvas region reaches it too while `active`, and that a
 * copy from the frame pastes from the strip (the same memory).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { VideoPlan } from "@shared/video-plan";
import { defaultWidget, emptyCanvasState, emptyScene, type CanvasState, type Widget } from "@/lib/studio/editor-v2/canvas-state";
import { clipboardKey, meantForCanvas, useStripClipboard } from "@/lib/build/use-strip-clipboard";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}, target: EventTarget | null = null) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  target,
  ...mods,
});

describe("clipboardKey", () => {
  it("takes Ctrl/⌘ + C · X · V · D only", () => {
    expect(clipboardKey(key("c", { ctrlKey: true }))).toBe("c");
    expect(clipboardKey(key("X", { metaKey: true }))).toBe("x");
    expect(clipboardKey(key("v", { ctrlKey: true }))).toBe("v");
    expect(clipboardKey(key("d", { metaKey: true }))).toBe("d");
    expect(clipboardKey(key("z", { ctrlKey: true }))).toBeNull();
    expect(clipboardKey(key("c"))).toBeNull();
  });

  it("leaves Alt / Shift chords and typing alone", () => {
    expect(clipboardKey(key("c", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(clipboardKey(key("c", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(clipboardKey(key("c", { ctrlKey: true }, document.createElement("input")))).toBeNull();
  });
});

describe("meantForCanvas", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is true inside the canvas region or with nothing focused, false elsewhere", () => {
    document.body.innerHTML = '<div data-region="canvas"><button id="in"></button></div><div data-region="slot"><button id="out"></button></div>';
    expect(meantForCanvas(document.getElementById("in"))).toBe(true);
    expect(meantForCanvas(document.body)).toBe(true);
    expect(meantForCanvas(null)).toBe(true);
    expect(meantForCanvas(document.getElementById("out"))).toBe(false);
  });
});

describe("useStripClipboard", () => {
  const widget: Widget = { ...defaultWidget("text"), id: "w1" };
  const scene = { ...emptyScene("Hook"), id: "scene-hook", widgets: [widget] };
  const canvas: CanvasState = { ...emptyCanvasState(), scenes: [scene] };
  const plan = {} as VideoPlan;

  it("copies from the frame (canvas keys) and pastes from the strip — one memory", () => {
    document.body.innerHTML = '<div data-region="canvas"><button id="frame"></button></div>';
    const pasteWidget = vi.fn();
    const { result } = renderHook(() =>
      useStripClipboard({
        plan,
        canvas,
        selection: { kind: "widget", sceneId: scene.id, widgetId: widget.id },
        scene: "hook",
        updatePlan: vi.fn(),
        onSelectScene: vi.fn(),
        pasteWidget,
        removeWidget: vi.fn(),
        active: true,
      }),
    );
    expect(result.current.canPaste).toBe(false);
    const frame = document.getElementById("frame") as HTMLElement;
    act(() => {
      frame.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
    });
    expect(result.current.canPaste).toBe(true);
    act(() => {
      result.current.paste();
    });
    expect(pasteWidget).toHaveBeenCalledWith(expect.objectContaining({ id: widget.id }));
    document.body.innerHTML = "";
  });

  it("ignores the canvas keys while inactive (Simple)", () => {
    document.body.innerHTML = '<div data-region="canvas"><button id="frame"></button></div>';
    const { result } = renderHook(() =>
      useStripClipboard({
        plan,
        canvas,
        selection: { kind: "widget", sceneId: scene.id, widgetId: widget.id },
        scene: "hook",
        updatePlan: vi.fn(),
        onSelectScene: vi.fn(),
        pasteWidget: vi.fn(),
        removeWidget: vi.fn(),
      }),
    );
    act(() => {
      document.getElementById("frame")?.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
    });
    expect(result.current.canPaste).toBe(false);
    document.body.innerHTML = "";
  });
});
