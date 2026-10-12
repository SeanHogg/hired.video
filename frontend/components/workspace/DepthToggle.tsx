/**
 * Simple | Advanced — a two-segment switch in the workspace header. It only
 * changes what the fixed frame APPENDS (see workspace-panels.ts); the layout
 * and every button stay where they are.
 */
import { useTranslation } from "react-i18next";
import { WORKSPACE_DEPTHS, type WorkspaceDepth } from "@/lib/workspace/workspace-depth";
import { cn } from "@/lib/utils";

const LABEL_KEYS: Record<WorkspaceDepth, string> = {
  simple: "workspace.depth.simple",
  advanced: "workspace.depth.advanced",
};

export default function DepthToggle({
  depth,
  onChange,
  className,
}: {
  depth: WorkspaceDepth;
  onChange: (next: WorkspaceDepth) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("workspace.depth.label")}
      // 44px tall overall; the ring is inset so it takes no layout space, and
      // each segment's button IS the full 44px hit area (the pill inside it is
      // the visual).
      className={cn("inline-flex h-11 flex-none items-stretch rounded-[9px] bg-muted ring-1 ring-inset ring-input", className)}
    >
      {WORKSPACE_DEPTHS.map((value) => {
        const on = value === depth;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(value)}
            className="group flex min-h-11 min-w-11 items-stretch rounded-[9px] p-[3px] focus-visible:outline-none"
          >
            <span
              className={cn(
                "flex items-center rounded-[7px] px-2.5 text-[13px] font-semibold transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring",
                on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {t(LABEL_KEYS[value])}
            </span>
          </button>
        );
      })}
    </div>
  );
}
