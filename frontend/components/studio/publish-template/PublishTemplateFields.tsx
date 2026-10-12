/**
 * The publish-template sheet's field sections — presentational only; all
 * state and rules live in usePublishTemplateForm.
 */
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MediaPicker from "@/components/shared/MediaPicker";
import type { MediaKind } from "@shared/media-kinds";
import { mediaKindLabelKey } from "@shared/template-kinds";
import {
  CREATOR_SHARE_PCT,
  PRICE_MAX_DOLLARS,
  PRICE_MIN_DOLLARS,
  type PublishTemplateForm,
  type TemplateVisibility,
} from "./usePublishTemplateForm";

type Fields = PublishTemplateForm["fields"];

const NOTE = "rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground";
const HELP = "mt-1 text-xs text-muted-foreground";

/** Read-only "publishing as a {kind} template" line — hidden for video. */
export function KindNote({ mediaKind }: { mediaKind: MediaKind }) {
  const { t } = useTranslation();
  if (mediaKind === "video") return null;
  return <div className={NOTE}>{t("publishTemplate.kindNote", { kind: t(mediaKindLabelKey(mediaKind)) })}</div>;
}

export function NameDescriptionFields({ fields }: { fields: Fields }) {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <Label htmlFor="tpl-name">{t("publishTemplate.nameLabel")}</Label>
        <Input
          id="tpl-name"
          value={fields.name}
          onChange={(e) => fields.setName(e.target.value)}
          placeholder={t("publishTemplate.namePlaceholder")}
          maxLength={200}
          required
        />
      </div>
      <div>
        <Label htmlFor="tpl-desc">{t("publishTemplate.descriptionLabel")}</Label>
        <Textarea
          id="tpl-desc"
          value={fields.description}
          onChange={(e) => fields.setDescription(e.target.value)}
          placeholder={t("publishTemplate.descriptionPlaceholder")}
          maxLength={4000}
          rows={3}
        />
      </div>
    </>
  );
}

interface ThumbnailProps {
  fields: Fields;
  canCapture: boolean;
  capturing: boolean;
  onCapture: () => void;
}

export function ThumbnailField({ fields, canCapture, capturing, onCapture }: ThumbnailProps) {
  const { t } = useTranslation();
  const { thumbnailUrl, setThumbnailUrl } = fields;
  return (
    <div>
      <Label>{t("publishTemplate.thumbnailLabel")}</Label>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {thumbnailUrl ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border bg-muted">
            <img
              src={thumbnailUrl}
              alt={t("publishTemplate.thumbnailAlt")}
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
            <button
              type="button"
              aria-label={t("publishTemplate.removeThumbnail")}
              onClick={() => setThumbnailUrl(null)}
              className="absolute right-0.5 top-0.5 rounded-full border bg-background/80 p-0.5 hover:bg-background"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/30 text-muted-foreground">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <MediaPicker
              accept="image"
              title={t("publishTemplate.chooseThumbnailTitle")}
              triggerLabel={thumbnailUrl ? t("publishTemplate.changeImage") : t("publishTemplate.chooseImage")}
              onPick={(asset) => setThumbnailUrl(asset.url)}
            />
            {/* Only V2 callers pass a capture fn (#854). */}
            {canCapture && (
              <Button type="button" variant="outline" size="sm" onClick={onCapture} disabled={capturing}>
                {capturing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t("publishTemplate.useCurrentFrame")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("publishTemplate.thumbnailHelp")}</p>
        </div>
      </div>
    </div>
  );
}

export function PriceVisibilityFields({ fields, isTemplateCreator }: { fields: Fields; isTemplateCreator: boolean }) {
  const { t } = useTranslation();
  const price = Number(fields.priceDollars);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="tpl-price">{t("publishTemplate.priceLabel")}</Label>
        <Input
          id="tpl-price"
          type="number"
          inputMode="decimal"
          min={PRICE_MIN_DOLLARS}
          max={PRICE_MAX_DOLLARS}
          step="0.01"
          value={fields.priceDollars}
          onChange={(e) => fields.setPriceDollars(e.target.value)}
        />
        <p className={HELP}>
          {price <= 0
            ? t("publishTemplate.priceFree")
            : t("publishTemplate.priceEarn", { amount: (price * (CREATOR_SHARE_PCT / 100)).toFixed(2) })}
        </p>
      </div>
      <div>
        <Label htmlFor="tpl-vis">{t("publishTemplate.visibilityLabel")}</Label>
        <select
          id="tpl-vis"
          value={fields.visibility}
          onChange={(e) => fields.setVisibility(e.target.value as TemplateVisibility)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="private">{t("publishTemplate.visibilityPrivate")}</option>
          <option value="unlisted">{t("publishTemplate.visibilityUnlisted")}</option>
          {/* Selling on the marketplace needs the Templates creator program. */}
          {isTemplateCreator && <option value="public">{t("publishTemplate.visibilityPublic")}</option>}
        </select>
      </div>
    </div>
  );
}

/** Not a template creator: saving privately is free; selling needs the
 *  Templates creator program — the link opens where to turn it on. */
export function CreatorPitch({ onEnableTemplates }: { onEnableTemplates: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={NOTE}>
      {t("publishTemplate.creatorPitch", { pct: CREATOR_SHARE_PCT })}{" "}
      <button type="button" className="font-semibold text-primary underline" onClick={onEnableTemplates}>
        {t("publishTemplate.enableTemplatesProgram")}
      </button>
    </div>
  );
}

export function ConsentField({ fields }: { fields: Fields }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={fields.consentAccepted}
        onChange={(e) => fields.setConsentAccepted(e.target.checked)}
      />
      <span>{t("publishTemplate.consent")}</span>
    </label>
  );
}
