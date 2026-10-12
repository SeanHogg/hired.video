import { useTranslation } from "react-i18next";
import { ArrowRight, Crosshair, MessagesSquare } from "lucide-react";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";

/**
 * After a kit's video is posted (Posted board, "What's next"): aim the same
 * résumé and video at another job (back to Target), or practise for the
 * interview with the coach. One click each, inside the workspace.
 */
export default function KitWhatsNext({ kit }: { kit: KitWorkspace }) {
  const { t } = useTranslation();
  const steps = [
    { id: "aim", icon: Crosshair, onClick: () => kit.nav.goToStage("target") },
    { id: "practise", icon: MessagesSquare, onClick: () => kit.journey.openTool("interview-questions") },
  ] as const;
  return (
    <section aria-labelledby="kit-whats-next" className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 id="kit-whats-next" className="text-sm font-semibold text-foreground">{t("workspace.next.title")}</h3>
      <ul className="flex flex-col gap-1.5">
        {steps.map(({ id, icon: Icon, onClick }) => (
          <li key={id}>
            <button
              type="button"
              onClick={onClick}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-[12px] border border-border bg-card px-3 text-left hover:bg-muted"
            >
              <Icon className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{t(`workspace.next.${id}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`workspace.next.${id}Hint`)}</span>
              </span>
              <ArrowRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
