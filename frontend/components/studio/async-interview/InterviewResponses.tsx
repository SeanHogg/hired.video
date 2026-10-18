import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { AsyncInterview } from "@/lib/services/studio-features-service";
import type { InterviewResponses as InterviewResponsesData } from "./helpers";

/** Expanded responses block under a recruiter interview row. */
export function InterviewResponses({
  interview: iv,
  responses,
  loading,
}: {
  interview: AsyncInterview;
  responses: InterviewResponsesData | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 border-t pt-4">
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("studio.asyncInterview.loadingResponses")}
        </div>
      ) : responses && responses.responses.length > 0 ? (
        <div className="space-y-3">
          {responses.responses.map((resp, i) => (
            <div
              key={resp.id ?? i}
              className="rounded-lg border bg-muted/20 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t("studio.asyncInterview.questionNumberLabel", {
                    num: i + 1,
                    text: iv.questions[i]?.text ?? t("studio.asyncInterview.questionFallback"),
                  })}
                </span>
                {resp.durationMs && (
                  <span className="text-xs text-muted-foreground">
                    {t("studio.asyncInterview.durationSec", { sec: Math.round(resp.durationMs / 1000) })}
                  </span>
                )}
              </div>
              {resp.videoUrl ? (
                <video
                  src={resp.videoUrl}
                  controls
                  className="w-full max-w-md rounded-md"
                  preload="metadata"
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {t("studio.asyncInterview.noRecording")}
                </p>
              )}
              {resp.transcription && (
                <p className="text-xs text-muted-foreground">
                  {resp.transcription}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("studio.asyncInterview.noResponsesYet")}
        </p>
      )}
    </div>
  );
}
