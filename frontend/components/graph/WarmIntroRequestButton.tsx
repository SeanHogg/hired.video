/**
 * WarmIntroRequestButton — "Ask a mutual to introduce you" CTA used on
 * /people/[id]. Closes the LinkedIn-InMail warm-intro gap: the
 * graph layer already knows WHO the mutuals are; this turns that into
 * a real ask that lands in the mutual's inbox.
 *
 * Self-gating, per [feedback_extract_on_duplication]:
 *   - hides if viewer == target (handled by `isSelf`)
 *   - hides if not authenticated (login redirect on click instead)
 *   - hides if there are zero mutuals (the whole concept doesn't apply)
 *
 * The backend re-validates that the chosen `viaUserId` is actually a
 * mutual (see services/graph/professionalGraph.requestWarmIntro), so a
 * stale cache here cannot fabricate a forwarding chain.
 */
import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { graphService, type PersonRef } from "@/lib/services/graph-service";

interface WarmIntroRequestButtonProps {
  targetUserId: string;
  targetName?: string | null;
  /** Don't render for yourself. */
  isSelf?: boolean;
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

export function WarmIntroRequestButton({
  targetUserId,
  targetName,
  isSelf,
}: WarmIntroRequestButtonProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutuals, setMutuals] = useState<PersonRef[] | null>(null);
  const [mutualCount, setMutualCount] = useState<number | null>(null);
  const [hideButton, setHideButton] = useState(false);
  const [selectedViaId, setSelectedViaId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<"created" | "deduped" | null>(null);

  // Probe for mutuals on mount. If there are none (or the call fails), we
  // self-hide rather than render a CTA that always errors. Unauthed
  // viewers don't probe — they get the button and a login redirect on
  // click, matching GrabCoffeeButton's pattern.
  useEffect(() => {
    if (isSelf || !isAuthenticated || !targetUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await graphService.mutuals(targetUserId);
        if (cancelled) return;
        setMutualCount(result.mutualCount);
        setMutuals(result.mutuals);
        if (result.mutualCount === 0 || result.isDirectConnection) {
          // Direct connection: warm-intro doesn't apply — they can just DM.
          // Zero mutuals: there's no one to ask.
          setHideButton(true);
        }
      } catch {
        setHideButton(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSelf, isAuthenticated, targetUserId]);

  if (isSelf || hideButton) return null;

  async function send() {
    if (!isAuthenticated) {
      navigate(`/login?next=/people/${targetUserId}`);
      return;
    }
    if (!selectedViaId) {
      setError("Pick someone to ask.");
      return;
    }
    if (!message.trim()) {
      setError("Add a short message — they'll forward it.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await graphService.requestIntro({
        viaUserId: selectedViaId,
        targetUserId,
        message: message.trim(),
      });
      setSuccess(result.created ? "created" : "deduped");
      setTimeout(() => {
        setOpen(false);
        setSuccess(null);
        setMessage("");
        setSelectedViaId(null);
      }, 1800);
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "");
      if (msg.includes("403") || msg.toLowerCase().includes("mutual")) {
        setError("That person isn't a mutual connection between you two.");
      } else {
        setError("Couldn't send the intro request. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const targetDisplay = targetName?.trim() || "this person";
  const mutualList = mutuals ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="h-4 w-4 mr-2" />
          Ask for an intro
          {typeof mutualCount === "number" && mutualCount > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              · {mutualCount} mutual{mutualCount === 1 ? "" : "s"}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ask for a warm intro to {targetDisplay}</DialogTitle>
          <DialogDescription>
            Pick a mutual connection and we'll DM them your ask. They decide
            whether to forward the intro.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center text-green-700">
            {success === "deduped"
              ? "You already have a pending request with this person — your earlier ask is still waiting on them."
              : "Sent. We'll let you know when they reply."}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Who should we ask?</Label>
              {mutuals === null ? (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading mutuals…
                </div>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto rounded border p-1">
                  {mutualList.map((m) => {
                    const selected = selectedViaId === m.userId;
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => setSelectedViaId(m.userId)}
                        className={`w-full flex items-center gap-3 p-2 rounded text-left hover:bg-muted transition-colors ${
                          selected ? "bg-brand-purple/10 ring-1 ring-brand-purple/40" : ""
                        }`}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.name ?? ""} />}
                          <AvatarFallback>{initials(m.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {m.name ?? "Connection"}
                          </div>
                          {m.headline && (
                            <div className="text-xs text-muted-foreground truncate">
                              {m.headline}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="intro-message">Your message</Label>
              <Textarea
                id="intro-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder={`Hi! Would you be open to introducing me to ${targetDisplay}? A bit about why…`}
                maxLength={2000}
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
            <Button
              onClick={send}
              disabled={busy || !selectedViaId || !message.trim()}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
