/**
 * WorkspaceLeftPanel — the frame's left region: a vertical tool rail
 * (registry order; Advanced tools appended BELOW the others) beside the open
 * tool's panel, 450px in all. The host supplies each tool's content (or null
 * → the tool greys out in place: tools never hide); this owns only the rail
 * chrome and where the content shows.
 *
 *   wide (lg+)  rail + panel side by side, the panel titled by a mono kicker.
 *   phones      a full-width bottom bar of the Simple tools, plus one
 *               "More" cell under Advanced (it lists Scenes · Elements ·
 *               Layers); a tool opens as a bottom sheet (PhoneSheet).
 *
 * Every panel stays mounted (hidden when inactive) so a chat thread, a
 * recorder or a scroll position survives switching tools. Content renders
 * in ONE place at a time (the column or the sheet), never twice.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import IconTabBar, { iconTabId, iconTabPanelId } from "@/components/ui/icon-tab-bar";
import { useIsWideWorkspace } from "@/hooks/use-media-query";
import { RAIL_TOOLS, RAIL_WIDTH_PX, type RailToolId } from "@/lib/workspace/workspace-panels";
import { cn } from "@/lib/utils";
import PhoneSheet from "./PhoneSheet";

export interface WorkspaceTool {
  id: RailToolId;
  /** Accessible name + tooltip (already translated; a format may rename,
   *  e.g. Sections → Levels for a game). */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Null → greyed out on this page / for this format. */
  content: ReactNode | null;
  /** Why it is greyed out (tooltip, already translated). */
  disabledHint?: string;
}

interface WorkspaceLeftPanelProps {
  tools: readonly WorkspaceTool[];
  active: RailToolId;
  onChange: (id: RailToolId) => void;
  /** Phones: the tool sheet is open (useLeftSheet keeps it apart from the
   *  right slot's sheet — only one shows). */
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  /** Unique per page (tab / panel ids). */
  idPrefix: string;
}

const ADVANCED_IDS = new Set(RAIL_TOOLS.filter((tool) => tool.depth === "advanced").map((tool) => tool.id));
const MORE_KEY = "more";

export default function WorkspaceLeftPanel({
  tools,
  active,
  onChange,
  sheetOpen,
  onSheetOpenChange,
  idPrefix,
}: WorkspaceLeftPanelProps) {
  const { t } = useTranslation();
  const wide = useIsWideWorkspace();
  const [pickingMore, setPickingMore] = useState(false);
  const usable = tools.filter((tool) => tool.content !== null);
  const current = usable.some((tool) => tool.id === active) ? active : (usable[0]?.id ?? active);
  const currentTool = tools.find((tool) => tool.id === current);
  const toTab = ({ id, label, icon, content, disabledHint }: WorkspaceTool) => ({
    key: id,
    label,
    icon,
    disabled: content === null,
    disabledHint: disabledHint ?? t("workspace.tool.notHere", { tool: label }),
  });

  const panels = tools.map(({ id, content }) =>
    content === null ? null : (
      <div
        key={id}
        id={iconTabPanelId(idPrefix, id)}
        role="tabpanel"
        aria-labelledby={iconTabId(idPrefix, id)}
        hidden={current !== id || pickingMore}
        className={cn("relative min-h-0 flex-1 flex-col overflow-y-auto", current === id && !pickingMore ? "flex" : "hidden")}
      >
        {content}
      </div>
    ),
  );

  if (wide) {
    return (
      <div data-region="rail" style={{ width: RAIL_WIDTH_PX }} className="flex min-w-0 flex-none border-r border-border bg-card">
        <IconTabBar
          tabs={tools.map(toTab)}
          active={current}
          onChange={onChange}
          ariaLabel={t("workspace.tool.label")}
          idPrefix={idPrefix}
          variant="rail"
          className="w-14 flex-none"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-none px-3.5 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {currentTool?.label}
          </div>
          {panels}
        </div>
      </div>
    );
  }

  // Phones: the Simple tools across the bar; Advanced ones behind "More".
  const simple = tools.filter((tool) => !ADVANCED_IDS.has(tool.id));
  const advanced = tools.filter((tool) => ADVANCED_IDS.has(tool.id));
  const barTabs = [
    ...simple.map(toTab),
    ...(advanced.length > 0 ? [{ key: MORE_KEY, label: t("workspace.tool.more"), icon: MoreHorizontal }] : []),
  ];
  const barActive = !sheetOpen ? null : pickingMore || ADVANCED_IDS.has(current) ? MORE_KEY : current;
  const close = () => {
    setPickingMore(false);
    onSheetOpenChange(false);
  };

  return (
    <>
      <PhoneSheet
        open={sheetOpen}
        onClose={close}
        aboveBar
        kicker={pickingMore ? undefined : t("workspace.tool.label")}
        title={pickingMore ? t("workspace.tool.more") : (currentTool?.label ?? "")}
      >
        {pickingMore && (
          <div className="flex flex-col gap-1 p-2">
            {advanced.map(({ id, label, icon: Icon, content }) => (
              <button
                key={id}
                type="button"
                disabled={content === null}
                onClick={() => {
                  setPickingMore(false);
                  onChange(id);
                }}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
              >
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}
        {panels}
      </PhoneSheet>
      <nav data-region="rail" aria-label={t("workspace.tool.label")} className="fixed inset-x-0 bottom-0 z-40 bg-card pb-[env(safe-area-inset-bottom)]">
        <IconTabBar
          tabs={barTabs}
          active={barActive}
          onChange={(key) => {
            if (key === MORE_KEY) {
              setPickingMore(true);
              onSheetOpenChange(true);
              return;
            }
            if (sheetOpen && key === current && !pickingMore) {
              close();
              return;
            }
            setPickingMore(false);
            onChange(key as RailToolId);
            onSheetOpenChange(true);
          }}
          ariaLabel={t("workspace.tool.label")}
          idPrefix={`${idPrefix}-bar`}
          variant="bar"
        />
      </nav>
    </>
  );
}
