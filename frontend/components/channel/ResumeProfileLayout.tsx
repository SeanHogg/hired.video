/**
 * Resume profile layout — what visitors see when a profile resolves to
 * `mode: "resume"`. Per `project_creator_persona_model.md`, this is
 * the same data underneath; only the presentation differs.
 *
 * Lead is the user's primary video resume — mounted via the universal
 * <StudioVideoSurface/> so saved-but-unrendered projects play live off
 * their script (same player the editor's Preview tab uses). The API
 * orders nativeVideos desc(isProfilePrimary), desc(createdAt) so the
 * first row IS the primary when one is pinned.
 */

"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import type { ChannelPayload } from "@/lib/services/channel-service";

interface Props {
  data: ChannelPayload;
}

export default function ResumeProfileLayout({ data }: Props) {
  const primary = data.nativeVideos[0] ?? null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12 space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{data.user.name}</h1>
        {data.user.handle && (
          <p className="text-sm text-muted-foreground mt-1">@{data.user.handle}</p>
        )}
        <Badge variant="outline" className="mt-3 text-[11px]">
          {data.modeAuto ? "Auto-resolved resume mode" : "Resume mode"}
        </Badge>
      </header>

      {primary ? (
        <section>
          <StudioVideoSurface
            mode="lazy"
            videoId={primary.id}
            poster={primary.thumbnailUrl}
            title={primary.title ?? `${data.user.name}'s Video Resume`}
            autoplay
          />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.user.name} hasn't published a video resume yet.
        </p>
      )}
    </div>
  );
}
