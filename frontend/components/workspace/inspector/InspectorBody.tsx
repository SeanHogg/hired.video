/**
 * InspectorBody — what an inspector shows in the right slot: its rows
 * (InspectorRows), or the open drill's View in their place. `before` /
 * `after` frame the rows only (a read-only note, a closing hint). The slot
 * header for either state comes from drillSlotHeader.
 */
import { createElement, type Attributes, type ReactNode } from "react";
import type { TFunction } from "i18next";
import type { SlotPanel } from "@/components/workspace/RightSlot";
import type { InspectorDrillRegistry } from "./inspector-drills";
import InspectorRows from "./InspectorRows";

interface InspectorBodyProps<Id extends string, Ctx extends object> {
  registry: InspectorDrillRegistry<Id, Ctx>;
  ctx: Ctx;
  advanced: boolean;
  drill: Id | null;
  onOpen: (id: Id) => void;
  /** Names the rows for assistive tech. */
  label: string;
  before?: ReactNode;
  after?: ReactNode;
}

export default function InspectorBody<Id extends string, Ctx extends object>({
  registry,
  ctx,
  advanced,
  drill,
  onOpen,
  label,
  before,
  after,
}: InspectorBodyProps<Id, Ctx>) {
  if (drill) {
    const { View } = registry.drills[drill];
    return createElement(View, { ...ctx, key: drill } as Ctx & Attributes);
  }
  return (
    <>
      {before}
      <InspectorRows registry={registry} ctx={ctx} advanced={advanced} onOpen={onOpen} label={label} />
      {after}
    </>
  );
}

interface HeaderArgs<Id extends string, Ctx extends object> {
  t: TFunction;
  registry: InspectorDrillRegistry<Id, Ctx>;
  drill: Id | null;
  onBack: () => void;
  /** The inspector's eyebrow ("This line") and title ("Experience · CIO"). */
  kicker: string;
  title: string;
}

/**
 * The slot header (A2 boards): the rows show the inspector's kicker and
 * title; a drill shows its own label under the inspector's title, with ‹
 * back to the rows. Pure.
 */
export function drillSlotHeader<Id extends string, Ctx extends object>({
  t,
  registry,
  drill,
  onBack,
  kicker,
  title,
}: HeaderArgs<Id, Ctx>): Pick<SlotPanel, "kicker" | "title" | "onBack"> {
  return slotHeader({ kicker, title, drillTitle: drill ? t(registry.drills[drill].labelKey) : null, onBack });
}

/**
 * The same header from a drill's title (null = the rows): the studio's
 * inspector, whose drills are its sections (useSectionDrill). Pure.
 */
export function slotHeader({
  kicker,
  title,
  drillTitle,
  onBack,
}: {
  kicker: string;
  title: string;
  drillTitle: string | null;
  onBack: () => void;
}): Pick<SlotPanel, "kicker" | "title" | "onBack"> {
  if (drillTitle === null) return { kicker, title };
  return { kicker: title, title: drillTitle, onBack };
}
