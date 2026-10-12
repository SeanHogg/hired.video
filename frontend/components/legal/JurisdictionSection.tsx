/**
 * Shared wrapper that handles the "should I render?" gate for every
 * jurisdictional section on the dynamic Privacy / Terms / Cookie pages.
 *
 * Per the standing DRY rule, each section reads the current jurisdiction
 * via the [useUserJurisdiction](../../hooks/use-user-jurisdiction.ts) hook
 * and self-gates — consumers never pass a `canShow*` boolean a child
 * could compute itself.
 *
 * Usage:
 *
 *   <JurisdictionSection patterns={["CA-QC"]} title="Quebec Law 25">
 *     ...quebec-specific copy...
 *   </JurisdictionSection>
 *
 * Wildcards (`CA-*`, `EEA-*`) are resolved by matchesJurisdiction in
 * shared/jurisdictions.ts. Multiple patterns OR together.
 */

import type { ReactNode } from "react";
import { matchesJurisdiction } from "@shared/jurisdictions";
import { useUserJurisdiction } from "@/hooks/use-user-jurisdiction";

export interface JurisdictionSectionProps {
  /** Patterns the section should render for. Empty array never renders. */
  patterns: readonly string[];
  children: ReactNode;
}

export function JurisdictionSection({ patterns, children }: JurisdictionSectionProps) {
  const { jurisdiction } = useUserJurisdiction();
  if (!matchesJurisdiction(jurisdiction, patterns)) return null;
  return <>{children}</>;
}
