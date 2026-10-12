// The Articles panel's details form (split from ArticlesManagerPanel): type,
// title, cover, category / tags, sector + audience, geo, Resource-Map tags
// and the body. State lives in useArticleDetailsForm; `locked` (the piece is
// in review) makes it read-only.

import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ArticleEditor from "@/components/articles/ArticleEditor";
import MediaPicker from "@/components/shared/MediaPicker";
import { LocationPicker } from "@/components/location/LocationPicker";
import { SectorPicker } from "@/components/sector/SectorPicker";
import { AudiencePicker } from "@/components/landing/AudiencePicker";
import type { ArticleKind } from "@/lib/services/article-service";
import { ARTICLE_AUDIENCES, ARTICLE_AUDIENCE_LABELS, type ArticleAudience } from "@shared/sectors";
import type { ArticleDetailsForm as Form } from "./useArticleDetailsForm";

const KINDS: readonly ArticleKind[] = ["article", "faq", "guide"];

interface ArticleDetailsFormProps {
  form: Form;
  locked: boolean;
  /** Remounts the body editor per piece (Tiptap reads content on mount). */
  editorKey: string;
}

export default function ArticleDetailsForm({ form, locked, editorKey }: ArticleDetailsFormProps) {
  const { t } = useTranslation();
  const coverPicker = (label: string) => (
    <MediaPicker accept="image" title={t("creator.articles.form.coverPicker")} triggerLabel={label} onPick={(asset) => form.setCoverImageUrl(asset.url)} />
  );
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="kind">{t("creator.articles.form.contentType")}</Label>
          <Select value={form.kind} onValueChange={(v) => form.setKind(v as ArticleKind)} disabled={locked}>
            <SelectTrigger id="kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>{t(`creator.articles.form.kind.${k}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="title">{t("labels.title")}</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => form.setTitle(e.target.value)}
            placeholder={t("creator.articles.form.titlePlaceholder")}
            disabled={locked}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("creator.articles.form.cover")}</Label>
        {form.coverImageUrl ? (
          <div className="flex items-start gap-3">
            <img src={form.coverImageUrl} alt={t("creator.articles.form.coverAlt")} className="h-24 w-40 object-cover rounded-md border" />
            <div className="flex flex-col gap-2">
              {coverPicker(t("actions.replace"))}
              <Button type="button" variant="ghost" size="sm" onClick={() => form.setCoverImageUrl("")} disabled={locked}>
                {t("actions.remove")}
              </Button>
            </div>
          </div>
        ) : (
          coverPicker(t("creator.articles.form.addCover"))
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cat">{t("labels.category")}</Label>
          <Input id="cat" value={form.category} onChange={(e) => form.setCategory(e.target.value)} placeholder={t("creator.articles.form.categoryPlaceholder")} disabled={locked} />
        </div>
        <div>
          <Label htmlFor="tags">{t("creator.articles.form.tags")}</Label>
          <Input id="tags" value={form.tagsInput} onChange={(e) => form.setTagsInput(e.target.value)} placeholder={t("creator.articles.form.tagsPlaceholder")} disabled={locked} />
        </div>
      </div>
      {/* Sector + audience taxonomy — drives sector landing pages and the
          For-Job-Seekers / For-Recruiters split. Both optional; leave blank
          for general career content. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t("creator.articles.form.sector")}</Label>
          <SectorPicker value={form.sector} onChange={form.setSector} mode="all" emptyLabel={t("creator.articles.form.sectorNone")} disabled={locked} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audience">{t("creator.articles.form.audience")}</Label>
          <Select
            value={form.audience || "__none__"}
            onValueChange={(v) => form.setAudience(v === "__none__" ? "" : (v as ArticleAudience))}
            disabled={locked}
          >
            <SelectTrigger id="audience">
              <SelectValue placeholder={t("creator.articles.form.audienceGeneral")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("creator.articles.form.audienceGeneral")}</SelectItem>
              {ARTICLE_AUDIENCES.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`articles.audience.${a}`, { defaultValue: ARTICLE_AUDIENCE_LABELS[a] })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("creator.articles.form.geo")}</Label>
        <p className="text-xs text-muted-foreground">{t("creator.articles.form.geoHelp")}</p>
        <LocationPicker
          value={form.locations}
          onChange={form.setLocations}
          multiRegion
          showRemote={false}
          originLabel={t("creator.articles.form.primaryLocation")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("creator.articles.form.maps")}</Label>
        <p className="text-xs text-muted-foreground">{t("creator.articles.form.mapsHelp")}</p>
        <AudiencePicker value={form.audienceTags} onChange={form.setAudienceTags} />
      </div>
      <div>
        <Label htmlFor="body">{t("creator.articles.form.body")}</Label>
        {/* Keyed per piece so the editor remounts with the right content
            when the creator switches between drafts — Tiptap's useEditor
            reads `content` only on mount. */}
        <ArticleEditor
          key={editorKey}
          initialJson={form.bodyJson ?? undefined}
          initialMarkdown={form.bodyMd}
          placeholder={t("creator.articles.form.bodyPlaceholder")}
          readOnly={locked}
          onChange={form.setBody}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t("creator.articles.form.readTime", { n: Math.max(1, Math.ceil(form.wordCount / 225)) })}
        </p>
      </div>
    </>
  );
}
