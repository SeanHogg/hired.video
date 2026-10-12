/**
 * usePublishTemplateForm — the state, validation and submit behind the
 * publish-template sheet (PublishTemplateSheet). No markup.
 *
 *   • creator status (public listing needs the Templates creator program —
 *     `canPublishTemplates`, the same shared rule the API enforces; private /
 *     unlisted saves are open to everyone);
 *   • the listing already published from this source (#853) — re-opening
 *     updates it instead of minting a duplicate;
 *   • submit through the injected `publish` (any source: a studio project,
 *     the career kit's résumé…) or, by default, the studio-project publish.
 *
 * The fee split is snapshotted server-side; CREATOR_SHARE_PCT is copy only.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";
import { canPublishTemplates } from "@shared/creator-programs";
import {
  studioTemplatesService,
  type StudioTemplate,
  type TemplatePublishFields,
} from "@/lib/services/studio-templates-service";

export const CREATOR_SHARE_PCT = 95;
export const PRICE_MIN_DOLLARS = 0;
export const PRICE_MAX_DOLLARS = 1000;

export type TemplateVisibility = "private" | "unlisted" | "public";

export interface PublishTemplateFormArgs {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The saved source's id (a studio project, or the résumé when `publish`
   *  is given). Null = not saved yet. */
  projectId: string | null;
  defaultName?: string;
  defaultThumbnailUrl?: string | null;
  /** V2 callers compute the payload at click time (#637). */
  getVideoScript?: () => unknown;
  /** Snapshot the current canvas frame as the thumbnail (#854). */
  captureCurrentFrame?: () => Promise<string | null>;
  onPublished?: (template: StudioTemplate) => void;
  /** Publish from a source other than a studio project. */
  publish?: (fields: TemplatePublishFields) => Promise<StudioTemplate>;
}

type CreatorState = { status: "loading" } | { status: "ready"; profile: CreatorProfile | null };

/** Public isn't offered to non-creators — never leave it selected for them. */
const withoutPublic = (v: TemplateVisibility): TemplateVisibility => (v === "public" ? "private" : v);

