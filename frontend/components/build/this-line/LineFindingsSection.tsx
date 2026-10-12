/**
 * "This line" › Findings: what the scoring runs said about the selected
 * line (FindingCard each), or a plain note when they said nothing about it.
 */
import { useTranslation } from "react-i18next";
import type { PageFinding } from "@/lib/build/page-findings";
import type { FindingActions } from "@/lib/build/use-finding-actions";
import FindingCard from "./FindingCard";

interface LineFindingsSectionProps {
  findings: readonly PageFinding[];
  actions: Pick<FindingActions, "apply" | "dismiss" | "fix" | "applyingId" | "failedId">;
}

export default function LineFindingsSection({ findings, actions }: LineFindingsSectionProps) {
  const { t } = useTranslation();
  if (findings.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">{t("build.thisLine.findings.none")}</p>;
  }
  const { apply, dismiss, fix, applyingId, failedId } = actions;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {findings.map((f) => (
        <li key={f.id}>
          <FindingCard
            finding={f}
            onApply={f.rewrite && apply ? (after) => void apply(f, after) : undefined}
            onDismiss={() => dismiss(f.id)}
            onFix={f.action && fix ? () => fix(f) : undefined}
            applying={applyingId === f.id}
            failed={failedId === f.id}
          />
        </li>
      ))}
    </ul>
  );
}
