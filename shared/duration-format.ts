/**
 * Duration formatting — the ONE pure implementation behind every
 * "seconds → text" display (frontend via `@/lib/format`, podcast RSS here).
 *
 * Each `style` reproduces one established on-screen format exactly; pick
 * the style rather than writing a local formatter.
 */

export type DurationUnit = "s" | "ms";

export type DurationStyle =
  /** `1h 5m` / `5m 3s` / `3s` — floored, negatives clamp to 0. */
  | "hms"
  /** `2m 5s` / `5s` — minutes uncapped, remainder seconds rounded. */
  | "minSec"
  /** `45s` under a minute, else `2m 05s` (zero-padded seconds). */
  | "minSecPadded"
  /** `45s` under a minute, else `2h 5m` / `5m` (seconds dropped). */
  | "hoursMin"
  /** `m:ss` — rounded to whole seconds, minutes uncapped. */
  | "clock"
  /** `mm:ss`, or `h:mm:ss` from one hour — rounded, negatives clamp to 0. */
  | "clockHms";

export interface DurationFormatOptions {
  /** Unit of the input value (default `"s"`). */
  unit?: DurationUnit;
  style: DurationStyle;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Whole minutes + rounded remainder seconds (the `minSec` split). Exposed
 *  for callers that localise the parts themselves. */
export function durationMinSecParts(sec: number): { minutes: number; seconds: number } {
  return { minutes: Math.floor(sec / 60), seconds: Math.round(sec % 60) };
}

export function formatDuration(value: number, options: DurationFormatOptions): string {
  const sec = options.unit === "ms" ? value / 1000 : value;
  switch (options.style) {
    case "hms": {
      const s = Math.max(0, Math.floor(sec || 0));
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) return `${h}h ${m % 60}m`;
      if (m > 0) return `${m}m ${s % 60}s`;
      return `${s}s`;
    }
    case "minSec": {
      const { minutes, seconds } = durationMinSecParts(sec);
      return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
    case "minSecPadded": {
      if (sec < 60) return `${sec}s`;
      return `${Math.floor(sec / 60)}m ${pad2(sec % 60)}s`;
    }
    case "hoursMin": {
      if (sec < 60) return `${sec}s`;
      const m = Math.floor(sec / 60);
      const h = Math.floor(m / 60);
      return h > 0 ? `${h}h ${m % 60}m` : `${m % 60}m`;
    }
    case "clock": {
      const total = Math.round(sec);
      return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
    }
    case "clockHms": {
      const total = Math.max(0, Math.round(sec));
      const hours = Math.floor(total / 3600);
      const mins = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      if (hours > 0) return `${hours}:${pad2(mins)}:${pad2(secs)}`;
      return `${pad2(mins)}:${pad2(secs)}`;
    }
  }
}
