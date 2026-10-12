// One /security control group as a marketing band: icon + section intro,
// then a grid of control cards (status chip + standards references).

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import { STATUS_META, type Control, type SectionDef, type Status } from "./security-controls";

export function StatusChip({ status }: { status: Status }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-[3px] font-mono text-[11px] uppercase leading-tight",
        meta.chipClass,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t(meta.labelKey)}
    </span>
  );
}

function ControlCard({ control }: { control: Control }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-[20px] border border-border p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-bold leading-tight tracking-[-0.01em] text-foreground">
          {control.title}
        </h3>
        <StatusChip status={control.status} />
      </div>
      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{control.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {control.refs.map((r) => (
          <MonoChip key={r} className="normal-case">
            {r}
          </MonoChip>
        ))}
      </div>
    </div>
  );
}

export default function SecurityControlSection({ section, tone }: { section: SectionDef; tone: "page" | "card" }) {
  const Icon = section.icon;
  const headingId = `security-${section.id}-heading`;
  return (
    <MarketingBand id={section.id} tone={tone} labelledBy={headingId} className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
          <Icon className="h-6 w-6" />
        </span>
        <MarketingSectionIntro id={headingId} title={section.title} subtitle={section.description} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
        {section.controls.map((c) => (
          <ControlCard key={c.title} control={c} />
        ))}
      </div>
    </MarketingBand>
  );
}
