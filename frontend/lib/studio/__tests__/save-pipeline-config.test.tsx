/**
 * Save-pipeline-config regression tests.
 *
 * Default = all steps on (Save = persist + generate + render + upload).
 * Toggling persists to localStorage so a user's "save edits only" mode
 * survives reloads. The hook is the single source of truth shared between
 * SaveButton (renders the toggles + the "Save*" label) and StudioLayout
 * (skips disabled steps inside handleSavePipeline) — divergence between
 * the two would mean the user clicks Save expecting one thing and the
 * pipeline does another, so these tests pin the contract.
 *
 * Run: vitest run lib/studio/__tests__/save-pipeline-config.test.tsx
 */

import { describe, it, expect, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { useSavePipelineConfig } from "@/lib/studio/save-pipeline-config";
import type { UseSavePipelineConfig } from "@/lib/studio/save-pipeline-config";

beforeEach(() => {
  localStorage.clear();
});

// Test harness — exposes the hook value via a mutable ref so tests can
// drive toggles and read state without rendering a real consumer.
function harness(): { current: () => UseSavePipelineConfig } {
  let latest: UseSavePipelineConfig | null = null;
  function Probe() {
    latest = useSavePipelineConfig();
    return null;
  }
  render(<Probe />);
  return {
    current: () => {
      if (!latest) throw new Error("hook not yet rendered");
      return latest;
    },
  };
}

describe("useSavePipelineConfig", () => {
  it("defaults to all three steps enabled and customized=false", () => {
    const h = harness();
    const c = h.current();
    expect(c.enabled.has("generate")).toBe(true);
    expect(c.enabled.has("render")).toBe(true);
    expect(c.enabled.has("upload")).toBe(true);
    expect(c.customized).toBe(false);
  });

  it("toggle removes a step and flips customized to true", () => {
    const h = harness();
    act(() => h.current().toggle("render"));
    const c = h.current();
    expect(c.enabled.has("render")).toBe(false);
    expect(c.enabled.has("generate")).toBe(true);
    expect(c.customized).toBe(true);
  });

  it("toggling the same step twice is a round-trip (back to enabled)", () => {
    const h = harness();
    act(() => h.current().toggle("upload"));
    expect(h.current().enabled.has("upload")).toBe(false);
    act(() => h.current().toggle("upload"));
    expect(h.current().enabled.has("upload")).toBe(true);
    expect(h.current().customized).toBe(false);
  });

  it("reset() restores all defaults", () => {
    const h = harness();
    act(() => h.current().toggle("generate"));
    act(() => h.current().toggle("render"));
    expect(h.current().enabled.size).toBe(1);
    act(() => h.current().reset());
    expect(h.current().enabled.size).toBe(3);
    expect(h.current().customized).toBe(false);
  });

  it("persists toggles to localStorage so a reload preserves them", () => {
    const h1 = harness();
    act(() => h1.current().toggle("upload"));
    // Reload — fresh hook instance reads from localStorage on init.
    const h2 = harness();
    expect(h2.current().enabled.has("upload")).toBe(false);
    expect(h2.current().customized).toBe(true);
  });

  it("ignores garbage in localStorage and falls back to defaults", () => {
    localStorage.setItem("studio_save_pipeline_config", "{not json");
    const h = harness();
    expect(h.current().enabled.size).toBe(3);
    expect(h.current().customized).toBe(false);
  });
});
