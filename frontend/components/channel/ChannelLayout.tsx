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
 */

"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  ChannelPayload,
  NativeVideoSummary,
  YoutubeIngest,
} from "@/lib/services/channel-service";

interface Props {
  data: ChannelPayload;
}

export default function ChannelLayout({ data }: Props) {
  const tabs = visibleTabs(data);
  const defaultTab = tabs[0]?.id ?? "videos";

  return (
    <div className="min-h-screen bg-background">
      {/* Channel header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold">{data.user.name}</h1>
          {data.user.handle && (
            <p className="text-sm text-muted-foreground mt-1">@{data.user.handle}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[11px]">
              {data.signals.publicVideoCount} {data.signals.publicVideoCount === 1 ? "video" : "videos"}
            </Badge>
            {data.modeAuto && (
              <Badge variant="outline" className="text-[11px]">
                Auto-resolved channel mode
              </Badge>
            )}
          </div>
        </div>
      </header>

      <Tabs defaultValue={defaultTab} className="container mx-auto px-4 py-6">
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
function visibleTabs(data: ChannelPayload): { id: string; label: string; render: () => React.ReactNode }[] {
  const out: { id: string; label: string; render: () => React.ReactNode }[] = [];
  const allVideos = mergeVideos(data);
  if (allVideos.length > 0) {
    out.push({
      id: "videos",
      label: `Videos · ${allVideos.length}`,
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

function mergeVideos(data: ChannelPayload): UnifiedVideo[] {
  const merged: UnifiedVideo[] = [];
  for (const v of data.nativeVideos) merged.push(toUnifiedNative(v));
  for (const y of data.youtubeIngests) merged.push(toUnifiedYoutube(y));
  return merged;
}

function toUnifiedNative(v: NativeVideoSummary): UnifiedVideo {
  return {
    key: `native-${v.id}`,
    title: v.title ?? "Untitled video",
    thumbnailUrl: v.thumbnailUrl,
    external: false,
    href: `/videos/${v.id}`,
  };
}

function toUnifiedYoutube(y: YoutubeIngest): UnifiedVideo {
  return {
    key: `yt-${y.id}`,
    title: y.title ?? "YouTube video",
    thumbnailUrl: y.thumbnailUrl,
    external: true,
    href: y.sourceUrl,
  };
}

function VideoGrid({ videos }: { videos: UnifiedVideo[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <a
          key={v.key}
          href={v.href}
          target={v.external ? "_blank" : undefined}
          rel={v.external ? "noopener noreferrer" : undefined}
          className="group rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow"
        >
          <div className="aspect-video bg-muted">
            {v.thumbnailUrl ? (
              <img
                src={v.thumbnailUrl}
                alt={v.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                No thumbnail
              </div>
            )}
          </div>
          <div className="p-3">
            <div className="font-medium text-sm line-clamp-2">{v.title}</div>
            {v.external && (
              <Badge variant="outline" className="text-[10px] mt-2">YouTube</Badge>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
