/**
 * One turn in the kit conversation. "user" echoes what the visitor gave us
 * (right-aligned ink bubble); "assistant" is our reply — plain text in the
 * column, no bubble, so the cards that follow read as part of the answer.
 */
import type { ReactNode } from "react";

interface ConversationBubbleProps {
  from: "user" | "assistant";
  children: ReactNode;
  /** Optional leading icon for the user bubble (e.g. a file glyph). */
  icon?: ReactNode;
}

export default function ConversationBubble({ from, children, icon }: ConversationBubbleProps) {
  if (from === "assistant") {
    return <div className="text-[15px] leading-[1.55] text-foreground">{children}</div>;
  }
  return (
    <div className="flex max-w-[90%] items-center gap-2.5 self-end rounded-[14px_14px_4px_14px] bg-ink px-3.5 py-2.5 text-sm text-ink-foreground">
      {icon}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
