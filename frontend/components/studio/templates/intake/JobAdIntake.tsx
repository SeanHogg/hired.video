// Intake for "Job Ad" — same prompt editor with the JD toggle defaulted on,
// since job ad scripts are written against a job description.

import { useState } from "react";
import PromptEditor from "@/components/PromptEditor";
import type { IntakeProps } from "@/lib/studio/templates/catalog";

export default function JobAdIntake({ state, onStateChange, validationFlash, onLinkSubject }: IntakeProps) {
  const [showJD, setShowJD] = useState(true);
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
