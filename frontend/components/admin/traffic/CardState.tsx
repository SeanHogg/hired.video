// Loading / error / empty states shared by every Traffic card.

import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CardState({ state }: { state: "loading" | "error" | "empty" }) {
  const { t } = useTranslation();
  if (state === "loading") {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("admin.traffic.loading")}
      </p>
    );
  }
  return (
    <p className={`py-6 text-sm ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {t(state === "error" ? "admin.traffic.loadFailed" : "admin.traffic.empty")}
    </p>
  );
}
