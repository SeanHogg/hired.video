/**
 * TikTokPostSettingsForm — the TikTok choices shown in the Post dock while
 * TikTok is picked, laid out the way TikTok's Content Sharing Guidelines
 * require for Direct Post apps:
 *
 *   • which account the video goes to (creator nickname + avatar);
 *   • who can see it — the creator's own options, nothing pre-selected;
 *   • comments / Duet / Stitch — off until turned on, greyed out when the
 *     account disables them;
 *   • commercial-content disclosure (Your brand / Branded content) with the
 *     label TikTok will add, and branded content never private;
 *   • the Music Usage (and Branded Content Policy) consent line.
 *
 * State comes from `useTikTokPostSettings` (owned by the panel, which needs
 * `ready` to enable posting).
 */
import { Loader2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TIKTOK_PRIVATE_LEVEL, type TikTokPostSettings } from "@shared/tiktok-post-settings";
import type { TikTokPostSettingsState } from "./useTikTokPostSettings";

const MUSIC_USAGE_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED_CONTENT_POLICY_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/** TikTok privacy level → label key. Unknown future levels show their raw id. */
const PRIVACY_LABEL_KEYS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "studio.share.tiktok.privacy.everyone",
  MUTUAL_FOLLOW_FRIENDS: "studio.share.tiktok.privacy.friends",
  FOLLOWER_OF_CREATOR: "studio.share.tiktok.privacy.followers",
  SELF_ONLY: "studio.share.tiktok.privacy.onlyMe",
};

type InteractionKey = "allowComment" | "allowDuet" | "allowStitch";

const INTERACTIONS: ReadonlyArray<{ key: InteractionKey; labelKey: string; disabledBy: "commentDisabled" | "duetDisabled" | "stitchDisabled" }> = [
  { key: "allowComment", labelKey: "studio.share.tiktok.allowComment", disabledBy: "commentDisabled" },
  { key: "allowDuet", labelKey: "studio.share.tiktok.allowDuet", disabledBy: "duetDisabled" },
  { key: "allowStitch", labelKey: "studio.share.tiktok.allowStitch", disabledBy: "stitchDisabled" },
];

const linkClass = "font-medium text-primary hover:underline";

export interface TikTokPostSettingsFormProps {
  state: TikTokPostSettingsState;
  disabled: boolean;
}

export default function TikTokPostSettingsForm({ state, disabled }: TikTokPostSettingsFormProps) {
  const { t } = useTranslation();
  const { creator, settings, update } = state;

  if (state.isLoading) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-border p-3 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("studio.share.tiktok.loading")}
      </section>
    );
  }
  if (!creator) {
    return (
      <section className="rounded-xl border border-border p-3 text-[13px] text-destructive">
        {t("studio.share.tiktok.loadFailed")}
      </section>
    );
  }

  const branded = settings.discloseContent && settings.brandedContent;
  const set = (patch: Partial<TikTokPostSettings>) => update(patch);

  return (
    <section
      aria-label={t("studio.share.tiktok.title")}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 text-[13px] text-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        {creator.avatarUrl && (
          <img src={creator.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
        )}
        <p className="min-w-0 truncate">
          {t("studio.share.tiktok.postingAs", { name: creator.nickname || creator.username || "TikTok" })}
        </p>
      </div>

      {state.problem === "tooLong" && creator.maxVideoPostDurationSec !== null && (
        <p role="alert" className="text-destructive">
          {t("studio.share.tiktok.tooLong", { max: creator.maxVideoPostDurationSec })}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="tiktok-privacy" className="text-muted-foreground">
          {t("studio.share.tiktok.privacyLabel")}
        </label>
        <select
          id="tiktok-privacy"
          value={settings.privacyLevel}
          disabled={disabled}
          onChange={(e) => set({ privacyLevel: e.target.value })}
          className="min-h-10 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60"
        >
          <option value="" disabled>
            {t("studio.share.tiktok.privacyPlaceholder")}
          </option>
          {creator.privacyLevelOptions.map((level) => (
            <option key={level} value={level} disabled={branded && level === TIKTOK_PRIVATE_LEVEL}>
              {PRIVACY_LABEL_KEYS[level] ? t(PRIVACY_LABEL_KEYS[level]) : level}
            </option>
          ))}
        </select>
        {branded && <p className="text-muted-foreground">{t("studio.share.tiktok.brandedNotPrivate")}</p>}
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-muted-foreground">{t("studio.share.tiktok.allowUsers")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {INTERACTIONS.map(({ key, labelKey, disabledBy }) => {
            const off = creator[disabledBy];
            return (
              <label key={key} className={`flex min-h-9 items-center gap-2${off ? " opacity-50" : ""}`}>
                <Checkbox
                  checked={!off && settings[key]}
                  disabled={disabled || off}
                  onCheckedChange={(v) => set({ [key]: v === true })}
                />
                {t(labelKey)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="flex min-h-9 items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span>{t("studio.share.tiktok.disclose")}</span>
            <span className="text-muted-foreground">{t("studio.share.tiktok.discloseHint")}</span>
          </span>
          <Switch
            checked={settings.discloseContent}
            disabled={disabled}
            onCheckedChange={(v) => set({ discloseContent: v, ...(v ? {} : { yourBrand: false, brandedContent: false }) })}
          />
        </label>
        {settings.discloseContent && (
          <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
            <label className="flex items-start gap-2">
              <Checkbox
                className="mt-0.5"
                checked={settings.yourBrand}
                disabled={disabled}
                onCheckedChange={(v) => set({ yourBrand: v === true })}
              />
              <span className="flex flex-col gap-0.5">
                <span>{t("studio.share.tiktok.yourBrand")}</span>
                <span className="text-muted-foreground">{t("studio.share.tiktok.yourBrandHint")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <Checkbox
                className="mt-0.5"
                checked={settings.brandedContent}
                disabled={disabled || settings.privacyLevel === TIKTOK_PRIVATE_LEVEL}
                onCheckedChange={(v) => set({ brandedContent: v === true })}
              />
              <span className="flex flex-col gap-0.5">
                <span>{t("studio.share.tiktok.brandedContent")}</span>
                <span className="text-muted-foreground">
                  {settings.privacyLevel === TIKTOK_PRIVATE_LEVEL
                    ? t("studio.share.tiktok.brandedNotPrivate")
                    : t("studio.share.tiktok.brandedContentHint")}
                </span>
              </span>
            </label>
            <p className={state.problem === "disclosure" ? "text-destructive" : "text-muted-foreground"}>
              {state.problem === "disclosure"
                ? t("studio.share.tiktok.discloseChoose")
                : branded
                  ? t("studio.share.tiktok.labelPaidPartnership")
                  : t("studio.share.tiktok.labelPromotional")}
            </p>
          </div>
        )}
      </div>

      <p className="text-muted-foreground">
        {branded ? (
          <Trans
            i18nKey="studio.share.tiktok.consentBranded"
            components={{
              music: <a className={linkClass} href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer" />,
              policy: <a className={linkClass} href={BRANDED_CONTENT_POLICY_URL} target="_blank" rel="noreferrer" />,
            }}
          />
        ) : (
          <Trans
            i18nKey="studio.share.tiktok.consent"
            components={{ music: <a className={linkClass} href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer" /> }}
          />
        )}{" "}
        {t("studio.share.tiktok.processingNote")}
      </p>
    </section>
  );
}
