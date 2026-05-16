/**
 * InboxSettingsSheet — per-account inbox settings drawer.
 *
 * Today: minJobScore slider (0–100%) per connected mailbox. Saves via
 * PATCH /api/integrations/email/accounts/:id. Future toggles
 * (pause/resume, label) belong here too.
 */

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { emailIntegrationService } from "@/lib/services/email-integration-service";
import type { InboxAccount } from "@/hooks/use-comm-hub";

export interface InboxSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: InboxAccount[];
  onSaved: () => void;
}

export function InboxSettingsSheet({
  open,
  onOpenChange,
  accounts,
  onSaved,
}: InboxSettingsSheetProps) {
  // Local draft state, keyed by account id. Initialized from the
  // accounts list each time the sheet opens so reverting is "close +
  // reopen".
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, number> = {};
    for (const a of accounts) initial[a.id] = Math.round(a.minJobScore * 100);
    setDraft(initial);
    setError(null);
  }, [open, accounts]);

  const save = async (accountId: string) => {
    const pct = draft[accountId] ?? 50;
    setSavingId(accountId);
    setError(null);
    try {
      await emailIntegrationService.patchAccount(accountId, {
        minJobScore: pct / 100,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col"
        aria-describedby="inbox-settings-description"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle>Inbox settings</SheetTitle>
          <SheetDescription id="inbox-settings-description">
            Configure how strictly each mailbox filters synced mail. Only
            emails the classifier rates above the threshold reach the
            inbox feed.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-6">
            {accounts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No mailboxes connected yet.
              </div>
            ) : (
              accounts.map((a) => {
                const label = a.accountLabel?.trim() || a.accountEmail;
                const pct = draft[a.id] ?? Math.round(a.minJobScore * 100);
                const initialPct = Math.round(a.minJobScore * 100);
                const dirty = pct !== initialPct;
                return (
                  <div key={a.id} className="space-y-3 border rounded p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.provider} · {a.accountEmail}
                        </div>
                      </div>
                      <div className="text-sm font-medium tabular-nums">
                        {pct}%
                      </div>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[pct]}
                      onValueChange={([v]) =>
                        setDraft((prev) => ({ ...prev, [a.id]: v }))
                      }
                    />
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        Strict filtering — fewer messages, higher signal.
                      </span>
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "outline"}
                        disabled={!dirty || savingId === a.id}
                        onClick={() => save(a.id)}
                      >
                        {savingId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default InboxSettingsSheet;
