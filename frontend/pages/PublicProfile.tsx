/**
 * Public profile route — `/u/:handle`.
 *
 * Per `project_creator_persona_model.md`, this is ONE component that
 * dispatches between the resume layout and the channel layout based on
 * the server-resolved `mode`. The dispatch is the only branch — the
 * two child layouts are self-contained.
 *
 * Per the standing DRY rule:
 *   - Mode resolution lives in `services/profile/profile-mode.ts`
 *     (server). The page never re-implements the multi-signal flip.
 *   - Layout components self-gate their tabs/sections (Videos, Shorts,
 *     etc. return null when empty rather than the parent gating).
 */

"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  channelService,
  type ChannelPayload,
} from "@/lib/services/channel-service";
import { useUgcSeo } from "@/lib/seo-ugc";
import ChannelLayout from "@/components/channel/ChannelLayout";
import ResumeProfileLayout from "@/components/channel/ResumeProfileLayout";

export default function PublicProfile() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle ?? "";

  const [data, setData] = useState<ChannelPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // SEO — single adapter call. The "channel" builder in lib/seo-ugc.ts
  // emits ProfilePage JSON-LD; falls back gracefully when the channel
  // record lacks tagline/bio/avatar (the current ChannelPayload shape).
  useUgcSeo(
    "channel",
    data ? { handle, displayName: data.user.name, mode: data.mode } : null,
  );

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setLoading(true);
    channelService
      .getByHandle(handle)
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          setData(res.data);
          setError(null);
        } else {
          setError("Channel not found");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [handle]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {error ?? "Channel not found"}
      </div>
    );
  }

  // The server returns the resolved mode; this page just dispatches.
  // Per the memory: "ONE component that switches layout based on profileMode."
  return data.mode === "channel"
    ? <ChannelLayout data={data} />
    : <ResumeProfileLayout data={data} />;
}
