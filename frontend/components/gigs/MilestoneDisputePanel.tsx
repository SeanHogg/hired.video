// MilestoneDisputePanel — dispute timeline + actions for a single disputed gig
// milestone (#1768). Self-fetches the latest dispute on mount. Participants
// (poster / awarded creator) can append evidence + comments; a platform
// mediator (SuperAdmin) sees the escrow-direction decision buttons. Rendered by
// GigDetail only when a milestone is in the 'disputed' state.

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, Send, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  gigService,
  type GigDisputeDetail,
  type GigDisputeEvent,
} from "@/lib/services/gig-service";

const KIND_LABEL: Record<GigDisputeEvent["kind"], string> = {
  evidence: "Evidence",
  comment: "Comment",
  decision: "Decision",
};

export default function MilestoneDisputePanel({
  milestoneId,
  isMediator,
  onResolved,
}: {
  milestoneId: string;
  isMediator: boolean;
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<GigDisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await gigService.getMilestoneDispute(milestoneId);
    setDetail(d);
  }, [milestoneId]);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const addComment = async () => {
    if (!detail || !comment.trim()) return;
    setBusy(true);
    try {
      await gigService.addDisputeEvent(detail.dispute.id, comment.trim(), "comment");
      setComment("");
      await load();
    } catch (e) {
      toast({ title: "Couldn't add comment", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (resolution: "release" | "refund") => {
    if (!detail) return;
    const note = window.prompt(
      resolution === "release"
        ? "Release escrow to the creator. Add a resolution note:"
        : "Refund escrow to the poster. Add a resolution note:",
    );
    if (note == null || !note.trim()) return;
    setBusy(true);
    try {
      await gigService.resolveDispute(detail.dispute.id, resolution, note.trim());
      toast({ title: resolution === "release" ? "Escrow released to creator" : "Escrow refunded to poster" });
      onResolved();
    } catch (e) {
      toast({ title: "Couldn't resolve", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading dispute…
      </div>
    );
  }
  if (!detail) return null;

  const resolved = detail.dispute.status !== "open";

  return (
    <div className="mt-3 rounded-md border border-red-200 bg-red-50/50 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-red-700">
        <ShieldAlert className="w-4 h-4" />
        Dispute {resolved ? `· resolved (${detail.dispute.resolution})` : "· awaiting mediator"}
      </div>

      <ol className="space-y-2">
        {detail.events.map((ev) => (
          <li key={ev.id} className="text-xs">
            <span className="font-semibold">{KIND_LABEL[ev.kind]}</span>
            <span className="text-muted-foreground"> · {new Date(ev.createdAt).toLocaleString()}</span>
            <p className="mt-0.5 whitespace-pre-wrap">{ev.body}</p>
          </li>
        ))}
      </ol>

      {!resolved && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add evidence or a comment for the mediator…"
            className="text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" disabled={busy || !comment.trim()} onClick={addComment}>
              <Send className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
            {isMediator && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="default" disabled={busy} onClick={() => resolve("release")}>
                  <Scale className="w-3.5 h-3.5 mr-1" /> Release to creator
                </Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => resolve("refund")}>
                  Refund poster
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
