// /chrome-extension feature-detail band (one per lens, plus "every lens"):
// mono chip, section intro, then an auto-fit grid of IconCards.

import type { ComponentType } from "react";
import { MarketingBand, MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import IconCard from "@/components/marketing/IconCard";
import MonoChip from "@/components/templates/MonoChip";

export interface ExtensionDetailItem {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}

interface Props {
  tone: "page" | "card";
  /** Section anchor (e.g. "recruiter") so lens cards and other pages can link here. */
  anchorId?: string;
  id: string;
  chip: string;
  title: string;
  subtitle: string;
  items: ExtensionDetailItem[];
}

export default function ExtensionDetailBand({ tone, anchorId, id, chip, title, subtitle, items }: Props) {
  return (
    <MarketingBand tone={tone} id={anchorId} labelledBy={id} className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <MonoChip className="self-start">{chip}</MonoChip>
        <MarketingSectionIntro id={id} title={title} subtitle={subtitle} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
        {items.map((d) => (
          <IconCard key={d.id} icon={d.icon} title={d.title} body={d.desc} />
        ))}
      </div>
    </MarketingBand>
  );
}
