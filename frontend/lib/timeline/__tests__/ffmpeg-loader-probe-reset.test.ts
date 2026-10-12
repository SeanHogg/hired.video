/**
 * ffmpeg loader × encoder probe: a probe that times out leaves the core in
 * unknown health, so the loader terminates that instance and exports on a
 * fresh one; a probe that answers keeps the first instance.
 *
 * Run: vitest run lib/timeline/__tests__/ffmpeg-loader-probe-reset.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ outcome: "probed" as "probed" | "unknown" | "timeout" }));
const instances = vi.hoisted(() => [] as Array<{ load: (...args: never[]) => unknown; terminate: (...args: never[]) => unknown }>);

vi.mock("@ffmpeg/ffmpeg", () => {
  class FFmpeg {
    load = vi.fn(async () => true);
    terminate = vi.fn();
    exec = vi.fn(async () => 0);
    on = vi.fn();
    off = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  return { FFmpeg, FFFSType: { WORKERFS: "WORKERFS" } };
});
vi.mock("@ffmpeg/util", () => ({ toBlobURL: vi.fn(async (url: string) => `blob:${url}`) }));
vi.mock("../ffmpeg/encoder-probe", () => ({ probeEncoders: vi.fn(async () => probe.outcome) }));

import { loadFfmpeg } from "../ffmpeg/ffmpeg-loader";

beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal("crossOriginIsolated", true);
  vi.stubGlobal("SharedArrayBuffer", globalThis.SharedArrayBuffer ?? class {});
});
afterEach(() => vi.unstubAllGlobals());

describe("loadFfmpeg after the encoder probe", () => {
  it("a probe timeout terminates that core and exports on a fresh one", async () => {
    probe.outcome = "timeout";
    const port = await loadFfmpeg();
    expect(instances).toHaveLength(2);
    expect(instances[0]?.terminate).toHaveBeenCalledTimes(1);
    expect(instances[1]?.load).toHaveBeenCalledTimes(1);
    expect(instances[1]?.terminate).not.toHaveBeenCalled();
    // The port drives the fresh instance.
    port.terminate();
    expect(instances[1]?.terminate).toHaveBeenCalledTimes(1);
  });

  it("a probe that answers (or is merely unknown) keeps the first core", async () => {
    for (const outcome of ["probed", "unknown"] as const) {
      instances.length = 0;
      probe.outcome = outcome;
      await loadFfmpeg();
      expect(instances).toHaveLength(1);
      expect(instances[0]?.terminate).not.toHaveBeenCalled();
    }
  });
});
