/**
 * ReportAbuseDialog — the form behind <ReportAbuseButton>. Captures
 * reason + optional notes, POSTs to /api/reports, and confirms with a
 * toast. The reporter is told that their report goes to the platform
 * moderation team via /inbox so the next step is discoverable.
 *
 * Form state intentionally local — no global store, no react-query
 * cache. Reports are write-once-from-a-single-surface; the dialog
 * unmounts after success and the only follow-up surface is /inbox.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { reportsService } from "@/lib/services/reports-service";
import {
  REPORT_ENTITY_LABEL,
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  type ReportEntityType,
  type ReportReason,
} from "@shared/moderation";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  entityType: ReportEntityType;
  entityId: string;
  entityLabel?: string;
  onReported?: () => void;
}

export default function ReportAbuseDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityLabel,
  onReported,
}: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState<ReportReason>("inappropriate");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const noun = entityLabel ?? REPORT_ENTITY_LABEL[entityType] ?? "content";

  async function submit() {
    setSubmitting(true);
    try {
      const filed = await reportsService.file({
        entityType,
        entityId,
        reason,
        notes: notes.trim() || undefined,
      });
      toast({
        title: filed.created ? "Report sent" : "Already reported",
        description: filed.created
          ? "A platform moderator will review it. Watch your /inbox for follow-up."
          : "You've already reported this — check /inbox for the existing thread.",
      });
      onReported?.();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't send the report",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this {noun.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Tell our moderation team what's wrong. They'll review the
            report and follow up with you via /inbox if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-reason">Reason</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as ReportReason)}
            >
              <SelectTrigger id="report-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REPORT_REASON_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-notes">
              More detail <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="report-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="What should we know? Links, timestamps, context…"
            />
            <p className="text-[10px] text-muted-foreground">
              {notes.length}/2000
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
