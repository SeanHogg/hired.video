/**
 * gain-envelope — the ONE gain + fade envelope the live preview
 * (clip-scheduler) and the export mixer (timeline audio-mixer) schedule
 * (#476). Asserted against a fake AudioParam that records every call, so
 * the breakpoints both surfaces send to Web Audio are pinned exactly.
 *
 * Run: vitest run lib/audio/__tests__/gain-envelope.test.ts
 */
import { describe, expect, it } from "vitest";
import { envelopeGainAt, scheduleGainEnvelope, type GainEnvelope } from "@/lib/audio/gain-envelope";

type ParamCall = ["set" | "ramp", number, number];

function fakeParam() {
  const calls: ParamCall[] = [];
  const param = {
    value: -1,
    setValueAtTime(v: number, t: number) {
      calls.push(["set", v, t]);
      return param;
    },
    linearRampToValueAtTime(v: number, t: number) {
      calls.push(["ramp", v, t]);
      return param;
    },
  };
  return { param: param as unknown as AudioParam, calls, raw: param };
}

const close = (calls: ParamCall[]) => calls.map(([op, v, t]) => [op, +v.toFixed(6), +t.toFixed(6)]);

// A music bed shaped like canvasStateToAudioClips output: 12 s, gain 0.8
// (layer × lane × master), 2 s fade in, 3 s fade out.
const bed: GainEnvelope = { gain: 0.8, durationSec: 12, fadeInSec: 2, fadeOutSec: 3 };

describe("envelopeGainAt", () => {
  it("ramps in, holds, ramps out", () => {
    expect(envelopeGainAt(bed, 0)).toBe(0);
    expect(envelopeGainAt(bed, 1)).toBeCloseTo(0.4);
    expect(envelopeGainAt(bed, 2)).toBeCloseTo(0.8);
    expect(envelopeGainAt(bed, 6)).toBeCloseTo(0.8);
    expect(envelopeGainAt(bed, 10.5)).toBeCloseTo(0.4);
    expect(envelopeGainAt(bed, 12)).toBe(0);
  });

  it("clamps time outside the clip and negative gain", () => {
    expect(envelopeGainAt(bed, -5)).toBe(0);
    expect(envelopeGainAt(bed, 99)).toBe(0);
    expect(envelopeGainAt({ ...bed, gain: -2 }, 6)).toBe(0);
  });

  it("ignores invalid fades and clamps fades longer than the clip", () => {
    expect(envelopeGainAt({ gain: 1, durationSec: 4, fadeInSec: NaN, fadeOutSec: -1 }, 0)).toBe(1);
    // A 10 s fade-in on a 4 s clip is clamped to 4 s.
    expect(envelopeGainAt({ gain: 1, durationSec: 4, fadeInSec: 10 }, 2)).toBeCloseTo(0.5);
  });

  it("overlapping fades peak where the ramps cross", () => {
    const short: GainEnvelope = { gain: 1, durationSec: 2, fadeInSec: 2, fadeOutSec: 2 };
    expect(envelopeGainAt(short, 1)).toBeCloseTo(0.5);
    expect(envelopeGainAt(short, 0.5)).toBeCloseTo(0.25);
  });
});

describe("scheduleGainEnvelope", () => {
  it("schedules a full play from the clip start", () => {
    const { param, calls, raw } = fakeParam();
    scheduleGainEnvelope(param, bed, 10);
    expect(raw.value).toBe(0);
    expect(close(calls)).toEqual([
      ["set", 0, 10],
      ["ramp", 0.8, 12], // fade-in end
      ["ramp", 0.8, 19], // fade-out start (12 − 3)
      ["ramp", 0, 22], // clip end
    ]);
  });

  it("starts mid-fade after a seek: value at the seek point, past breakpoints skipped", () => {
    const { param, calls, raw } = fakeParam();
    // Playback resumes 1 s into the clip; clip-local 0 sits at ctx time 4.
    scheduleGainEnvelope(param, bed, 4, 1);
    expect(raw.value).toBeCloseTo(0.4);
    expect(close(calls)).toEqual([
      ["set", 0.4, 5],
      ["ramp", 0.8, 6],
      ["ramp", 0.8, 13],
      ["ramp", 0, 16],
    ]);
  });

  it("starting inside the fade-out only ramps to the end", () => {
    const { param, calls } = fakeParam();
    scheduleGainEnvelope(param, bed, 0, 10.5);
    expect(close(calls)).toEqual([
      ["set", 0.4, 10.5],
      ["ramp", 0, 12],
    ]);
  });

  it("no fades = one set at the gain, no ramps", () => {
    const { param, calls, raw } = fakeParam();
    scheduleGainEnvelope(param, { gain: 0.6, durationSec: 5 }, 2);
    expect(raw.value).toBeCloseTo(0.6);
    expect(close(calls)).toEqual([["set", 0.6, 2]]);
  });

  it("overlapping fades add the crossing breakpoint", () => {
    const { param, calls } = fakeParam();
    scheduleGainEnvelope(param, { gain: 1, durationSec: 3, fadeInSec: 2, fadeOutSec: 2 }, 0);
    // Crossing at 2·3/(2+2) = 1.5 s, gain 0.75; fade-out start (1 s) is
    // below the fade-in end and gets the lower ramp's value.
    expect(close(calls)).toEqual([
      ["set", 0, 0],
      ["ramp", 0.5, 1],
      ["ramp", 0.75, 1.5],
      ["ramp", 0.5, 2],
      ["ramp", 0, 3],
    ]);
  });

  it("never schedules at a negative context time", () => {
    const { param, calls } = fakeParam();
    // Clip started 5 s before the context's zero (seek far into the clip).
    scheduleGainEnvelope(param, bed, -5, 0);
    expect(calls.every(([, , t]) => t >= 0)).toBe(true);
  });

  it("clamps a seek past the clip end to silence", () => {
    const { param, calls, raw } = fakeParam();
    scheduleGainEnvelope(param, bed, 0, 50);
    expect(raw.value).toBe(0);
    expect(close(calls)).toEqual([["set", 0, 12]]);
  });
});
