/**
 * Render a list of inspector sections into a collapsible accordion.
 * Reuses `LeftPanelSection` (the same primitive the left rail uses) so
 * the open/close chrome is identical between the two panels — adding a
 * fourth panel would automatically inherit the same look.
 *
 * Each section opens/closes independently and remembers its state in
 * localStorage via `useCollapsibleSections`. The `storageKey` argument
 * scopes that persistence — pass distinct keys per surface (widget vs
 * scene) so the two contexts don't fight over the same open/closed map.
 */
import { useMemo } from "react";
import { LeftPanelSection } from "../LeftPanelScroller";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import type { InspectorSection } from "./types";

/** Bumped whenever a section's `defaultOpen` flips to true and existing users
 *  (who persisted a collapsed map) should see it once. v1 reveals Container
 *  style / Radius, flipped open 2026-05-15 (#657). */
const INSPECTOR_LAYOUT_MIGRATION = 1;

export interface InspectorSectionListProps<Ctx> {
  sections: InspectorSection<Ctx>[];
  ctx: Ctx;
  storageKey: string;
}

export default function InspectorSectionList<Ctx>({
  sections,
  ctx,
  storageKey,
}: InspectorSectionListProps<Ctx>) {
  const visible = useMemo(
    () => sections.filter((s) => (s.visible ? s.visible(ctx) : true)),
    [sections, ctx],
  );
  const ids = useMemo(() => visible.map((s) => s.id), [visible]);
  const defaultOpenIds = useMemo(
    () => new Set(visible.filter((s) => s.defaultOpen).map((s) => s.id)),
    [visible],
  );
  const collapsible = useCollapsibleSections(ids, {
    storageKey,
    defaultClosed: true,
    initialOpen: defaultOpenIds,
    // One-shot reveal for sections whose `defaultOpen` was flipped to true
    // after users had already persisted a collapsed map — e.g. Container
    // style / Radius (#657). Bump INSPECTOR_LAYOUT_MIGRATION when a future
    // flip needs the same treatment.
    migrateOpen: defaultOpenIds,
    migrationVersion: INSPECTOR_LAYOUT_MIGRATION,
  });
  return (
    <>
      {visible.map((section) => (
        <LeftPanelSection
          key={section.id}
          title={section.title}
          open={collapsible.isOpen(section.id)}
          onToggle={() => collapsible.toggle(section.id)}
        >
          {section.render(ctx)}
        </LeftPanelSection>
      ))}
    </>
  );
}
