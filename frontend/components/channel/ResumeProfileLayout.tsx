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
 *
 * The owner's current video pitch (#2133) follows in the shared
 * <PitchCard>, which self-gates; the server already nulls it when the
 * owner hid the "videoResume" section (same rule as /people/:id).
 */

"use client";

import { useTranslation } from "react-i18next";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import MonoChip from "@/components/templates/MonoChip";
import { PitchCard } from "@/components/pitch/PitchPlayer";
import type { ChannelPayload } from "@/lib/services/channel-service";
import { ProfileHeading } from "./ProfileHeading";

interface Props {
  data: ChannelPayload;
}

export default function ResumeProfileLayout({ data }: Props) {
  const { t } = useTranslation();
  const primary = data.nativeVideos[0] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-6 pb-20 pt-12">
      <ProfileHeading name={data.user.name} handle={data.user.handle}>
        <MonoChip>{data.modeAuto ? t("seoLanding.profile.resumeModeAuto") : t("seoLanding.profile.resumeMode")}</MonoChip>
      </ProfileHeading>

      {primary ? (
        <section className="overflow-hidden rounded-[20px] bg-ink">
          <StudioVideoSurface
            mode="lazy"
            videoId={primary.id}
            poster={primary.thumbnailUrl}
            title={primary.title ?? t("seoLanding.profile.videoResumeOf", { name: data.user.name })}
            autoplay
          />
        </section>
      ) : data.pitch ? null : (
        <p className="text-muted-foreground">{t("seoLanding.profile.noVideo", { name: data.user.name })}</p>
      )}

      <PitchCard pitch={data.pitch} />
    </div>
  );
}
