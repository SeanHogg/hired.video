/**
 * Beta opt-in toggle for the v2 Studio editor.
 *
 * Self-gating per the standing DRY rule — consumers mount this where
 * they want it (Studio header, settings page, navigation menu) without
 * passing a `currentVersion` prop or a `setVersion` callback. The hook
 * is the single source of truth.
 */
import { Switch } from "@/components/ui/switch";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";

export interface EditorVersionToggleProps {
  className?: string;
  /** Compact form for the header bar. Defaults to false (full row). */
  compact?: boolean;
}

export default function EditorVersionToggle({
  className,
  compact = false,
}: EditorVersionToggleProps) {
  const { isV2, setVersion } = useEditorPreference();

  if (compact) {
    return (
      <label
        className={cn(
          "inline-flex items-center gap-2 text-xs text-muted-foreground select-none",
          className,
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Try new editor</span>
        <Switch
          checked={isV2}
          onCheckedChange={(checked) => setVersion(checked ? "v2" : "classic")}
          aria-label="Toggle Studio editor v2"
        />
      </label>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3",
        className,
      )}
    >
      <Sparkles className="mt-0.5 h-5 w-5 text-brand-purple" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium leading-none">
            Beta: new canvas editor
          </p>
          <Switch
            checked={isV2}
            onCheckedChange={(checked) => setVersion(checked ? "v2" : "classic")}
            aria-label="Toggle Studio editor v2"
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Drag-and-drop widgets onto your video canvas like PowerPoint or a
          dashboard builder. Your existing videos still open in the classic
          editor when this is off.
        </p>
      </div>
    </div>
  );
}
