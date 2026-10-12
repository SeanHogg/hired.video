/**
 * Campaign list grouped by creative size (#1133) plus the List / By size
 * toggle. Outreach and Paid Media both import this so grouping lives in
 * one place — Paid Media and Outreach CampaignsTab both consume it.
 */

import { CreativeSizeMatrix } from "./CreativeSizeMatrix";
import {
  groupCampaignsBySize,
  SIZE_GROUP_LABELS,
  type PixelSize,
} from "./creative-size";

export type CampaignViewMode = "list" | "grouped";

export interface SizeAwareCampaign {
  id: string;
  name: string;
  status?: string;
  assets: PixelSize[];
}

export interface CampaignSizeViewToggleProps {
  value: CampaignViewMode;
  onChange: (next: CampaignViewMode) => void;
}

export function CampaignSizeViewToggle({ value, onChange }: CampaignSizeViewToggleProps) {
  return (
    <div role="group" aria-label="Campaign view" className="inline-flex rounded-md border text-sm overflow-hidden">
      <button
        type="button"
        aria-pressed={value === "list"}
        className={`px-3 py-1.5 ${value === "list" ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
        onClick={() => onChange("list")}
      >
        List
      </button>
      <button
        type="button"
        aria-pressed={value === "grouped"}
        className={`px-3 py-1.5 border-l ${value === "grouped" ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
        onClick={() => onChange("grouped")}
      >
        By size
      </button>
    </div>
  );
}

export interface CampaignSizeGroupedListProps {
  campaigns: SizeAwareCampaign[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function CampaignSizeGroupedList({
  campaigns,
  selectedId,
  onSelect,
}: CampaignSizeGroupedListProps) {
  if (campaigns.length === 0) {
    return <p className="text-sm text-muted-foreground">No campaigns yet.</p>;
  }

  const groups = groupCampaignsBySize(campaigns);
  return (
    <div className="space-y-6">
      {groups.map(({ group, items }) => (
        <section key={group} aria-labelledby={`size-group-${group}`}>
          <h3 id={`size-group-${group}`} className="text-sm font-medium mb-2">
            {SIZE_GROUP_LABELS[group]}{" "}
            <span className="text-muted-foreground font-normal">({items.length})</span>
          </h3>
          <ul className="space-y-2">
            {items.map((campaign) => {
              const selected = selectedId === campaign.id;
              return (
                <li key={campaign.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(campaign.id)}
                    className={`w-full text-left rounded-lg border p-3 ${
                      selected ? "bg-muted/50" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{campaign.name}</span>
                      {campaign.status ? (
                        <span className="text-xs text-muted-foreground">{campaign.status}</span>
                      ) : null}
                    </div>
                    <CreativeSizeMatrix assets={campaign.assets} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
