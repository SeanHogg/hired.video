// Intake for "Personal Brand" — same controls as Resume; the difference is
// the persisted purpose and default prompt, which the catalog handles.

import ResumeIntake from "./ResumeIntake";
import type { IntakeProps } from "@/lib/studio/templates/catalog";

export default function PersonalBrandIntake(props: IntakeProps) {
  return <ResumeIntake {...props} />;
}
