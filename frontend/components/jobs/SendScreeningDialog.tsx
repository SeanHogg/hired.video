/**
 * SendScreeningDialog — send a role's screening template to an existing
 * applicant straight from the pipeline (#1855). Given the originating
 * `jobApplicationId`, the backend resolves the candidate's email + the job's
 * company itself, so the recruiter only picks which template to send.
 *
 * Self-contained + self-gating: renders nothing when there's no application to
 * send from (e.g. a manually-added pipeline entry), so the caller can mount it
 * unconditionally and just gate the trigger.
 */

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  screeningService,
  type ScreeningTemplateRow,
} from "@/lib/services/screening-service";

interface SendScreeningDialogProps {
  applicationId: string | null;
  candidateName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SendScreeningDialog({
  applicationId,
  candidateName,
  open,
  onOpenChange,
}: SendScreeningDialogProps) {
  const [templates, setTemplates] = useState<ScreeningTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [sending, setSending] = useState(false);

  // Load the recruiter's templates on open. No companyId arg — the backend
  // resolves the caller's company scope and returns every template they can
  // send (active, non-archived).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    screeningService
      .listTemplates()
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((r) => !r.archivedAt);
        setTemplates(active);
        if (active.length === 1) setSelectedId(active[0].id);
      })
      .catch(() => !cancelled && setTemplates([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!applicationId) return null;

  async function handleSend() {
    if (!selectedId) {
      toast.error("Pick a screening template to send");
      return;
    }
    setSending(true);
    try {
      await screeningService.sendFromApplication({
        applicationId: applicationId!,
        templateId: selectedId,
      });
      toast.success(
        candidateName
          ? `Screening sent to ${candidateName}`
          : "Screening sent to the applicant",
      );
      onOpenChange(false);
      setSelectedId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send screening");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send screening{candidateName ? ` to ${candidateName}` : ""}</DialogTitle>
          <DialogDescription>
            The applicant gets a magic link to complete the screening. Items they
            already have on file are pre-filled, so they only finish what's missing.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <Alert>
            <AlertDescription className="text-sm">
              You don't have any screening templates yet. Create one from the
              Screening Templates page, then send it from here.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-1.5">
            <Label>Screening template</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    {tpl.roleFamily ? ` · ${tpl.roleFamily}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || loading || templates.length === 0 || !selectedId}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send screening
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
