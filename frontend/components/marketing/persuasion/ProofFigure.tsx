// Social proof from REAL data: "12,000+ people have already built theirs."
// Self-gating — renders nothing until the live count clears the display
// floor (shared/marketing-proof.ts), so a thin number never undercuts us.

import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResumeBuilderFigure } from "@/hooks/use-marketing-proof";

interface ProofFigureProps {
  /** `ink` for the navy CTA band, `page` for light/dark page surfaces. */
  surface?: "page" | "ink";
  className?: string;
}

export function ProofFigure({ surface = "page", className }: ProofFigureProps) {
  const { t, i18n } = useTranslation();
  const figure = useResumeBuilderFigure();
  if (figure == null) return null;

  return (
    <p
      className={cn(
        "flex items-center gap-2 text-[15px]",
        surface === "ink" ? "text-ink-muted" : "text-muted-foreground",
        className,
      )}
    >
      <Users
        className={cn("h-4 w-4 flex-none", surface === "ink" ? "text-ink-positive" : "text-brand-green-text")}
        aria-hidden="true"
      />
      <span>
        {t("persuasion.proof.builders", { figure: figure.toLocaleString(i18n.language) })}
      </span>
    </p>
  );
}
