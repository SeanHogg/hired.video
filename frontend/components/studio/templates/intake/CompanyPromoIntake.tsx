// Intake for "Promote your company" — same prompt editor as the other
// company-flavored templates. The wizard's pick-company picker imports
// the user's own company into resumeText before this intake mounts.

import { useState } from "react";
import PromptEditor from "@/components/PromptEditor";
import type { IntakeProps } from "@/lib/studio/templates/catalog";

export default function CompanyPromoIntake({ state, onStateChange, validationFlash, onLinkSubject }: IntakeProps) {
  // PromptEditor requires the JD toggle pair. CompanyPromoIntake doesn't
  // use a separate job description, so the toggle is owned locally and
  // simply hidden — matches the pattern in ResumeIntake.
  const [showJD, setShowJD] = useState(false);
  return (
    <PromptEditor
      state={state}
      onStateChange={onStateChange}
      showJD={showJD}
      onToggleJD={() => setShowJD((v) => !v)}
      validationFlash={validationFlash}
      onLinkSubject={onLinkSubject}
    />
  );
}
