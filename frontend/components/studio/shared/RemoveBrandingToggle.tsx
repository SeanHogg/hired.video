/**
 * RemoveBrandingToggle — the "Remove hired.video branding" switch.
 * Drops into any settings surface (v1 sidebar, v2 inspector). Owns its
 * own state via `useRemoveBrandingFlag`; consumers don't pass a value
 * or change handler.
 *
 * Self-gating per the DRY rule:
 *   - Always visible so free users discover the Pro feature (the
 *     switch is disabled with an inline upgrade hint).
 *   - The branding policy itself ignores the flag for non-Pro users,
 *     so a free user can never accidentally strip branding.
 */
import { Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export default function RemoveBrandingToggle({ className }: Props) {
  const { isPro } = useSubscription();
  const { rawRemoveBranding, setRemoveBranding } = useRemoveBrandingFlag();
  const checked = isPro ? rawRemoveBranding : false;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="remove-branding-toggle" className="text-xs">
          Remove hired.video branding
        </Label>
        <Switch
          id="remove-branding-toggle"
          checked={checked}
          disabled={!isPro}
          onCheckedChange={(next) => isPro && setRemoveBranding(next)}
        />
      </div>
      {!isPro && (
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>
            Pro feature — upgrade to remove the corner watermark and end-cap
            from rendered videos.
          </span>
        </p>
      )}
    </div>
  );
}
