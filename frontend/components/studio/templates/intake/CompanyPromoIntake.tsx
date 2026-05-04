// Intake for "Promote your company" — same prompt editor as the other
// company-flavored templates. The wizard's pick-company picker imports
// the user's own company into resumeText before this intake mounts.

import PromptEditor from "@/components/PromptEditor";
import type { IntakeProps } from "../catalog";

export default function CompanyPromoIntake({ state, onStateChange, validationFlash, onLinkSubject }: IntakeProps) {
  return (
    <PromptEditor
      state={state}
      onStateChange={onStateChange}
      validationFlash={validationFlash}
      onLinkSubject={onLinkSubject}
    />
  );
}
