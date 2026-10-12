// The three promises we repeat beside every "build" call to action, word for
// word, on every page: repetition makes them familiar, and each one removes a
// reason to hesitate (cost, camera, control). All three are product facts.

import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMISE_IDS = ["free", "camera", "control"] as const;

interface ReassuranceRowProps {
  surface?: "page" | "ink";
  className?: string;
}

export function ReassuranceRow({ surface = "page", className }: ReassuranceRowProps) {
  const { t } = useTranslation();
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 text-sm",
        surface === "ink" ? "text-ink-muted" : "text-muted-foreground",
        className,
      )}
    >
      {PROMISE_IDS.map((id) => (
        <li key={id} className="flex items-center gap-1.5">
          <Check
            className={cn("h-4 w-4 flex-none", surface === "ink" ? "text-ink-positive" : "text-brand-green-text")}
            aria-hidden="true"
          />
          <span>{t(`persuasion.promise.${id}`)}</span>
        </li>
      ))}
    </ul>
  );
}
