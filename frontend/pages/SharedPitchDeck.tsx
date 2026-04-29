// SharedPitchDeck — unauthenticated reviewer view for a pitch-deck share
// token. Slide-deck nav (prev/next + dots + keyboard arrows) over N
// redacted candidate resumes. Each slide shows fit summary, match score,
// and recruiter notes above the DeclarativeResumeRenderer. Brand kit
// header banner matches SharedCandidateResume for consistency.
//
// Reviewer feedback capture (thumbs, comments, shortlist) is gap #184
// (roadmap, not v1).

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import { useSEO } from "@/lib/seo";
import {
  recruitService,
  type PublicPitchDeck,
  type PublicPitchDeckSlide,
} from "@/lib/services/recruit-service";
import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

const REVIEWER_DESCRIPTOR: ResumeTemplateDescriptor = {
  id: "reviewer-print",
  name: "Reviewer Print",
  version: "1.2",
  documentMode: "print",
  theme: {
    themeKey: "iron-gray",
    fontFamily: "sans",
    headingStyle: "underlined",
    density: "comfortable",
    cardStyle: "ghost",
    sectionTitleSize: "md",
  },
  layout: { columns: 1 },
  hero: {
    enabled: true,
    layout: "compact",
    showAvatar: false,
    showContactButtons: true,
    showSummary: true,
    showVideo: false,
  },
  sections: [
    { key: "work", enabled: true, title: "Work Experience", icon: "building", layout: "list", showHighlights: true, sortBy: "date_desc" },
    { key: "education", enabled: true, title: "Education", icon: "graduation-cap", layout: "list", sortBy: "date_desc" },
    { key: "projects", enabled: true, title: "Projects", icon: "folder-open", layout: "list" },
    { key: "skills", enabled: true, title: "Skills", icon: "star", layout: "grid", columns: 3 },
    { key: "certificates", enabled: true, title: "Certificates", icon: "award", layout: "list" },
    { key: "awards", enabled: true, title: "Awards", icon: "trophy", layout: "list" },
  ],
};

function wrapContentAsResume(
  content: Record<string, unknown>,
  title: string,
): Resume {
  return {
    id: "shared",
    userId: "shared",
    title,
    slug: null,
    content: content as any,
    status: "published" as any,
    privacy: "public" as any,
    isMaster: true,
    isActive: true,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    viewCount: 0,
    isOwner: false,
    isWatched: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function SharedPitchDeck() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicPitchDeck | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  useSEO("/share/pitch-deck", {
    title: "Candidate Pitch Deck — hired.video",
    description: "Curated candidate shortlist shared via hired.video.",
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let isMounted = true;
    (async () => {
      try {
        const data = await recruitService.getPublicPitchDeck(token);
        if (!isMounted) return;
        setPayload(data);
      } catch {
        if (!isMounted) return;
        setNotFound(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const slides = payload?.slides ?? [];
  const slide: PublicPitchDeckSlide | undefined = slides[slideIndex];

  const resume = useMemo(() => {
    if (!slide) return null;
    const title = t("labels.candidateXofY", { current: slideIndex + 1, total: slides.length });
    return wrapContentAsResume(slide.content, title);
  }, [slide, slideIndex, slides.length, t]);

  // Keyboard navigation — arrow keys jump between slides. Mirrors the
  // natural "presentation" affordance reviewers expect from a deck.
  const goPrev = useCallback(
    () => setSlideIndex((i) => Math.max(0, i - 1)),
    [],
  );
  const goNext = useCallback(
    () => setSlideIndex((i) => Math.min(slides.length - 1, i + 1)),
    [slides.length],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("status.loadingSharedDeck")}</div>
      </div>
    );
  }

  if (notFound || !payload) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold">{t("headings.deckUnavailable")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("messages.deckUnavailableDesc")}
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const brand = payload.brand;
  const primaryColor = brand?.primaryColor ?? "#2563eb";
  const deck = payload.deck;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="w-full text-white"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {brand?.logoUrl && (
              <Avatar className="w-12 h-12 border-2 border-white/40 bg-white/10">
                <AvatarImage src={brand.logoUrl} alt={brand?.name ?? t("labels.agency")} />
                <AvatarFallback className="bg-white/20 text-inherit">
                  {(brand?.name ?? "A").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            <div>
              <p className="text-xs uppercase tracking-widest opacity-80">{t("labels.sharedBy")}</p>
              <h1 className="text-xl font-semibold leading-tight">
                {brand?.name ?? "hired.video"}
              </h1>
              {brand?.heroHeadline && (
                <p className="text-xs opacity-90 mt-0.5">{brand.heroHeadline}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <Badge variant="secondary" className="bg-white/20 text-white border-0">
              <ShieldCheck className="w-3 h-3 mr-1" />
              {t("labels.redactedForReview")}
            </Badge>
            {brand?.contactEmail && (
              <a
                href={`mailto:${brand.contactEmail}`}
                className="inline-flex items-center gap-1 hover:underline opacity-90"
              >
                <Mail className="w-3 h-3" />
                {brand.contactEmail}
              </a>
            )}
            {brand?.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:underline opacity-90"
              >
                <ExternalLink className="w-3 h-3" />
                {brand.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Deck title + slide meta */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold leading-tight">{deck.name}</h2>
            {deck.description && (
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{deck.description}</p>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 mt-1">
            {t("labels.candidatesCount", { count: slides.length })}
          </Badge>
        </div>

        {slides.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
            {t("messages.deckHasNoCandidates")}
          </div>
        ) : (
          <>
            {/* Slide nav */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <Button
                variant="outline"
                size="sm"
                disabled={slideIndex === 0}
                onClick={goPrev}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("actions.previous")}
              </Button>
              <div className="flex items-center gap-1.5">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={t("labels.goToCandidate", { index: i + 1 })}
                    onClick={() => setSlideIndex(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === slideIndex
                        ? "w-6 bg-foreground"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/60"
                    }`}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={slideIndex >= slides.length - 1}
                onClick={goNext}
              >
                {t("actions.next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            {/* Slide header with fit summary / match score / notes */}
            {slide && (
              <div className="rounded-lg border bg-card p-5 mb-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t("labels.candidateXofY", { current: slideIndex + 1, total: slides.length })}
                    </span>
                  </div>
                  {typeof slide.matchScore === "number" && (
                    <Badge variant="default" className="text-sm">
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      {t("labels.matchPercent", { percent: slide.matchScore })}
                    </Badge>
                  )}
                </div>
                {slide.fitSummary && (
                  <p className="text-sm leading-relaxed">{slide.fitSummary}</p>
                )}
                {slide.recruiterNotes && (
                  <div className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3 py-1 italic">
                    {slide.recruiterNotes}
                  </div>
                )}
              </div>
            )}

            {/* Resume */}
            {resume && (
              <div className="rounded-lg overflow-hidden border bg-background">
                <DeclarativeResumeRenderer
                  resume={resume}
                  descriptor={REVIEWER_DESCRIPTOR}
                  embedded
                />
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
