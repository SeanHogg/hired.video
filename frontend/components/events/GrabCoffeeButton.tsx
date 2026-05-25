/**
 * GrabCoffeeButton — self-gating "Grab a coffee" CTA used on the
 * /people/[id] profile.
 *
 * Self-gates on the recipient's `openToCoffee` profile section visibility
 * (returns null when off, per [feedback_extract_on_duplication]). When
 * clicked, opens an inline dialog with optional message + proposed
 * time/location, POSTs to /api/coffee, and shows the resulting status.
 *
 * The backend re-checks the openToCoffee gate (see routes/coffee.ts), so
 * a stale cache here can't produce an unwanted invite.
 */
import { useState } from "react";
import { Coffee, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { coffeeService } from "@/lib/services/coffee-service";
import { useProfileSectionVisibility } from "@/components/profile/sections/profile-sections-context";
import type { CoffeeFormat } from "@shared/coffee";

interface GrabCoffeeButtonProps {
  targetUserId: string;
  targetName?: string | null;
  /** Don't render for yourself. */
  isSelf?: boolean;
}

export function GrabCoffeeButton({
  targetUserId,
  targetName,
  isSelf,
}: GrabCoffeeButtonProps) {
  // Self-gating: reads from the ProfileSectionsProvider that already
  // wraps PeopleDetail. Outside the provider the hook returns true
  // (open by default), which is the right fallback for embedded preview
  // surfaces where the gate doesn't make sense.
  const openToCoffee = useProfileSectionVisibility("openToCoffee");
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [proposedAt, setProposedAt] = useState("");
  const [proposedLocation, setProposedLocation] = useState("");
  const [proposedFormat, setProposedFormat] = useState<CoffeeFormat>("in_person");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Self-gate: render nothing when the target isn't open to coffee, or
  // when it's the viewer themselves.
  if (!openToCoffee || isSelf) return null;

  async function send() {
    if (!isAuthenticated) {
      navigate(`/login?next=/people/${targetUserId}`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await coffeeService.create({
        recipientUserId: targetUserId,
        message: message.trim() || undefined,
        proposedAt: proposedAt ? new Date(proposedAt).toISOString() : undefined,
        proposedLocation: proposedLocation.trim() || undefined,
        proposedFormat,
        expiresInDays: 14,
      });
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1400);
    } catch (err: any) {
      // 403 from the backend means recipient flipped openToCoffee off
      // between page load and submit; 409 = duplicate pending request.
      const msg = String(err?.message ?? err ?? "");
      if (msg.includes("403") || msg.toLowerCase().includes("isn't open")) {
        setError("This person isn't accepting coffee invites right now.");
      } else if (msg.includes("409") || msg.toLowerCase().includes("pending")) {
        setError("You already have a pending invite with this person.");
      } else {
        setError("Couldn't send the invite. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Coffee className="h-4 w-4 mr-2" />
          Grab a coffee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grab a coffee with {targetName ?? "this person"}</DialogTitle>
          <DialogDescription>
            They'll get a notification. If they accept, we'll create the meetup
            on both your Tasks / Events tabs.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center text-green-700">
            Invite sent. We'll let you know when they respond.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="message">Message (optional)</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="What would you like to talk about?"
                maxLength={2000}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="when">When</Label>
                <Input
                  id="when"
                  type="datetime-local"
                  value={proposedAt}
                  onChange={(e) => setProposedAt(e.target.value)}
                />
              </div>
              <div>
                <Label>Format</Label>
                <Select value={proposedFormat} onValueChange={(v) => setProposedFormat(v as CoffeeFormat)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">In person</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="where">
                {proposedFormat === "in_person" ? "Place" : "Meeting link (optional)"}
              </Label>
              <Input
                id="where"
                value={proposedLocation}
                onChange={(e) => setProposedLocation(e.target.value)}
                placeholder={
                  proposedFormat === "in_person"
                    ? "e.g. Blue Bottle, Mission, SF"
                    : "https://…"
                }
              />
            </div>

            {error && (
              <div className="text-sm p-2 rounded border border-red-200 bg-red-50 text-red-800">
                {error}
              </div>
            )}
          </div>
        )}

        {!success && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={send} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
