import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AsyncInterview } from "@/lib/services/studio-features-service";

interface CandidateQuestionCardProps {
  question: AsyncInterview["questions"][number];
  index: number;
  maxDuration: number;
  isRecording: boolean;
  recordingTime: number;
  /** The finished take for this question, when one exists. */
  recording: Blob | undefined;
  error: string | null;
  videoPreviewRef: RefObject<HTMLVideoElement>;
  onStart: () => void;
  onStop: () => void;
  onRetake: () => void;
}

/** One question: prompt, live preview / playback, record controls. */
export function CandidateQuestionCard({
  question,
  index,
  maxDuration,
  isRecording,
  recordingTime,
  recording,
  error,
  videoPreviewRef,
  onStart,
  onStop,
  onRetake,
}: CandidateQuestionCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        {/* Question text */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {t("studio.asyncInterview.questionNumberShort", { num: index + 1 })}
            </Badge>
            {question.required && (
              <Badge variant="secondary" className="text-xs">
                {t("labels.required")}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {t("studio.asyncInterview.maxSeconds", { sec: maxDuration })}
            </span>
          </div>
          <p className="text-base font-medium">{question.text}</p>
        </div>

        {/* Video area */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
          {isRecording ? (
            <>
              <video
                ref={videoPreviewRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs text-white">
                <span className="h-2 w-2 rounded-full bg-card animate-pulse" />
                {t("studio.asyncInterview.recIndicator", { current: recordingTime, max: maxDuration })}
              </div>
            </>
          ) : recording ? (
            <video
              src={URL.createObjectURL(recording)}
              controls
              className="h-full w-full"
              preload="metadata"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Video className="h-12 w-12 opacity-40" />
              <p className="text-sm">
                {t("studio.asyncInterview.clickToRecord")}
              </p>
            </div>
          )}
        </div>

        {/* Recording controls */}
        <div className="flex items-center justify-center gap-3">
          {isRecording ? (
            <Button variant="destructive" onClick={onStop}>
              {t("studio.asyncInterview.stopRecording")}
            </Button>
          ) : recording ? (
            <Button variant="outline" onClick={onRetake}>
              <Video className="mr-2 h-4 w-4" />
              {t("studio.asyncInterview.retake")}
            </Button>
          ) : (
            <Button onClick={onStart}>
              <Video className="mr-2 h-4 w-4" />
              {t("studio.asyncInterview.startRecording")}
            </Button>
          )}
        </div>

        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
