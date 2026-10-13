/**
 * GuestSaveWorkCard — the OPTIONAL "save your work so you can come back"
 * offer a guest sees after posting. Never a gate: the post already went out;
 * "Not now" hides it. Shows only to a silent guest session (a real account's
 * work is already theirs), so hosts render it unconditionally.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export default function GuestSaveWorkCard({ onSave }: { onSave: () => void }) {
  const { t } = useTranslation();
  const { isGuest } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  if (!isGuest || dismissed) return null;
  return (
    <section
      className="flex flex-col gap-2.5 rounded-[14px] bg-card p-4 ring-1 ring-inset ring-border"
      aria-labelledby="share-save-work-heading"
    >
      <h3 id="share-save-work-heading" className="font-display text-lg font-bold tracking-[-0.01em] text-foreground">
        {t("studio.share.saveWork.heading")}
      </h3>
      <p className="text-sm leading-normal text-muted-foreground">{t("studio.share.saveWork.body")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          className="min-h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("studio.share.saveWork.cta")}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="min-h-11 rounded-[10px] px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {t("studio.share.saveWork.notNow")}
        </button>
      </div>
    </section>
  );
}
