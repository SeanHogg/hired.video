/**
 * InspectorRows — an inspector's rows (A2 boards): `Label <small>hint</small> ›`,
 * full width, ≥ 44px. Simple shows the simple rows; Advanced APPENDS the
 * advanced rows under them (nothing above moves). A row opens its drill in
 * place (the host shows it with ‹ back). A dot marks what the owner changed.
 */
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { drillIdsAt, type InspectorDrillRegistry } from "./inspector-drills";

interface InspectorRowProps {
  label: string;
  hint?: string | null;
  tag?: string | null;
  changed?: boolean;
  changedLabel: string;
  onOpen: () => void;
}

export function InspectorRow({ label, hint, tag, changed, changedLabel, onOpen }: InspectorRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate">
        {label}
        {hint && <small className="ml-2 text-xs font-normal text-muted-foreground">{hint}</small>}
      </span>
      {tag && <span className="flex-none text-[11px] font-medium text-muted-foreground">{tag}</span>}
      {changed && <span className="h-2 w-2 flex-none rounded-full bg-primary" role="img" aria-label={changedLabel} />}
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

interface InspectorRowsProps<Id extends string, Ctx extends object> {
  registry: InspectorDrillRegistry<Id, Ctx>;
  ctx: Ctx;
  advanced: boolean;
  onOpen: (id: Id) => void;
  /** Names the list for assistive tech ("This line"). */
  label: string;
}

export default function InspectorRows<Id extends string, Ctx extends object>({ registry, ctx, advanced, onOpen, label }: InspectorRowsProps<Id, Ctx>) {
  const { t } = useTranslation();
  const changedLabel = t("workspace.inspector.changed");
  const group = (ids: Id[]) =>
    ids.map((id, i) => {
      const def = registry.drills[id];
      return (
        <li key={id} className={i > 0 ? "border-t border-border" : undefined}>
          <InspectorRow
            label={t(def.labelKey)}
            hint={def.hint?.(ctx, t)}
            tag={def.tagKey ? t(def.tagKey) : null}
            changed={def.isSet?.(ctx) ?? false}
            changedLabel={changedLabel}
            onOpen={() => onOpen(id)}
          />
        </li>
      );
    });
  const simple = drillIdsAt(registry, "simple");
  const more = advanced ? drillIdsAt(registry, "advanced") : [];

  return (
    <nav aria-label={label} className="overflow-hidden rounded-xl border border-border bg-card">
      {simple.length > 0 && <ul className="m-0 flex list-none flex-col p-0">{group(simple)}</ul>}
      {more.length > 0 && (
        <ul
          aria-label={t("workspace.inspector.more")}
          className={`m-0 flex list-none flex-col bg-muted/40 p-0 ${simple.length > 0 ? "border-t border-border" : ""}`}
        >
          {group(more)}
        </ul>
      )}
    </nav>
  );
}
