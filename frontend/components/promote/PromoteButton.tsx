/**
 * Generic "Promote" button + modal. Drops in next to any
 * user-generated subject the owner controls — reviews, feed posts,
 * videos, resumes, voice clones, etc. The modal collects
 * budget + duration and posts to /api/boosts. The server enforces
 * ownership.
 *
 * Stripe payment is not yet wired (matches the existing job/company
 * boost scaffold); the modal makes that explicit so users aren't
 * surprised. When payment wiring lands across all boost types, this
 * component swaps the placeholder for Stripe Elements without
 * changing its callers.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { boostService, type Boost } from "@/lib/services/boost-service";

interface PromoteButtonProps {
  subjectType: string;
  subjectId: string;
  /** Display label for the modal copy ("Promote your review of Acme"). */
  subjectLabel: string;
  /** Optional render override for the trigger element. */
  trigger?: React.ReactNode;
  onPromoted?: (boost: Boost) => void;
}

const PLACEMENTS: { value: string; label: string }[] = [
  { value: "feed_top", label: "Top of dashboard feed" },
  { value: "discovery", label: "Discovery surfaces" },
  { value: "all", label: "All eligible surfaces" },
];

export function PromoteButton({
  subjectType,
  subjectId,
  subjectLabel,
  trigger,
  onPromoted,
}: PromoteButtonProps) {
  const [open, setOpen] = useState(false);
  const [budgetDollars, setBudgetDollars] = useState("10");
  const [durationDays, setDurationDays] = useState("7");
  const [placement, setPlacement] = useState("feed_top");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const dollars = parseFloat(budgetDollars);
    const days = parseInt(durationDays, 10);
    if (!Number.isFinite(dollars) || dollars < 1) {
      toast({ title: "Budget must be at least $1", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      toast({ title: "Duration must be 1–90 days", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const boost = await boostService.create({
        subjectType,
        subjectId,
        budgetCents: Math.round(dollars * 100),
        durationDays: days,
        placementType: placement,
        pricingModel: "flat",
      });
      toast({
        title: "Promotion started",
        description: `Your boost is live for ${days} day${days === 1 ? "" : "s"}.`,
      });
      onPromoted?.(boost);
      setOpen(false);
    } catch (err: any) {
      toast({
        title: "Couldn't start promotion",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Promote
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Promote {subjectLabel}</DialogTitle>
          <DialogDescription>
            Boost this in front of more eyes. Set a budget and how long the
            promotion runs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="boost-budget" className="mb-2 block">
              Budget (USD)
            </Label>
            <Input
              id="boost-budget"
              type="number"
              min="1"
              step="1"
              value={budgetDollars}
              onChange={(e) => setBudgetDollars(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="boost-duration" className="mb-2 block">
              Duration (days)
            </Label>
            <Input
              id="boost-duration"
              type="number"
              min="1"
              max="90"
              step="1"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="boost-placement" className="mb-2 block">
              Where to show it
            </Label>
            <Select value={placement} onValueChange={setPlacement}>
              <SelectTrigger id="boost-placement">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/40">
            Payment integration is being unified across all boost types — for
            now, promotions are recorded and run without an upfront charge. We'll
            email you before billing your first paid boost.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Starting…" : "Start promotion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
