/**
 * PitchSection — the profile's current video pitch (#2133) on /people/:id.
 * Rides the existing "videoResume" profile-section visibility toggle (the
 * owner's "show my videos" choice), then defers to the shared <PitchCard>,
 * which self-gates when there is no pitch.
 */

import type { PitchSummary } from "@shared/pitch";
import { PitchCard } from "@/components/pitch/PitchPlayer";
import { useProfileSectionVisibility } from "./profile-sections-context";

export default function PitchSection({ pitch }: { pitch: PitchSummary | null }) {
  const visible = useProfileSectionVisibility("videoResume");
  if (!visible) return null;
  return <PitchCard pitch={pitch} />;
}
