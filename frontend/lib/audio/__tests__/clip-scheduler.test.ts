/**
 * clip-scheduler — the live preview's music/voiceover scheduler (#479).
 * Pins `start` / `restartFrom` / `position` against a fake AudioContext
 * whose clock the test advances: which sources start, at what context
 * time, at which source offset, for how long, and with which gain.
 *
 * Run: vitest run lib/audio/__tests__/clip-scheduler.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareClipSchedule } from "@/lib/audio/clip-scheduler";
import type { AudioClip } from "@/types/video-script";

const MUSIC = "https://cdn.hired.video/music/corporate-inspire.mp3";
const VOICE = "https://cdn.hired.video/voiceovers/scene-2.webm";
const BROKEN = "https://cdn.hired.video/voiceovers/missing.webm";

interface FakeSource {
  buffer: { url: string; duration: number } | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function fakeContext(durations: Record<string, number>) {
  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  const ctx = {
    currentTime: 100,
    createGain(): FakeGain {
      const g: FakeGain = {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(g);
      return g;
    },
    createBufferSource(): FakeSource {
      const s: FakeSource = { buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
      sources.push(s);
      return s;
    },
    async decodeAudioData(arr: { url: string }) {
      return { url: arr.url, duration: durations[arr.url] };
    },
  };
  return { ctx, sources, gains, audio: ctx as unknown as AudioContext };
}

// Shaped like canvasStateToAudioClips output: a trimmed music bed under a
// voiceover line.
const music: AudioClip = { id: "m1", track: MUSIC, label: "Music", startSec: 0, endSec: 10, volume: 0.5, fadeInSec: 2, trimStartSec: 1 };
const voice: AudioClip = { id: "v1", track: VOICE, label: "Voiceover", startSec: 4, endSec: 6, volume: 1 };

/** [url, when, offset, duration] of every source started. */
function starts(sources: FakeSource[]) {
  return sources
    .filter((s) => s.start.mock.calls.length > 0)
    .map((s) => {
      const [when, offset, dur] = s.start.mock.calls[0] as [number, number, number];
      return [s.buffer?.url, +when.toFixed(6), +offset.toFixed(6), +dur.toFixed(6)];
    });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === BROKEN) throw new Error("404");
      return { arrayBuffer: async () => ({ url }) };
    }),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareClipSchedule", () => {
  it("starts every clip at its timeline offset, honouring trims", async () => {
    const { audio, sources } = fakeContext({ [MUSIC]: 30, [VOICE]: 2 });
    const prepared = await prepareClipSchedule([music, voice], audio);
    prepared.start({} as AudioNode, 0);
    expect(starts(sources)).toEqual([
      [MUSIC, 100, 1, 10],
      [VOICE, 104, 0, 2],
    ]);
  });

  it("position() advances with the context clock", async () => {
    const { ctx, audio } = fakeContext({ [MUSIC]: 30, [VOICE]: 2 });
    const handle = (await prepareClipSchedule([music, voice], audio)).start({} as AudioNode, 2);
    expect(handle.position()).toBeCloseTo(2);
    ctx.currentTime = 103.5;
    expect(handle.position()).toBeCloseTo(5.5);
  });

  it("restartFrom re-anchors at the seek point without re-fetching", async () => {
    const { ctx, audio, sources } = fakeContext({ [MUSIC]: 30, [VOICE]: 2 });
    const handle = (await prepareClipSchedule([music, voice], audio)).start({} as AudioNode, 0);
    const firstRun = sources.slice();
    ctx.currentTime = 103;
    handle.restartFrom(5);

    // The old sources are stopped and disconnected.
    for (const s of firstRun) {
      expect(s.stop).toHaveBeenCalled();
      expect(s.disconnect).toHaveBeenCalled();
    }
    // Fresh sources play from the new offset: music 5 s in (+1 s trim),
    // voiceover 1 s into its 2 s line, both starting now.
    expect(starts(sources.slice(firstRun.length))).toEqual([
      [MUSIC, 103, 6, 5],
      [VOICE, 103, 1, 1],
    ]);
    expect(handle.position()).toBeCloseTo(5);
    ctx.currentTime = 105;
    expect(handle.position()).toBeCloseTo(7);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips clips that already ended and caps to the decoded length", async () => {
    // The music file is shorter than the clip window: 8 s of audio, trim 1.
    const { audio, sources } = fakeContext({ [MUSIC]: 8, [VOICE]: 2 });
    const handle = (await prepareClipSchedule([music, voice], audio)).start({} as AudioNode, 0);
    handle.restartFrom(7);
    const second = starts(sources.slice(2));
    // Voiceover (4–6 s) is over; music has 8 − (1 + 7) = 0 s left → skipped.
    expect(second).toEqual([]);
    expect(starts(sources.slice(0, 2))[0]).toEqual([MUSIC, 100, 1, 7]);
  });

  it("applies the shared gain envelope from the seek point", async () => {
    const { audio, gains } = fakeContext({ [MUSIC]: 30, [VOICE]: 2 });
    (await prepareClipSchedule([music], audio)).start({} as AudioNode, 1);
    // 1 s into a 2 s fade-in at volume 0.5 → 0.25 now, 0.5 at the fade end.
    const param = gains[0].gain;
    expect(param.setValueAtTime).toHaveBeenCalledWith(0.25, 100);
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 101);
  });

  it("a clip whose audio fails to load is skipped; the rest still play", async () => {
    const { audio, sources } = fakeContext({ [MUSIC]: 30 });
    const broken: AudioClip = { ...voice, id: "v2", track: BROKEN };
    (await prepareClipSchedule([music, broken], audio)).start({} as AudioNode, 0);
    expect(starts(sources)).toEqual([[MUSIC, 100, 1, 10]]);
  });

  it("stop() silences everything", async () => {
    const { audio, sources } = fakeContext({ [MUSIC]: 30, [VOICE]: 2 });
    const handle = (await prepareClipSchedule([music, voice], audio)).start({} as AudioNode, 0);
    handle.stop();
    for (const s of sources) expect(s.stop).toHaveBeenCalled();
  });
});
