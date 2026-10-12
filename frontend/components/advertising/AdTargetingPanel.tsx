/**
 * #109 / #1770 — Ad-set targeting inspector panel. Renders per-dimension
 * controls + the live audience estimate (local bucket instantly, server
 * reach once the spec settles) so the buyer sees their reach update on
 * every tweak. Reads/writes the canonical `AdSetTargeting` shape from
 * [shared/ad-targeting.ts].
 *
 * Sections: geography, attributes, behavioural (inline below) plus
 * device, dayparting and exclusions (targeting/*Section.tsx).
 *
 * Self-gates: the inspector receives `value + onChange` and decides
 * its own visible-section state from the data. No `canEdit` boolean
 * is drilled through.
 */

import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AdSetTargeting } from "@shared/ad-targeting";
import ReachSummary from "./targeting/ReachSummary";
import DeviceTargetingSection from "./targeting/DeviceTargetingSection";
import DaypartTargetingSection from "./targeting/DaypartTargetingSection";
import ExclusionTargetingSection from "./targeting/ExclusionTargetingSection";
import ListInput from "./targeting/ListInput";

interface AdTargetingPanelProps {
  value: AdSetTargeting;
  onChange: (next: AdSetTargeting) => void;
}

function optionalNumber(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export default function AdTargetingPanel({ value, onChange }: AdTargetingPanelProps) {
  const { t } = useTranslation();

  const setGeo = (geo: Partial<NonNullable<AdSetTargeting["geo"]>>) =>
    onChange({ ...value, geo: { ...value.geo, ...geo } });
  const setAttr = (attr: Partial<NonNullable<AdSetTargeting["attributes"]>>) =>
    onChange({ ...value, attributes: { ...value.attributes, ...attr } });
  const setBeh = (b: Partial<NonNullable<AdSetTargeting["behavioural"]>>) =>
    onChange({ ...value, behavioural: { ...value.behavioural, ...b } });

  return (
    <div className="min-w-0 space-y-5">
      <ReachSummary targeting={value} />

      <section className="space-y-2" aria-labelledby="ad-targeting-geo">
        <h3 id="ad-targeting-geo" className="text-sm font-medium">{t("adTargeting.geo.title")}</h3>
        <Label htmlFor="ad-targeting-countries" className="text-xs">{t("adTargeting.geo.countries")}</Label>
        <ListInput
          id="ad-targeting-countries"
          upper
          value={value.geo?.countries}
          placeholder={t("adTargeting.geo.countriesPlaceholder")}
          onChange={(countries) => setGeo({ countries })}
        />
      </section>

      <section className="space-y-2" aria-labelledby="ad-targeting-attributes">
        <h3 id="ad-targeting-attributes" className="text-sm font-medium">{t("adTargeting.attributes.title")}</h3>
        <Label htmlFor="ad-targeting-skills" className="text-xs">{t("adTargeting.attributes.requiredSkills")}</Label>
        <ListInput
          id="ad-targeting-skills"
          value={value.attributes?.requiredSkills}
          placeholder={t("adTargeting.attributes.requiredSkillsPlaceholder")}
          onChange={(requiredSkills) => setAttr({ requiredSkills })}
        />
        <div className="flex items-center gap-2 pt-1">
          <Switch
            checked={value.attributes?.openToWorkOnly ?? false}
            onCheckedChange={(checked) => setAttr({ openToWorkOnly: checked })}
            id="ad-targeting-open-to-work"
          />
          <Label htmlFor="ad-targeting-open-to-work" className="text-xs">{t("adTargeting.attributes.openToWorkOnly")}</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <Label htmlFor="ad-targeting-yoe-min" className="text-xs">{t("adTargeting.attributes.yoeMin")}</Label>
            <Input
              id="ad-targeting-yoe-min"
              type="number"
              min={0}
              value={value.attributes?.yearsExperienceMin ?? ""}
              onChange={(e) => setAttr({ yearsExperienceMin: optionalNumber(e.target.value) })}
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="ad-targeting-yoe-max" className="text-xs">{t("adTargeting.attributes.yoeMax")}</Label>
            <Input
              id="ad-targeting-yoe-max"
              type="number"
              min={0}
              value={value.attributes?.yearsExperienceMax ?? ""}
              onChange={(e) => setAttr({ yearsExperienceMax: optionalNumber(e.target.value) })}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="ad-targeting-behavioural">
        <h3 id="ad-targeting-behavioural" className="text-sm font-medium">{t("adTargeting.behavioural.title")}</h3>
        <Label htmlFor="ad-targeting-active" className="text-xs">{t("adTargeting.behavioural.activeWithinDays")}</Label>
        <Input
          id="ad-targeting-active"
          type="number"
          min={1}
          value={value.behavioural?.activeWithinDays ?? ""}
          placeholder="30"
          onChange={(e) => setBeh({ activeWithinDays: optionalNumber(e.target.value) })}
        />
      </section>

      <DeviceTargetingSection
        value={value.device}
        onChange={(device) => onChange({ ...value, device })}
      />
      <DaypartTargetingSection
        value={value.dayparting}
        onChange={(dayparting) => onChange({ ...value, dayparting })}
      />
      <ExclusionTargetingSection
        value={value.exclusions}
        onChange={(exclusions) => onChange({ ...value, exclusions })}
      />
    </div>
  );
}
