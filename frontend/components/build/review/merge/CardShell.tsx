/** The frame of a decision card that sits ON the résumé page: UI type (not
 *  the résumé's serif), its queue number, and the "needs you" tint until
 *  it is decided. `id` is the scroll target the chat's queue jumps to. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardShellProps {
  queueId?: string;
  number?: number;
  title: ReactNode;
  badges?: ReactNode;
  needsYou?: boolean;
  children?: ReactNode;
}

export const queueAnchorId = (queueId: string) => `review-q-${queueId.replace(/[^\w-]/g, "_")}`;

export default function CardShell({ queueId, number, title, badges, needsYou, children }: CardShellProps) {
  return (
    <div
      id={queueId ? queueAnchorId(queueId) : undefined}
      tabIndex={queueId ? -1 : undefined}
      className={cn(
        "my-2 flex scroll-mt-24 flex-col gap-2 rounded-xl border p-3 text-left font-sans text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary",
        needsYou ? "border-review-border bg-review/60" : "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {number !== undefined && <span className="mr-1">{number} ·</span>}
          {title}
        </span>
        {badges}
      </div>
      {children}
    </div>
  );
}
