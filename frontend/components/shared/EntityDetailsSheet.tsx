/**
 * EntityDetailsSheet — the unified "globe details" drawer. Every entity
 * page that has a Status / Metrics / Activity story drops one of these
 * in; the chrome, the [🌐 Details] trigger button, and the layout
 * decision (flat sections vs tabs) all live here so the user-facing
 * affordance can't drift again.
 *
 * Background: prior to Gap Register #1019 there were two divergent
 * implementations of this pattern — ResumeStatsSheet (flat, owns its
 * own open state, self-gates via useResumePermissions) and
 * ProjectDetailsSheet (tabbed, parent-controlled, bare Globe icon).
 * This shell unifies both:
 *
 *   • Trigger: always `[🌐 Details]` outline button (icon + label).
 *   • Open state: self-owned by default; pass `noTrigger` to render
 *     the drawer without the button (e.g. /studio landing card badge
 *     is the trigger).
 *   • Layout: pick `flat` (Resume-style: section headings stacked) or
 *     `tabs` (Project-style: underline tab strip with one section per
 *     tab). The hook is one prop — no internal heuristic, so consumers
 *     get the layout they expect.
 *   • Status chips: render INSIDE the drawer, above the section/tab
 *     body (per the 2026-05-23 design answer).
 *
 * Self-gating: when `canView` is false the trigger doesn't render —
 * consumers can drop `<EntityDetailsSheet … canView={…} />` inline
 * without their own outer gate. (DRY rule, no prop-drilled canX boolean
 * the parent could have computed itself: callers pass the result of
 * useEntityDetailsPermission(), which centralises the owner-only rule
 * for every artifact kind — recruiters/employers viewing someone else's
 * resume/profile/etc. do NOT see this drawer.)
 */

import { Globe } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import TabStrip, { type TabStripItem } from "@/components/ui/tab-strip";

export interface EntityDetailsSection<K extends string = string> {
  key: K;
  label: string;
  icon?: TabStripItem<K>["icon"];
  render: () => ReactNode;
}

interface BaseProps {
  /** Drawer title — usually the entity's display name. */
  title: string;
  /** One-line subtitle under the title. */
  subtitle?: ReactNode;
  /** Status chip row rendered above the body (visibility, ownership,
   *  active/master, etc.). Pass null to omit. */
  chips?: ReactNode;
  /** Sections. Two sections → flat; three or more, OR `layout="tabs"`,
   *  uses tabs. */
  sections: EntityDetailsSection[];
  /** Force the tab layout regardless of section count. */
  layout?: "flat" | "tabs";
  /** Whether the viewer is entitled to see the drawer. When false, the
   *  trigger doesn't render — the drawer is fully hidden. */
  canView: boolean;
  /** Sheet width override (max-w-md default for flat; max-w-2xl for tabs). */
  widthClass?: string;
  /** Right-aligned slot inside the drawer header (e.g. autosave indicator). */
  headerAside?: ReactNode;
}

interface SelfTriggeredProps extends BaseProps {
  noTrigger?: false;
}

interface ParentControlledProps extends BaseProps {
  /** Hide the built-in trigger button. Use `open` + `onOpenChange` to
   *  drive the sheet from the parent (e.g. a clickable card badge). */
  noTrigger: true;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Props = SelfTriggeredProps | ParentControlledProps;

export default function EntityDetailsSheet(props: Props) {
  const {
    title,
    subtitle,
    chips,
    sections,
    layout,
    canView,
    widthClass,
    headerAside,
  } = props;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.noTrigger ? props.open : internalOpen;
  const setOpen = props.noTrigger ? props.onOpenChange : setInternalOpen;

  const useTabs = layout === "tabs" || (layout !== "flat" && sections.length >= 3);
  const [activeTab, setActiveTab] = useState<string>(sections[0]?.key ?? "");

  if (!canView) return null;

  const widthCls =
    widthClass ?? (useTabs ? "w-full sm:max-w-2xl" : "w-full sm:max-w-md");

  return (
    <>
      {!props.noTrigger && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 gap-1"
          onClick={() => setOpen(true)}
          aria-label={`View ${title} details`}
          title="View details"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="text-xs">Details</span>
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={`${widthCls} overflow-y-auto p-0`}
        >
          <SheetHeader className="space-y-3 border-b border-border px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-lg">{title}</SheetTitle>
                {subtitle ? (
                  <SheetDescription className="mt-1">{subtitle}</SheetDescription>
                ) : (
                  <SheetDescription className="sr-only">
                    Details for {title}
                  </SheetDescription>
                )}
              </div>
              {headerAside}
            </div>
            {chips && (
              <div className="flex flex-wrap items-center gap-2">{chips}</div>
            )}
          </SheetHeader>

          {useTabs ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="px-6">
                <TabStrip
                  tabs={sections.map((s) => ({
                    key: s.key,
                    label: s.label,
                    icon: s.icon,
                  }))}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                />
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {sections.find((s) => s.key === activeTab)?.render() ?? null}
              </div>
            </div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {sections.map((s) => (
                <section key={s.key}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {s.label}
                  </h3>
                  {s.render()}
                </section>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
