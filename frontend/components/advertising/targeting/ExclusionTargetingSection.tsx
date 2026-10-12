/** Exclusions panel (#1770) — reads/writes `AdSetTargeting.exclusions`. */

import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import type { ExclusionTargeting } from "@shared/ad-targeting";
import ListInput from "./ListInput";

interface Props {
  value: ExclusionTargeting | undefined;
  onChange: (next: ExclusionTargeting | undefined) => void;
}

type ListKey = keyof ExclusionTargeting;

const FIELDS: ReadonlyArray<{ key: ListKey; upper: boolean }> = [
  { key: "excludeCountries", upper: true },
  { key: "excludeApplicantsOfJobIds", upper: false },
  { key: "excludeEmployeesOfCompanyIds", upper: false },
];

export default function ExclusionTargetingSection({ value, onChange }: Props) {
  const { t } = useTranslation();

  const setList = (key: ListKey, list: string[]) => {
    const next: ExclusionTargeting = { ...value, [key]: list.length ? list : undefined };
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => Array.isArray(v) && v.length));
    onChange(Object.keys(kept).length ? (kept as ExclusionTargeting) : undefined);
  };

  return (
    <section className="space-y-3" aria-labelledby="ad-targeting-exclusions">
      <h3 id="ad-targeting-exclusions" className="text-sm font-medium">{t("adTargeting.exclusions.title")}</h3>
      {FIELDS.map(({ key, upper }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`ad-targeting-${key}`} className="text-xs">{t(`adTargeting.exclusions.${key}`)}</Label>
          <ListInput
            id={`ad-targeting-${key}`}
            upper={upper}
            value={value?.[key]}
            placeholder={t(`adTargeting.exclusions.${key}Placeholder`)}
            onChange={(list) => setList(key, list)}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t("adTargeting.exclusions.hint")}</p>
    </section>
  );
}
