/** "That's another résumé, not a job post. What should I do with it?" + the
 *  intents for what was attached. A typed intent skips this question. */
import { useTranslation } from "react-i18next";
import type { ReviewIntake } from "@/lib/build/review/use-review-intake";
import ConversationBubble from "../ConversationBubble";

export default function IntentChips({ intake }: { intake: ReviewIntake }) {
  const { t } = useTranslation();
  const pending = intake.pending;
  if (!pending) return null;
  return (
    <>
      <ConversationBubble from="user">{pending.name}</ConversationBubble>
      <ConversationBubble from="assistant">{t(`review.intake.ask.${pending.kind}`)}</ConversationBubble>
      <ul className="flex flex-wrap gap-1.5" aria-label={t("review.intake.choices")}>
        {intake.intents.map((intent, i) => (
          <li key={intent}>
            <button
              type="button"
              onClick={() => intake.choose(intent)}
              className={
                i === 0
                  ? "min-h-11 rounded-full border border-foreground bg-foreground px-3 text-[13px] text-background sm:min-h-9"
                  : "min-h-11 rounded-full border border-border bg-card px-3 text-[13px] text-foreground hover:bg-muted sm:min-h-9"
              }
            >
              {t(`review.intent.${intent}`)}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={intake.dismiss}
            className="min-h-11 rounded-full px-3 text-[13px] text-muted-foreground hover:bg-muted sm:min-h-9"
          >
            {t("actions.cancel")}
          </button>
        </li>
      </ul>
    </>
  );
}
