/**
 * The conversation under the kit insights, in the order it happened: each
 * request the visitor typed and the assistant's outcome (or its answer, for a
 * question), and each AI Tool run (its result card). Plus a "working on it"
 * bubble while a revision is in flight — always last. `extra` (the open
 * review's block) takes its place by when it started, so the newest thing is
 * always at the bottom. Keeps the newest item in view, since the column
 * scrolls on its own.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { BuildChatTurn } from "@/lib/build/use-build-chat";
import type { ToolRun } from "@/lib/build/use-tool-runs";
import { scrollIntoViewWithin } from "@/lib/dom/scroll-within";
import ToolRunMessage from "./ToolRunMessage";
import ConversationBubble from "./ConversationBubble";
import RevisedMessage from "./RevisedMessage";

interface ChatTurnsProps {
  turns: readonly BuildChatTurn[];
  /** AI Tool runs, interleaved with the turns by time. */
  runs: readonly ToolRun[];
  busy: boolean;
  /** Opens the latest revision's changes for review (per-change revert). */
  onReviewLatest?: () => void;
  /** One more block in the feed: `at` null puts it after the turns. */
  extra?: { at: number | null; node: ReactNode };
}

export default function ChatTurns({ turns, runs, busy, onReviewLatest, extra }: ChatTurnsProps) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  const lastRun = runs.at(-1);
  useEffect(() => {
    if (turns.length === 0 && runs.length === 0 && !busy && !extra) return;
    scrollIntoViewWithin(endRef.current, "end");
  }, [turns.length, runs.length, lastRun?.status, busy, extra?.at]);

  if (turns.length === 0 && runs.length === 0 && !busy && !extra) return null;
  type Item = { at: number } & ({ turn: BuildChatTurn } | { run: ToolRun } | { block: ReactNode });
  const feed: Item[] = [
    ...turns.map((turn) => ({ at: turn.at, turn })),
    ...runs.map((run) => ({ at: run.at, run })),
    ...(extra ? [{ at: extra.at ?? Number.POSITIVE_INFINITY, block: extra.node }] : []),
  ].sort((a, b) => a.at - b.at);
  const latestRevised = [...turns].reverse().find((t) => t.from === "assistant" && t.outcome === "revised" && t.changed.length > 0);

  return (
    <>
      {feed.map((item) => {
        if ("block" in item) return <div key="extra" className="contents">{item.block}</div>;
        if ("run" in item) return <ToolRunMessage key={`run-${item.run.id}`} run={item.run} />;
        const { turn } = item;
        return turn.from === "user" ? (
          <ConversationBubble key={turn.id} from="user">
            {turn.text}
          </ConversationBubble>
        ) : (
          <ConversationBubble key={turn.id} from="assistant">
            {turn.outcome === "answered" ? (
              turn.text
            ) : turn.outcome === "revised" ? (
              <>
                <RevisedMessage changed={turn.changed} />
                {onReviewLatest && turn === latestRevised && (
                  <button
                    type="button"
                    onClick={onReviewLatest}
                    className="ml-2 min-h-11 font-semibold text-primary underline underline-offset-4 sm:min-h-0"
                  >
                    {t("review.revise.open")}
                  </button>
                )}
              </>
            ) : (
              <span role="alert">{t("build.chat.reviseFailed")}</span>
            )}
          </ConversationBubble>
        );
      })}
      {busy && (
        <ConversationBubble from="assistant">
          <span aria-live="polite">{t("build.chat.revising")}</span>
        </ConversationBubble>
      )}
      <div ref={endRef} />
    </>
  );
}
