/** Device panel (#1770) — reads/writes `AdSetTargeting.device`. None
 *  selected = every device. */

import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DEVICE_PLATFORMS, type DeviceTargeting, type DevicePlatform } from "@shared/ad-targeting";

interface Props {
  value: DeviceTargeting | undefined;
  onChange: (next: DeviceTargeting | undefined) => void;
}

export default function DeviceTargetingSection({ value, onChange }: Props) {
  const { t } = useTranslation();
  const selected = value?.platforms ?? [];
  return (
    <section className="space-y-2" aria-labelledby="ad-targeting-device">
      <h3 id="ad-targeting-device" className="text-sm font-medium">{t("adTargeting.device.title")}</h3>
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        className="flex-wrap justify-start"
        value={selected}
        onValueChange={(next: string[]) => {
          const platforms = DEVICE_PLATFORMS.filter((p) => next.includes(p)) as DevicePlatform[];
          onChange(platforms.length ? { platforms } : undefined);
        }}
      >
        {DEVICE_PLATFORMS.map((p) => (
          <ToggleGroupItem key={p} value={p}>{t(`adTargeting.device.${p}`)}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        {selected.length ? t("adTargeting.device.selectedHint") : t("adTargeting.device.allHint")}
      </p>
    </section>
  );
}
