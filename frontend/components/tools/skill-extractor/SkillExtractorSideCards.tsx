// Static cards for /tools/skill-extractor: the "Free — no Pro required"
// note under the input card, and the empty-state card shown in the
// results column before the first extraction.

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function SkillExtractorFreeCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-brand-green/15 font-mono uppercase tracking-[0.08em] text-brand-green-text">
            {t("labels.free")}
          </Badge>
          <span className="font-medium text-foreground">
            {t("skillExtractor.noProRequired")}
          </span>
        </div>
        <p>{t("skillExtractor.freeBlurb")}</p>
      </CardContent>
    </Card>
  );
}

export function SkillExtractorEmptyStateCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-semibold mb-2">{t("skillExtractor.readyTitle")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("skillExtractor.readyBlurb")}
        </p>

        <div className="text-left bg-muted rounded-xl p-4 mt-4">
          <h4 className="font-medium mb-2">{t("headings.whatYoullGet")}</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• {t("skillExtractor.benefit.grouped")}</li>
            <li>• {t("skillExtractor.benefit.deduped")}</li>
            <li>• {t("skillExtractor.benefit.importance")}</li>
            <li>• {t("skillExtractor.benefit.copyable")}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
