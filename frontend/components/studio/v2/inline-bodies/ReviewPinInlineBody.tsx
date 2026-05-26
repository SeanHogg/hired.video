/**
 * ReviewPinInlineBody — canvas-side preview of a reviewer comment
 * thread. Renders the root comment + a thread-depth hint; clicking
 * the rendered pin in the player surfaces the full thread (the
 * playback wiring is the deferred half of #1579).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import {
  getProjectComments,
  type ReviewComment,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string;
  assetId: string;
}

export default function ReviewPinInlineBody({ projectId, assetId }: Props) {
  const [comments, setComments] = useState<ReviewComment[] | null | undefined>(undefined);

  useEffect(() => {
    if (!projectId || !assetId) {
      setComments(null);
      return;
    }
    let cancelled = false;
    getProjectComments(projectId)
      .then((all) => {
        if (cancelled) return;
        setComments(all);
      })
      .catch(() => {
        if (cancelled) return;
        setComments(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, assetId]);

  const { root, replyCount } = useMemo(() => {
    if (!comments) return { root: null as ReviewComment | null, replyCount: 0 };
    const r = comments.find((c) => c.id === assetId) ?? null;
    if (!r) return { root: null, replyCount: 0 };
    const replies = comments.filter((c) => c.parentId === r.id).length;
    return { root: r, replyCount: replies };
  }, [comments, assetId]);

  if (comments === undefined) {
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
