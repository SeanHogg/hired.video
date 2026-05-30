/**
 * ExportProfilePicker — picks a platform / social export profile (#342).
 *
 * Reads from `PLATFORM_PRESETS` in `lib/timeline/export-profiles.ts`
 * (single source of truth). Groups by destination so the user finds
 * the canonical "YouTube 1080p60" / "TikTok 9:16" preset without
 * configuring resolution + aspect + bitrate by hand.
 *
 * The picker is purely presentational — it surfaces the catalog and
 * raises the chosen preset id. Wiring the chosen preset to the render
 * facade is the caller's job (since the facade also accepts custom
 * formats from #285).
 */
"use client";

import { Lock } from "lucide-react";
import {
  PLATFORM_PRESETS,
  groupPlatformPresets,
  type PlatformExportProfile,
} from "@/lib/timeline/export-profiles";
import { cn } from "@/lib/utils";

interface Props {
  /** Active preset id. Pass null for "no selection" (the picker shows
   *  the hint state). */
  value: string | null;
  onChange: (preset: PlatformExportProfile) => void;
  /** When true, pro-only presets render with a lock badge and the
   *  click handler is suppressed. Caller resolves entitlement. */
  proLocked?: boolean;
  className?: string;
}

export default function ExportProfilePicker({
  value,
  onChange,
  proLocked = false,
  className,
}: Props) {
  const groups = groupPlatformPresets();

  return (
    <div className={cn("space-y-3", className)}>
      {groups.map((group) => (
        <section key={group.id}>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {group.label}
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {group.presets.map((preset) => {
              const locked = proLocked && preset.proOnly;
              const active = value === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(
                    "relative text-left rounded-md border p-2 transition-colors",
                    active && "border-primary bg-primary/5",
                    !active && !locked && "hover:bg-accent",
                    locked && "opacity-60 cursor-not-allowed",
                  )}
                  onClick={() => {
                    if (locked) return;
                    onChange(preset);
                  }}
                  aria-pressed={active}
                  disabled={locked}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium truncate">{preset.label}</div>
                    {preset.proOnly && (
                      <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {preset.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[10px] text-muted-foreground">
        {PLATFORM_PRESETS.length} preset
        {PLATFORM_PRESETS.length === 1 ? "" : "s"} match each platform's
        recommended upload encoding spec.
      </p>
    </div>
  );
}
