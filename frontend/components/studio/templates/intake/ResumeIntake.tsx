// Intake form for the "Video Resume" template — wraps PromptEditor.
// Kept as a thin component so the catalog can route to the same prop shape
// as every other intake form (state + onStateChange + validationFlash).

import { useState } from "react";
import PromptEditor from "@/components/PromptEditor";
import type { IntakeProps } from "@/lib/studio/templates/catalog";

export default function ResumeIntake({ state, onStateChange, validationFlash, onLinkSubject }: IntakeProps) {
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
