/**
 * The readable part of an AI answer while it is still being written (#1342):
 * the string values of `keys` pulled out of the streamed JSON text
 * (shared/ai-stream.ts `partialJsonStrings`), newest last, with a caret on
 * the one still arriving. Replaced by the real result panel once the answer
 * is validated. Shows nothing until the first readable words land.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { partialJsonStrings } from "@shared/ai-stream";

interface StreamingAnswerPreviewProps {
  /** The answer text so far (raw JSON). */
  text: string;
  /** Which string fields to show, in document order. */
  keys: readonly string[];
  /** Show at most this many of the latest fields. */
  limit?: number;
}

export function StreamingAnswerPreview({ text, keys, limit = 8 }: StreamingAnswerPreviewProps) {
  const { t } = useTranslation();
  const parts = useMemo(() => partialJsonStrings(text, keys).filter((p) => p.text.trim()), [text, keys]);
  if (parts.length === 0) return null;
  const shown = parts.slice(-limit);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />
          {t("aiStream.writing")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul aria-live="polite" aria-busy="true" className="m-0 flex list-none flex-col gap-2 p-0 text-sm [overflow-wrap:anywhere]">
          {shown.map((p, i) => (
            <li key={`${parts.length - shown.length + i}`} className="text-foreground">
              {p.text}
              {!p.closed && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
