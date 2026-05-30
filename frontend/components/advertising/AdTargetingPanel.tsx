/**
 * #109 — Ad-set targeting inspector panel. Renders per-dimension
 * controls + the live audience-size estimate so the buyer sees their
 * reach update on every tweak. Reads/writes the canonical
 * `AdSetTargeting` shape from [shared/ad-targeting.ts].
 *
 * Self-gates: the inspector receives `value + onChange` and decides
 * its own visible-section state from the data. No `canEdit` boolean
 * is drilled through.
 */

import { useMemo } from "react";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  estimateAudienceBucket,
  type AdSetTargeting,
} from "@shared/ad-targeting";

interface AdTargetingPanelProps {
  value: AdSetTargeting;
  onChange: (next: AdSetTargeting) => void;
}

export default function AdTargetingPanel({ value, onChange }: AdTargetingPanelProps) {
  const estimate = useMemo(() => estimateAudienceBucket(value), [value]);

  const setGeo = (geo: Partial<NonNullable<AdSetTargeting["geo"]>>) =>
    onChange({ ...value, geo: { ...value.geo, ...geo } });
  const setAttr = (attr: Partial<NonNullable<AdSetTargeting["attributes"]>>) =>
    onChange({ ...value, attributes: { ...value.attributes, ...attr } });
  const setBeh = (b: Partial<NonNullable<AdSetTargeting["behavioural"]>>) =>
    onChange({ ...value, behavioural: { ...value.behavioural, ...b } });

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium capitalize">{estimate.bucket}</span>
        <span className="text-muted-foreground">— {estimate.summary}</span>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Geography</h3>
        <Label className="text-xs">Countries (ISO codes, comma separated)</Label>
        <Input
          value={(value.geo?.countries ?? []).join(",")}
          placeholder="US, CA, GB"
          onChange={(e) =>
            setGeo({
              countries: e.target.value
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean),
            })
          }
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Attributes</h3>
        <Label className="text-xs">Required skills (comma separated)</Label>
        <Input
          value={(value.attributes?.requiredSkills ?? []).join(",")}
          placeholder="TypeScript, React"
          onChange={(e) =>
            setAttr({
              requiredSkills: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
        <div className="flex items-center gap-2 pt-1">
          <Switch
            checked={value.attributes?.openToWorkOnly ?? false}
            onCheckedChange={(checked) => setAttr({ openToWorkOnly: checked })}
            id="openToWorkOnly"
          />
          <Label htmlFor="openToWorkOnly" className="text-xs">Open-to-work only</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Min YoE</Label>
            <Input
              type="number"
              value={value.attributes?.yearsExperienceMin ?? ""}
              onChange={(e) =>
                setAttr({ yearsExperienceMin: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Max YoE</Label>
            <Input
              type="number"
              value={value.attributes?.yearsExperienceMax ?? ""}
              onChange={(e) =>
                setAttr({ yearsExperienceMax: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Behavioural</h3>
        <Label className="text-xs">Active within (days)</Label>
        <Input
          type="number"
          value={value.behavioural?.activeWithinDays ?? ""}
          placeholder="30"
          onChange={(e) =>
            setBeh({ activeWithinDays: e.target.value ? Number(e.target.value) : undefined })
          }
        />
      </section>
    </div>
  );
}
