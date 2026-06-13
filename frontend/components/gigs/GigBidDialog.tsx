// Shared "place a bid" dialog — used by both the marketplace grid and the gig
// detail page so the bid form lives in one place.

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { gigService, type GigProject } from "@/lib/services/gig-service";

interface Props {
  project: GigProject | null;
  onOpenChange: (open: boolean) => void;
  onBidPlaced?: () => void;
}

export default function GigBidDialog({ project, onOpenChange, onBidPlaced }: Props) {
  const { toast } = useToast();
  const [coverLetter, setCoverLetter] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (project) {
      setCoverLetter("");
      setAmount((project.budgetMaxCents / 100).toString());
    }
  }, [project]);

  const submit = async () => {
    if (!project) return;
    if (coverLetter.trim().length < 20) {
      toast({ title: "Add a proposal", description: "At least 20 characters.", variant: "destructive" });
      return;
    }
    const cents = Math.round(Number.parseFloat(amount || "0") * 100);
    if (!(cents > 0)) {
      toast({ title: "Enter a bid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await gigService.placeBid(project.id, { coverLetter: coverLetter.trim(), proposedAmountCents: cents });
      toast({ title: "Bid submitted", description: "The poster will review your proposal." });
      onOpenChange(false);
      onBidPlaced?.();
    } catch (e) {
      toast({ title: "Bid failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(project)} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bid on “{project?.title}”</DialogTitle>
          <DialogDescription>Pitch yourself and name your price for the whole brief.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="gig-bid-amount">Your price ($)</Label>
            <Input id="gig-bid-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gig-bid-cover">Proposal</Label>
            <Textarea
              id="gig-bid-cover"
              rows={6}
              placeholder="Why you're a great fit, relevant work, turnaround…"
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || coverLetter.trim().length < 20}>
            {submitting ? "Submitting…" : "Submit bid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
