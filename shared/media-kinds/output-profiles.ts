import type { MediaKind } from "./kinds.js";
import type { OutputProfile } from "./output-profile-types.js";
import { TIMELINE_KIND_OUTPUT_PROFILES } from "./output-profiles-timeline.js";
import { RUNTIME_KIND_OUTPUT_PROFILES } from "./output-profiles-runtime.js";

/** Every registered export profile, grouped by mediaKind in declaration order. */
export const OUTPUT_PROFILES: OutputProfile[] = [
  ...TIMELINE_KIND_OUTPUT_PROFILES,
  ...RUNTIME_KIND_OUTPUT_PROFILES,
];

/** Every profile registered for a given mediaKind, in declaration order. */
export function outputProfilesFor(kind: MediaKind): OutputProfile[] {
  return OUTPUT_PROFILES.filter((p) => p.mediaKind === kind);
}

/** The default profile every kind ships with — used when the user hasn't
 *  picked one explicitly. First entry per kind, by convention. */
export function defaultOutputProfile(kind: MediaKind): OutputProfile {
  const first = OUTPUT_PROFILES.find((p) => p.mediaKind === kind);
  if (!first) {
    throw new Error(`No output profiles registered for mediaKind=${kind}`);
  }
  return first;
}
