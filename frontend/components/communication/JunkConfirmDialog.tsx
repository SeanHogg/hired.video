// "Mark as Junk" confirmation dialog. Defaults to a sender-exact
// match keyed off the email's `fromEmail`, but the user can switch to
// domain or sender+subject before confirming — important for the
// LinkedIn case where blocking the whole domain would also kill
// legitimate connection emails.
//
// On confirm, the parent (InboxDetailSheet → useCommHub) POSTs
// `/api/inbox/external-emails/:id/junk` with the chosen shape. The
// server mints a user rule that future syncs honour ahead of every
// default classification rule.

import { useMemo, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ShieldX } from "lucide-react";

export type JunkMatchKind = "sender" | "domain" | "sender+subject";

export interface JunkRuleChoice {
  matchKind: JunkMatchKind;
  /** Overrides the default value derived from the email — null means
   *  "use the default for this matchKind". */
  matchValue: string | null;
}

export interface JunkConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromEmail: string;
  subject: string | null;
  isSubmitting?: boolean;
  onConfirm: (choice: JunkRuleChoice) => void;
}

function domainFromEmail(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

export function JunkConfirmDialog({
  open,
  onOpenChange,
  fromEmail,
  subject,
  isSubmitting = false,
  onConfirm,
}: JunkConfirmDialogProps) {
  const [matchKind, setMatchKind] = useState<JunkMatchKind>("sender");
  const defaultValue = useMemo(() => {
    if (matchKind === "domain") return domainFromEmail(fromEmail);
    if (matchKind === "sender+subject") return (subject ?? "").trim();
    return fromEmail.toLowerCase();
  }, [matchKind, fromEmail, subject]);
  const [matchValue, setMatchValue] = useState<string>("");

  // Reset the input every time the user flips the match shape so they
  // see the new default rather than a stale value from the prior kind.
  const effectiveValue = matchValue.trim().length > 0 ? matchValue : defaultValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldX className="h-4 w-4 text-rose-600" />
            Mark as Junk
          </DialogTitle>
          <DialogDescription>
            We'll archive this message and add a rule so future syncs
            never surface it again. The rule runs before every default
            classification rule, so it wins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Match on</Label>
            <RadioGroup
              value={matchKind}
              onValueChange={(v) => {
                setMatchKind(v as JunkMatchKind);
                setMatchValue("");
              }}
              className="space-y-1.5 pt-1"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="junk-sender" value="sender" />
                <Label htmlFor="junk-sender" className="text-sm cursor-pointer">
                  Sender (this email address)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="junk-domain" value="domain" />
                <Label htmlFor="junk-domain" className="text-sm cursor-pointer">
                  Sender domain (blocks every address @{domainFromEmail(fromEmail)})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="junk-sender-subject" value="sender+subject" />
                <Label
                  htmlFor="junk-sender-subject"
                  className="text-sm cursor-pointer"
                >
                  Sender + subject contains
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="junk-match-value" className="text-xs">
              {matchKind === "domain"
                ? "Domain"
                : matchKind === "sender+subject"
                  ? "Subject contains"
                  : "From address"}
            </Label>
            <Input
              id="junk-match-value"
              value={matchValue || defaultValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder={defaultValue}
              className="mt-1"
            />
            {matchKind === "sender+subject" && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Both must match — the sender AND the subject substring.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isSubmitting || effectiveValue.trim().length === 0}
            onClick={() =>
              onConfirm({
                matchKind,
                matchValue: matchValue.trim().length > 0 ? matchValue.trim() : null,
              })
            }
          >
            {isSubmitting ? "Marking…" : "Mark as Junk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default JunkConfirmDialog;
