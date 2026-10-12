// Row of headline figures for an app page's signed-out pitch. Mono numerals in
// the brand blue, muted caption underneath; wraps 2-up on phones.

import { cn } from "@/lib/utils";

export interface StatItem {
  value: string;
  label: string;
}

export function StatRow({ stats, className }: { stats: StatItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-border bg-border md:grid-cols-4",
        className,
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-1.5 bg-card p-5">
          <dt className="order-2 text-sm text-muted-foreground">{s.label}</dt>
          <dd className="order-1 font-display text-3xl font-bold tracking-[-0.03em] text-primary">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default StatRow;
