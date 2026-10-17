/**
 * /tools/summarize-resume pieces: the submit button each input tab shares,
 * and the result column (the summary with reset / copy, or the empty state).
 */
import { useTranslation } from "react-i18next";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SummarizeButton({ onClick, disabled, busy }: { onClick: () => void; disabled: boolean; busy: boolean }) {
  const { t } = useTranslation();
  return (
    <Button onClick={onClick} disabled={disabled} className="w-full">
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {t("status.summarizing")}
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-2" />
          {t("actions.summarizeResume")}
        </>
      )}
    </Button>
  );
}

export function SummaryResultPanel({
  summary,
  busy,
  onReset,
}: {
  summary: string | null;
  busy: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  if (summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("headings.resumeSummary")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</div>
          </div>

          <div className="flex gap-2 mt-6">
            <Button variant="outline" onClick={onReset}>
              {t("actions.summarizeAnother")}
            </Button>
            <Button onClick={() => navigator.clipboard.writeText(summary)} variant="outline">
              {t("actions.copySummary")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (busy) return null;
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold mb-2">{t("headings.readyToSummarize")}</h3>
        <p className="text-sm text-muted-foreground">{t("messages.readyToSummarizeBody")}</p>
      </CardContent>
    </Card>
  );
}
