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

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  channelService,
  type ChannelPayload,
} from "@/lib/services/channel-service";
import { useDefaultBreadcrumbs } from "@/lib/seo";
import { useUgcSeo } from "@/lib/seo-ugc";
import ChannelLayout from "@/components/channel/ChannelLayout";
import ResumeProfileLayout from "@/components/channel/ResumeProfileLayout";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";

export default function PublicProfile() {
  const { t } = useTranslation();
  const params = useParams<{ handle: string }>();
  const handle = params.handle ?? "";

  const [data, setData] = useState<ChannelPayload | null>(null);
  /** Server error message, or null; "not found" renders the localized copy. */
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // SEO — single adapter call. The "channel" builder in lib/seo-ugc.ts
  // emits ProfilePage JSON-LD; falls back gracefully when the channel
  // record lacks tagline/bio/avatar (the current ChannelPayload shape).
  useUgcSeo(
    "channel",
    data ? { handle, displayName: data.user.name, mode: data.mode } : null,
  );
  useDefaultBreadcrumbs();

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
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [handle]);

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={t("status.loading")} />
        </div>
      </AppShell>
    );
  }

  if (error !== null || !data) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="mx-auto flex min-h-[60vh] max-w-[36em] flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="font-display text-[clamp(32px,4vw,48px)] font-bold leading-none tracking-[-0.03em] text-foreground">
            {t("seoLanding.profile.notFound")}
          </h1>
          {error ? <p className="text-muted-foreground">{error}</p> : null}
        </div>
      </AppShell>
    );
  }

  // The server returns the resolved mode; this page just dispatches.
  // Per the memory: "ONE component that switches layout based on profileMode."
  return (
    <AppShell bgClassName="bg-background">
      {data.mode === "channel" ? <ChannelLayout data={data} /> : <ResumeProfileLayout data={data} />}
      <SeoFinalCta id="public-profile" title={t("seoLanding.profile.ctaTitle")} />
    </AppShell>
  );
}
