/**
 * Save-pipeline-config regression tests.
 *
 * Source of truth = `script._meta.savePipelineDisabled` on the project.
 * Toggles travel WITH the project across devices/collaborators — they
 * used to live in localStorage which broke the moment the user opened
 * the project on another machine. The localStorage path remains as a
 * pre-script fallback only (toggling before the very first Run).
 *
 * The most important regression here is the prior bug: SaveButton's
 * toggle wasn't reaching StudioLayout's pipeline because each consumer
 * had its own useState. Now both sides read from the same script (or
 * the same fallback store) so toggling propagates synchronously.
 *
 * Run: vitest run lib/studio/__tests__/save-pipeline-config.test.tsx
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { useState } from "react";
import {
  useSavePipelineConfig,
  readSavePipelineConfig,
  withSavePipelineDisabled,
  getEffectiveSavePipelineConfig,
  __resetFallbackStore,
  type UseSavePipelineConfig,
} from "@/lib/studio/save-pipeline-config";
import type { VideoScript } from "@/types/video-script";

beforeEach(() => {
  localStorage.clear();
  __resetFallbackStore();
});

function makeScript(disabled?: ("generate" | "render" | "upload")[]): VideoScript {
  return {
    video: {
      duration: 6, fps: 30, resolution: "720p", aspect: "16:9",
      theme: { colorPalette: ["#000"], fontFamily: "Inter", motion: "moderate", transition: "fade", background: "gradient" },
    },
    scenes: [{ id: "s", start: 0, duration: 6, type: "intro" }],
    _meta: disabled ? { savePipelineDisabled: disabled } : undefined,
  };
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

describe("readSavePipelineConfig", () => {
  it("returns all-enabled when no script and no _meta", () => {
    expect(readSavePipelineConfig(null).enabled.size).toBe(3);
    expect(readSavePipelineConfig(null).customized).toBe(false);
    expect(readSavePipelineConfig(makeScript()).customized).toBe(false);
  });

  it("excludes disabled steps from enabled", () => {
    const c = readSavePipelineConfig(makeScript(["generate"]));
    expect(c.enabled.has("generate")).toBe(false);
    expect(c.enabled.has("render")).toBe(true);
    expect(c.customized).toBe(true);
  });
});

describe("withSavePipelineDisabled", () => {
  it("writes the disabled list onto _meta without losing other meta fields", () => {
    const script: VideoScript = {
      ...makeScript(),
      _meta: { model: "qwen/qwen3.6-plus:free" },
    };
    // Second arg = disabled set. Helper preserves stable ALL_STEPS ordering.
    const next = withSavePipelineDisabled(script, new Set(["render", "upload"]));
    expect(next._meta?.savePipelineDisabled).toEqual(["render", "upload"]);
    expect(next._meta?.model).toBe("qwen/qwen3.6-plus:free");
  });

  it("returns a new script (no in-place mutation)", () => {
    const script = makeScript();
    const next = withSavePipelineDisabled(script, new Set(["generate"]));
    expect(next).not.toBe(script);
    expect(script._meta?.savePipelineDisabled).toBeUndefined();
  });
});

// ─── Hook — script-backed path (the path users hit 99% of the time) ─────────

interface ProbeRef {
  current: () => UseSavePipelineConfig;
  script: () => VideoScript | null;
}

/**
 * Test harness that wires the hook to a real-world StudioLayout-style host:
 * `script` lives in component state, toggles call `onScriptChange` which
 * updates that state, and the next render reads the updated script.
 */
function harness(initial: VideoScript | null): ProbeRef {
  let latest: UseSavePipelineConfig | null = null;
  let scriptRef: VideoScript | null = initial;
  function Probe() {
    const [script, setScript] = useState<VideoScript | null>(initial);
    scriptRef = script;
    latest = useSavePipelineConfig({ script, onScriptChange: setScript });
    return null;
  }
  render(<Probe />);
  return {
    current: () => {
      if (!latest) throw new Error("hook not yet rendered");
      return latest;
    },
    script: () => scriptRef,
  };
}

describe("useSavePipelineConfig (script-backed)", () => {
  it("defaults to all-enabled and customized=false on a fresh script", () => {
    const h = harness(makeScript());
    expect(h.current().enabled.size).toBe(3);
    expect(h.current().customized).toBe(false);
  });

  it("toggle writes back into script._meta.savePipelineDisabled (project travels with the toggle)", () => {
    const h = harness(makeScript());
    act(() => h.current().toggle("generate"));
    expect(h.script()?._meta?.savePipelineDisabled).toEqual(["generate"]);
    expect(h.current().enabled.has("generate")).toBe(false);
    expect(h.current().customized).toBe(true);
  });

  it("toggling round-trips back to enabled and clears the disabled list", () => {
    const h = harness(makeScript());
    act(() => h.current().toggle("upload"));
    expect(h.script()?._meta?.savePipelineDisabled).toEqual(["upload"]);
    act(() => h.current().toggle("upload"));
    expect(h.script()?._meta?.savePipelineDisabled).toEqual([]);
    expect(h.current().enabled.has("upload")).toBe(true);
  });

  it("reset() empties the disabled list", () => {
    const h = harness(makeScript(["generate", "render"]));
    act(() => h.current().reset());
    expect(h.script()?._meta?.savePipelineDisabled).toEqual([]);
  });

  it("REGRESSION: getEffectiveSavePipelineConfig sees the toggle SYNCHRONOUSLY (no per-component split)", () => {
    // Before the refactor, SaveButton's toggle wrote to its own useState
    // and StudioLayout's pipeline read a different one — the user turned
    // off "Re-generate script" and the next Save still ran the generator.
    // Reading from the script directly closes that gap.
    const h = harness(makeScript());
    act(() => h.current().toggle("generate"));
    const effective = getEffectiveSavePipelineConfig(h.script());
    expect(effective.enabled.has("generate")).toBe(false);
  });
});

// ─── Hook — pre-script fallback path ────────────────────────────────────────

describe("useSavePipelineConfig (pre-script fallback)", () => {
  it("toggles update the in-memory fallback store and propagate to other consumers", () => {
    const a = harness(null);
    const b = harness(null);
    act(() => a.current().toggle("render"));
    expect(a.current().enabled.has("render")).toBe(false);
    expect(b.current().enabled.has("render")).toBe(false);
  });

  it("getEffectiveSavePipelineConfig reads the fallback when no script is present", () => {
    const a = harness(null);
    act(() => a.current().toggle("render"));
    const effective = getEffectiveSavePipelineConfig(null);
    expect(effective.enabled.has("render")).toBe(false);
  });
});
