/** Live audience summary at the top of the targeting inspector. */

import { Loader2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdSetTargeting } from "@shared/ad-targeting";
import { useReachEstimate } from "./useReachEstimate";

export default function ReachSummary({ targeting }: { targeting: AdSetTargeting }) {
  const { t, i18n } = useTranslation();
  const { bucket, reach, loading } = useReachEstimate(targeting);
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm"
      aria-live="polite"
    >
      <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-medium">{t(`adTargeting.bucket.${bucket}`)}</span>
      {reach != null && (
        <span className="text-muted-foreground">
          {t("adTargeting.reach.users", { count: reach, formatted: reach.toLocaleString(i18n.language) })}
        </span>
      )}
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label={t("adTargeting.reach.loading")} />}
      <span className="basis-full text-xs text-muted-foreground">{t(`adTargeting.bucketHint.${bucket}`)}</span>
    </div>
  );
}
