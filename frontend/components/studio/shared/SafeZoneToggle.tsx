/**
 * SafeZoneToggle — "Show safe zones" switch for the V2 canvas (#855).
 * Owns its own state via `useSafeZonePreference`; consumers just drop it
 * in. Self-gates: renders nothing when the active format has no safe
 * zones to show (no point offering a toggle for guides that don't exist).
 */
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSafeZonePreference } from "@/lib/studio/editor-v2/use-safe-zone-pref";
import {
  findFormatByDimensions,
  safeZonesForFormat,
} from "@/lib/studio/video-formats";
import { cn } from "@/lib/utils";

interface Props {
  /** Active canvas pixel dimensions — used to decide whether any safe
   *  zones exist for the current format. */
  width: number;
  height: number;
  className?: string;
}

export default function SafeZoneToggle({ width, height, className }: Props) {
  const [showSafeZones, setShowSafeZones] = useSafeZonePreference();
  const hasZones =
    safeZonesForFormat(findFormatByDimensions(width, height)).length > 0;
  if (!hasZones) return null;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <Label htmlFor="safe-zone-toggle" className="text-xs">
        Show safe zones
      </Label>
      <Switch
        id="safe-zone-toggle"
        checked={showSafeZones}
        onCheckedChange={setShowSafeZones}
      />
    </div>
  );
}
