/**
 * The "This line" Simple drills — each the line's own section in the slot:
 *
 *   Wording    edit it, use a suggested rewrite, ask the AI to rewrite it
 *   Findings   what the scoring runs said about it (Apply / Dismiss)
 *   Job match  the target job's keywords it shows / could cover
 */
import { useTranslation } from "react-i18next";
import LineWordingSection, { type LineRewriteIntent } from "../LineWordingSection";
import LineFindingsSection from "../LineFindingsSection";
import LineJobMatchSection from "../LineJobMatchSection";
import type { LineDrillProps } from "../types";

export function WordingDrill({ data, onAsk }: LineDrillProps) {
  const { t } = useTranslation();
  const { line, suggestions, commitLine } = data;
  const rewrite = (intent: LineRewriteIntent) => onAsk(t(`build.thisLine.prompt.${intent}`, { line: line.text }));
  // Keyed by the text: an undo / AI edit of the line resets the box.
  return <LineWordingSection key={line.text} text={line.text} suggestions={suggestions} onCommit={commitLine} onRewrite={rewrite} />;
}

export function FindingsDrill({ data, actions }: LineDrillProps) {
  return <LineFindingsSection findings={data.findings} actions={actions} />;
}

export function MatchDrill({ data, onAsk }: LineDrillProps) {
  const { t } = useTranslation();
  const addKeyword = (keyword: string) => onAsk(t("build.thisLine.prompt.keyword", { keyword, line: data.line.text }));
  return <LineJobMatchSection match={data.jobMatch} keywords={data.keywords} onAddKeyword={addKeyword} />;
}
