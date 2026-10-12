/**
 * ReviewPinInlineBody — canvas-side preview of a reviewer comment
 * thread. Renders the root comment + a thread-depth hint; in playback
 * the engagement overlay opens the full thread on click (#1586).
 */
import { Loader2, MessageCircle } from "lucide-react";

import { useEngagementAsset } from "@/lib/studio/engagement/use-engagement-asset";

interface Props {
  projectId: string;
  assetId: string;
}

export default function ReviewPinInlineBody({ projectId, assetId }: Props) {
  const loaded = useEngagementAsset("review-pin", projectId, assetId);
  const root = loaded?.kind === "review-pin" ? loaded.root : null;
  const replyCount = loaded?.kind === "review-pin" ? loaded.replies.length : 0;

  if (loaded === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Loading comment…
      </div>
    );
  }

  if (!root) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
        <MessageCircle className="h-4 w-4" />
        Comment not found
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-hidden p-2 text-left">
      <div className="flex items-center justify-between gap-1.5 text-[10px] opacity-70">
        <span className="flex items-center gap-1 truncate font-medium">
          <MessageCircle className="h-3 w-3 shrink-0" />
          {root.authorName}
        </span>
        <span className="shrink-0">
          {root.resolved ? "Resolved" : "Open"}
          {root.timestampSec != null ? ` · @${root.timestampSec.toFixed(1)}s` : ""}
        </span>
      </div>
      <p className="line-clamp-3 flex-1 text-xs">{root.body}</p>
      {replyCount > 0 && (
        <p className="text-[10px] opacity-60">
          +{replyCount} repl{replyCount === 1 ? "y" : "ies"}
        </p>
      )}
    </div>
  );
}