export function usePublishTemplateForm({
  open,
  onOpenChange,
  projectId,
  defaultName,
  defaultThumbnailUrl,
  getVideoScript,
  captureCurrentFrame,
  onPublished,
  publish,
}: PublishTemplateFormArgs) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [creatorState, setCreatorState] = useState<CreatorState>({ status: "loading" });
  const [name, setName] = useState(defaultName ?? "");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("0");
  const [visibility, setVisibility] = useState<TemplateVisibility>("public");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(defaultThumbnailUrl ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [existing, setExisting] = useState<StudioTemplate | null>(null);

  // Reset + refresh whenever the sheet re-opens (the user may have enrolled
  // in another tab).
  useEffect(() => {
    if (!open) return;
    setName(defaultName ?? "");
    setDescription("");
    setPriceDollars("0");
    setVisibility("public");
    setConsentAccepted(false);
    setThumbnailUrl(defaultThumbnailUrl ?? null);
    setCreatorState({ status: "loading" });
    setExisting(null);

    let cancelled = false;
    void creatorService
      .getMine()
      .then((profile) => {
        if (cancelled) return;
        setCreatorState({ status: "ready", profile });
        if (!canPublishTemplates(profile)) setVisibility(withoutPublic);
      })
      .catch(() => {
        if (cancelled) return;
        setCreatorState({ status: "ready", profile: null });
        setVisibility(withoutPublic);
      });

    if (projectId) {
      void studioTemplatesService
        .listMine()
        .then((rows) => {
          if (cancelled) return;
          const match = rows.find((r) => r.sourceProjectId === projectId);
          if (!match) return;
          setExisting(match);
          setName(match.name);
          setDescription(match.description ?? "");
          setPriceDollars((match.priceCents / 100).toString());
          setVisibility(match.visibility);
          setThumbnailUrl(match.thumbnailUrl ?? null);
        })
        .catch(() => {
          /* best-effort — fall back to publish mode */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, defaultName, defaultThumbnailUrl, projectId]);

  const isTemplateCreator = creatorState.status === "ready" && canPublishTemplates(creatorState.profile);
  // Where to turn the Templates program on: an enrolled creator toggles it in
  // "Your programs" (Offerings); everyone else enrolls via the wizard, which
  // offers the Templates program.
  const enableTemplatesHref =
    creatorState.status === "ready" && creatorState.profile ? "/services/offerings" : "/services?wizard=open";

  const fail = (title: string, description?: string) => toast({ title, description, variant: "destructive" });

  /** The first problem with the form, as a toast; true when it can submit. */
  function validate(dollars: number): boolean {
    if (!projectId) {
      fail(t("publishTemplate.errors.saveFirstTitle"), t("publishTemplate.errors.saveFirstBody"));
      return false;
    }
    if (visibility === "public" && !isTemplateCreator) {
      fail(t("publishTemplate.errors.creatorTitle"), t("publishTemplate.errors.creatorBody"));
      return false;
    }
    if (Number.isNaN(dollars) || dollars < PRICE_MIN_DOLLARS || dollars > PRICE_MAX_DOLLARS) {
      fail(
        t("publishTemplate.errors.priceTitle"),
        t("publishTemplate.errors.priceBody", { min: PRICE_MIN_DOLLARS, max: PRICE_MAX_DOLLARS }),
      );
      return false;
    }
    if (visibility === "public" && !consentAccepted) {
      fail(t("publishTemplate.errors.consentTitle"), t("publishTemplate.errors.consentBody"));
      return false;
    }
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const dollars = Number(priceDollars);
    if (!validate(dollars) || !projectId) return;
    const sourceProjectId = projectId;
    const publishFields =
      publish ?? ((fields: TemplatePublishFields) => studioTemplatesService.publish({ ...fields, sourceProjectId }));
    const listing = {
      name: name.trim(),
      description: description.trim() || null,
      thumbnailUrl: thumbnailUrl ?? null,
      priceCents: Math.round(dollars * 100),
      visibility,
      consentAccepted: visibility === "public" ? consentAccepted : undefined,
    };
    setSubmitting(true);
    try {
      const template = existing
        ? await studioTemplatesService.update(existing.id, listing)
        : await publishFields({ ...listing, ...(getVideoScript ? { videoScript: getVideoScript() } : {}) });
      toast({
        title: existing ? t("publishTemplate.toast.updatedTitle") : t("publishTemplate.toast.publishedTitle"),
        description: existing
          ? t("publishTemplate.toast.updatedBody")
          : visibility === "public"
            ? t("publishTemplate.toast.publishedPublicBody")
            : t("publishTemplate.toast.publishedPrivateBody"),
      });
      onPublished?.(template);
      onOpenChange(false);
    } catch (err) {
      fail(t("publishTemplate.errors.publishFailed"), err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function captureFrame() {
    if (!captureCurrentFrame) return;
    setCapturingFrame(true);
    try {
      const url = await captureCurrentFrame();
      if (url) setThumbnailUrl(url);
      else fail(t("publishTemplate.errors.nothingToCaptureTitle"), t("publishTemplate.errors.nothingToCaptureBody"));
    } catch (err) {
      fail(t("publishTemplate.errors.captureFailed"), err instanceof Error ? err.message : undefined);
    } finally {
      setCapturingFrame(false);
    }
  }

  return {
    loading: creatorState.status === "loading",
    isTemplateCreator,
    enableTemplatesHref,
    existing,
    submitting,
    capturingFrame,
    canCapture: !!captureCurrentFrame,
    fields: {
      name,
      setName,
      description,
      setDescription,
      priceDollars,
      setPriceDollars,
      visibility,
      setVisibility,
      consentAccepted,
      setConsentAccepted,
      thumbnailUrl,
      setThumbnailUrl,
    },
    submit,
    captureFrame,
  };
}

export type PublishTemplateForm = ReturnType<typeof usePublishTemplateForm>;
