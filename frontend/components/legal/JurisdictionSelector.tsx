/**
 * "Viewing as ..." selector for the dynamic Privacy / Terms / Cookie pages.
 *
 * Lets anyone see any jurisdiction's variant — essential for:
 *   - Legal review (compare what a California vs Quebec vs Germany user
 *     sees side-by-side without spoofing geo-IP)
 *   - Regulator inspection ("show me exactly what your CA-QC notice looks
 *     like today")
 *   - User self-service ("I'm an EU expat in the US, what would I see?")
 *
 * Source-of-truth: writes the `?as=<jurisdiction>` URL param via the hook,
 * which is the highest-priority resolver in [useUserJurisdiction](../../hooks/use-user-jurisdiction.ts).
 * Clearing the override falls back to the user's natural jurisdiction.
 */

import { useTranslation } from "react-i18next";
import {
  JURISDICTION_DISPLAY_LABELS,
  JURISDICTION_OPTIONS,
} from "@shared/jurisdictions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Globe, X } from "lucide-react";
import { useUserJurisdiction } from "@/hooks/use-user-jurisdiction";

export function JurisdictionSelector() {
  const { t } = useTranslation();
  const { jurisdiction, source, setOverride } = useUserJurisdiction();
  const isOverride = source === "url_override";

  const displayLabel = JURISDICTION_DISPLAY_LABELS[jurisdiction] ?? jurisdiction;

  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">
        {t("legal.jurisdictionSelector.viewingAs", "Viewing as:")}
      </span>
      <Select value={jurisdiction} onValueChange={(v) => setOverride(v)}>
        <SelectTrigger className="h-8 w-auto min-w-[200px]">
          <SelectValue>{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {JURISDICTION_OPTIONS.map((j) => (
            <SelectItem key={j} value={j}>
              {JURISDICTION_DISPLAY_LABELS[j] ?? j}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isOverride && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOverride(null)}
          className="h-8 px-2 text-muted-foreground"
        >
          <X className="h-3 w-3 mr-1" aria-hidden="true" />
          {t("legal.jurisdictionSelector.clearOverride", "Clear")}
        </Button>
      )}
      {!isOverride && (
        <span className="text-xs text-muted-foreground italic">
          {sourceLabel(source, t)}
        </span>
      )}
    </div>
  );
}

function sourceLabel(source: string, t: (k: string, d: string) => string): string {
  switch (source) {
    case "billing_address":
      return t("legal.jurisdictionSelector.source.billing", "(from your billing address)");
    case "geo_ip":
      return t("legal.jurisdictionSelector.source.geo", "(based on your network location)");
    case "user_declared":
      return t("legal.jurisdictionSelector.source.declared", "(from your account)");
    case "fallback":
    default:
      return t("legal.jurisdictionSelector.source.default", "(default view)");
  }
}
