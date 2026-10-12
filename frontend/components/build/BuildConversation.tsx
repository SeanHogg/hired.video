/**
 * The kit Chat pane: intake (upload / paste / describe yourself), the echo
 * of what the visitor gave us, the reading ("Here's what I see"), the video
 * card, and the change-request turns. Presentational — the page owns intake,
 * chat and the preview; this only lays the conversation out.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import type { ResumeContent } from "@shared/resume";
import type { ResumeInsights } from "@shared/resume-insights";
import type { IntakeSource, IntakeStatus } from "@/lib/build/use-resume-intake";
import type { KitEntryStatus } from "@/lib/workspace/use-kit-entry";
import type { BuildChatTurn } from "@/lib/build/use-build-chat";
import type { ToolRun } from "@/lib/build/use-tool-runs";
import IntakePanel from "./IntakePanel";
import ConversationBubble from "./ConversationBubble";
import ChatTurns from "./ChatTurns";
import InsightsCard from "./InsightsCard";
import VideoReadyCard from "./VideoReadyCard";

const ECHO_MAX = 160;
const PILL =
  "min-h-11 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:bg-muted sm:min-h-8";

interface BuildConversationProps {
  status: IntakeStatus;
  source: IntakeSource | null;
  entry: KitEntryStatus;
  /** Set once a résumé is ready. */
  ready: { insights: ResumeInsights; sceneCount: number; seconds: number } | null;
  turns: readonly BuildChatTurn[];
  /** AI Tool runs from the stage plan or a tool chip (result cards). */
  runs: readonly ToolRun[];
  busy: boolean;
  onFile: (file: File) => void;
  onText: (text: string) => void;
  onExistingResume: (content: ResumeContent, title: string, resumeId: string) => void;
  onStartOver: () => void;
  onJumpToPreview: () => void;
  onChangeDesign: () => void;
  onWatchVideo: () => void;
  /** The open review's side of the conversation (ReviewChatPanel), placed
   *  among the turns by when it started (`reviewAt`; null = after them). */
  review?: ReactNode;
  reviewAt?: number | null;
  /** The open stage's "Let AI do this step" card, first once ready. */
  plan?: ReactNode;
  /** The open stage's plan again + where to go next, last in the conversation. */
  next?: ReactNode;
  /** Review the latest chat revision change by change. */
  onReviewRevision?: () => void;
}

function echoOf(source: IntakeSource | null): string | null {
  if (!source) return null;
  if (source.kind === "file") return source.name;
  if (source.kind === "existing") return source.title;
  return source.text.length > ECHO_MAX ? `${source.text.slice(0, ECHO_MAX - 1)}…` : source.text;
}

export default function BuildConversation({
  status,
  source,
  entry,
  ready,
  turns,
  runs,
  busy,
  onFile,
  onText,
  onExistingResume,
  onStartOver,
  onJumpToPreview,
  onChangeDesign,
  onWatchVideo,
  review,
  reviewAt = null,
  plan,
  next,
  onReviewRevision,
}: BuildConversationProps) {
  const { t } = useTranslation();
  const echo = echoOf(source);

  return (
    <>
      {status !== "idle" && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onStartOver} className={PILL}>
            {t("build.startOver")}
          </button>
          {ready && (
            <button type="button" onClick={onJumpToPreview} className={`${PILL} lg:hidden`}>
              {t("build.chat.jumpToPreview")}
            </button>
          )}
        </div>
      )}
      {entry === "loading" && (
        <ConversationBubble from="assistant">
          <span aria-live="polite">{t("build.entry.loading")}</span>
        </ConversationBubble>
      )}
      {entry === "failed" && (
        <ConversationBubble from="assistant">
          <span role="alert">{t("build.entry.loadFailed")}</span>
        </ConversationBubble>
      )}
      {(status === "idle" || status === "error") && entry !== "loading" && (
        <IntakePanel onFile={onFile} onText={onText} onExistingResume={onExistingResume} />
      )}
      {echo && status !== "idle" && (
        <ConversationBubble
          from="user"
          icon={
            source?.kind === "file" || source?.kind === "existing" ? (
              <FileText aria-hidden="true" className="h-4 w-4 flex-none" />
            ) : undefined
          }
        >
          {echo}
        </ConversationBubble>
      )}
      {status === "parsing" && (
        <ConversationBubble from="assistant">
          <span aria-live="polite">{t("build.chat.reading")}</span>
        </ConversationBubble>
      )}
      {status === "error" && (
        <ConversationBubble from="assistant">
          <span role="alert">{t("build.chat.parseFailed")}</span>
        </ConversationBubble>
      )}
      {ready && (
        <>
          {plan}
          <ConversationBubble from="assistant">{t("build.chat.ready")}</ConversationBubble>
          <InsightsCard insights={ready.insights} />
          <ConversationBubble from="assistant">
            {t("build.chat.editHint")}{" "}
            <button
              type="button"
              onClick={onChangeDesign}
              className="font-semibold text-primary underline underline-offset-4"
            >
              {t("build.chat.changeDesign")}
            </button>
          </ConversationBubble>
          <VideoReadyCard sceneCount={ready.sceneCount} seconds={ready.seconds} onWatch={onWatchVideo} />
          <ChatTurns
            turns={turns}
            runs={runs}
            busy={busy}
            onReviewLatest={onReviewRevision}
            extra={review ? { at: reviewAt, node: review } : undefined}
          />
          {next}
        </>
      )}
    </>
  );
}
