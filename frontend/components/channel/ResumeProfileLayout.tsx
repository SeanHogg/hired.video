/**
 * Resume profile layout — what visitors see when a profile resolves to
 * `mode: "resume"`. Per `project_creator_persona_model.md`, this is
 * the same data underneath; only the presentation differs.
 *
 * For now this is a thin shell that links over to the existing public
 * resume route once available. The shell exists so the dispatcher in
 * PublicProfile.tsx has somewhere to render and the channel/resume
 * split is structurally complete.
 */

"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import type { ChannelPayload } from "@/lib/services/channel-service";

interface Props {
  data: ChannelPayload;
}

export default function ResumeProfileLayout({ data }: Props) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{data.user.name}</h1>
      {data.user.handle && (
        <p className="text-sm text-muted-foreground mt-1">@{data.user.handle}</p>
      )}
      <Badge variant="outline" className="mt-3 text-[11px]">
        {data.modeAuto ? "Auto-resolved resume mode" : "Resume mode"}
      </Badge>
      <p className="mt-6 text-sm text-muted-foreground">
        Full resume profile rendering ships in the next slice — the
        channel mode dispatcher is wired and the page resolves the user
        end-to-end. For now, see the user's content via the channel
        view if they have public videos.
      </p>
    </div>
  );
}
