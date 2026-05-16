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
 * Scope split (2026-05): Save now only touches `generate`. Render +
 * Upload moved behind the Publish-to-* verbs; see the second describe
 * block (`describeRunPlanForPublish`) for the freshness gate that
 * decides whether each Publish click renders or re-uses the existing
 * baked MP4.
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
  describeRunPlan,
  effectiveStepsForSave,
  describeRunPlanForPublish,
  effectiveStepsForPublish,
  __resetFallbackStore,
  type UseSavePipelineConfig,
} from "@/lib/studio/save-pipeline-config";
import { computeScriptHash, withBakedHash } from "@/lib/studio/baked-freshness";
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
  it("returns all-Save-steps enabled when no script and no _meta", () => {
    // Save's scope is just `generate` now — `render` / `upload` belong
    // to the Publish plan and aren't surfaced as Save toggles.
    expect(readSavePipelineConfig(null).enabled.has("generate")).toBe(true);
    expect(readSavePipelineConfig(null).enabled.has("render")).toBe(false);
    expect(readSavePipelineConfig(null).customized).toBe(false);
    expect(readSavePipelineConfig(makeScript()).customized).toBe(false);
  });

  it("excludes disabled steps from enabled", () => {
    const c = readSavePipelineConfig(makeScript(["generate"]));
    expect(c.enabled.has("generate")).toBe(false);
    expect(c.customized).toBe(true);
  });

  it("legacy projects with disabled render/upload don't mark Save as customised", () => {
    // Pre-2026-05 projects could disable render/upload from the Save
    // dropdown. After the split those steps no longer belong to Save,
    // so their presence in the legacy list shouldn't show "Save customised".
    const c = readSavePipelineConfig(makeScript(["render", "upload"]));
    expect(c.customized).toBe(false);
  });
});

describe("withSavePipelineDisabled", () => {
  it("writes the disabled list onto _meta without losing other meta fields", () => {
    const script: VideoScript = {
      ...makeScript(),
      _meta: { model: "qwen/qwen3.6-plus:free" },
    };
    // Only Save-scope steps are persisted; render/upload are dropped
    // because they aren't Save toggles anymore.
    const next = withSavePipelineDisabled(script, new Set(["generate", "render", "upload"]));
    expect(next._meta?.savePipelineDisabled).toEqual(["generate"]);
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
  it("defaults to all-Save-steps enabled and customized=false on a fresh script", () => {
    const h = harness(makeScript());
    expect(h.current().enabled.has("generate")).toBe(true);
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
    act(() => h.current().toggle("generate"));
    expect(h.script()?._meta?.savePipelineDisabled).toEqual(["generate"]);
    act(() => h.current().toggle("generate"));
    expect(h.script()?._meta?.savePipelineDisabled).toEqual([]);
    expect(h.current().enabled.has("generate")).toBe(true);
  });

  it("reset() empties the disabled list", () => {
    const h = harness(makeScript(["generate"]));
    act(() => h.current().reset());
    expect(h.script()?._meta?.savePipelineDisabled).toEqual([]);
  });

  it("REGRESSION: getEffectiveSavePipelineConfig sees the toggle SYNCHRONOUSLY (no per-component split)", () => {
    const h = harness(makeScript());
    act(() => h.current().toggle("generate"));
    const effective = getEffectiveSavePipelineConfig(h.script());
    expect(effective.enabled.has("generate")).toBe(false);
  });
});

// ─── Save plan — generate only ─────────────────────────────────────────────

describe("describeRunPlan + effectiveStepsForSave (Save scope)", () => {
  it("default config: generate runs", () => {
    const config = readSavePipelineConfig(makeScript());
    const plan = describeRunPlan(config);
    expect(plan.length).toBe(1);
    expect(plan[0].id).toBe("generate");
    expect(plan[0].willRun).toBe(true);
    expect(effectiveStepsForSave(config)).toEqual(new Set(["generate"]));
  });

  it("hasScript context auto-skips generate", () => {
    const config = readSavePipelineConfig(makeScript());
    const plan = describeRunPlan(config, { hasScript: true });
    expect(plan[0].autoSkipped).toBe(true);
    expect(plan[0].willRun).toBe(false);
    expect(effectiveStepsForSave(config, { hasScript: true })).toEqual(new Set());
  });

  it("generate disabled: nothing runs", () => {
    const config = readSavePipelineConfig(makeScript(["generate"]));
    expect(effectiveStepsForSave(config)).toEqual(new Set());
  });
});

// ─── Publish plan — freshness gate ─────────────────────────────────────────

describe("describeRunPlanForPublish + effectiveStepsForPublish (freshness)", () => {
  it("no videoUrl: both render + upload will run", () => {
    const plan = describeRunPlanForPublish({
      state: { script: makeScript(), videoUrl: null, voiceover: null, captions: null },
    });
    expect(plan.map((p) => p.id)).toEqual(["render", "upload"]);
    expect(plan.every((p) => p.willRun)).toBe(true);
  });

  it("fresh bakedHash: both steps auto-skipped — Publish is instant", () => {
    const base = makeScript();
    const hash = computeScriptHash({ script: base, voiceover: null, captions: null });
    const stamped = withBakedHash(base, hash);
    const plan = describeRunPlanForPublish({
      state: { script: stamped, videoUrl: "https://cdn/x.mp4", voiceover: null, captions: null },
    });
    expect(plan.every((p) => !p.willRun)).toBe(true);
    expect(effectiveStepsForPublish({
      state: { script: stamped, videoUrl: "https://cdn/x.mp4", voiceover: null, captions: null },
    })).toEqual(new Set());
  });

  it("stale bakedHash: render + upload re-run", () => {
    const base = makeScript();
    const oldHash = computeScriptHash({ script: base, voiceover: null, captions: null });
    const stamped = withBakedHash(base, oldHash);
    // Mutate the script content to invalidate the hash.
    const mutated: VideoScript = {
      ...stamped,
      scenes: [...stamped.scenes, { id: "s2", start: 6, duration: 4, type: "closing" }],
    };
    const ctx = {
      state: { script: mutated, videoUrl: "https://cdn/x.mp4", voiceover: null, captions: null },
    };
    expect(effectiveStepsForPublish(ctx)).toEqual(new Set(["render", "upload"]));
  });
});

describe("useSavePipelineConfig (pre-script fallback)", () => {
  it("toggles update the in-memory fallback store and propagate to other consumers", () => {
    const a = harness(null);
    const b = harness(null);
    act(() => a.current().toggle("generate"));
    expect(a.current().enabled.has("generate")).toBe(false);
    expect(b.current().enabled.has("generate")).toBe(false);
  });

  it("getEffectiveSavePipelineConfig reads the fallback when no script is present", () => {
    const a = harness(null);
    act(() => a.current().toggle("generate"));
    const effective = getEffectiveSavePipelineConfig(null);
    expect(effective.enabled.has("generate")).toBe(false);
  });
});
