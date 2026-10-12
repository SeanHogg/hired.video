/**
 * Channel layout — what visitors see when a profile resolves to
 * `mode: "channel"`. Tabs (Home / Videos / Shorts / Live / Posts) are
 * self-gating per the standing DRY rule: each tab returns null when
 * its data is empty so the parent doesn't gate visibility on counts.
 *
 * Per `project_creator_persona_model.md`:
 *   - Channel = emergent surface, NOT a separate route.
 *   - YouTube-imported items merge with native videos in the catalog.
 *   - Recruiter search hits the same row whether discovered here or
 *     in resume mode.
 *   - The owner's current video pitch (#2133) leads the page via the shared
 *     self-gating <PitchCard>; the server nulls it when the owner hid the
 *     "videoResume" section (same rule as /people/:id).
 */

"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import MonoChip from "@/components/templates/MonoChip";
import { PitchCard } from "@/components/pitch/PitchPlayer";
import type {
  ChannelPayload,
  NativeVideoSummary,
  YoutubeIngest,
} from "@/lib/services/channel-service";
import { ProfileHeading } from "./ProfileHeading";

interface Props {
  data: ChannelPayload;
}

export default function ChannelLayout({ data }: Props) {
  const { t } = useTranslation();
  const tabs = visibleTabs(data, t);
  const defaultTab = tabs[0]?.id ?? "videos";

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 pb-20 pt-12">
      <ProfileHeading name={data.user.name} handle={data.user.handle}>
        <MonoChip>{t("seoLanding.profile.videoCount", { count: data.signals.publicVideoCount })}</MonoChip>
        {data.modeAuto && <MonoChip>{t("seoLanding.profile.channelModeAuto")}</MonoChip>}
      </ProfileHeading>

      <PitchCard pitch={data.pitch} />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6">
            {tab.render()}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** Self-gating tab list — each tab decides whether it has anything to
 *  show. Empty tabs aren't rendered at all. Single source of truth for
 *  "which tabs does this channel surface?" — the channel route doesn't
 *  call this; only this layout does. */
function visibleTabs(data: ChannelPayload, t: TFunction): { id: string; label: string; render: () => ReactNode }[] {
  const out: { id: string; label: string; render: () => ReactNode }[] = [];
  const allVideos = mergeVideos(data, t);
  if (allVideos.length > 0) {
    out.push({
      id: "videos",
      label: t("seoLanding.profile.videosTab", { count: allVideos.length }),
      render: () => <VideoGrid videos={allVideos} />,
    });
  }
  return out;
}

interface UnifiedVideo {
  key: string;
  title: string;
  thumbnailUrl: string | null;
  /** True for YouTube imports. Drives the click-through behaviour
   *  (open on YouTube vs play inline). */
  external: boolean;
  href: string;
}

function mergeVideos(data: ChannelPayload, t: TFunction): UnifiedVideo[] {
  const merged: UnifiedVideo[] = [];
  for (const v of data.nativeVideos) merged.push(toUnifiedNative(v, t));
  for (const y of data.youtubeIngests) merged.push(toUnifiedYoutube(y, t));
  return merged;
}

function toUnifiedNative(v: NativeVideoSummary, t: TFunction): UnifiedVideo {
  return {
    key: `native-${v.id}`,
    title: v.title ?? t("seoLanding.profile.untitledVideo"),
    thumbnailUrl: v.thumbnailUrl,
    external: false,
    href: `/videos/${v.id}`,
  };
}

function toUnifiedYoutube(y: YoutubeIngest, t: TFunction): UnifiedVideo {
  return {
    key: `yt-${y.id}`,
    title: y.title ?? t("seoLanding.profile.youtubeVideo"),
    thumbnailUrl: y.thumbnailUrl,
    external: true,
    href: y.sourceUrl,
  };
}

function VideoGrid({ videos }: { videos: UnifiedVideo[] }) {
  const { t } = useTranslation();
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
      {videos.map((v) => (
        <li key={v.key}>
          <a
            href={v.href}
            target={v.external ? "_blank" : undefined}
            rel={v.external ? "noopener noreferrer" : undefined}
            className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-card transition-colors hover:border-primary/50"
          >
            <div className="aspect-video bg-ink">
              {v.thumbnailUrl ? (
                <img src={v.thumbnailUrl} alt={v.title} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-mono text-xs uppercase text-ink-muted">
                  {t("seoLanding.profile.noThumbnail")}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 p-4">
              <h3 className="line-clamp-2 font-semibold text-foreground">{v.title}</h3>
              {v.external && <MonoChip className="self-start">YouTube</MonoChip>}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
