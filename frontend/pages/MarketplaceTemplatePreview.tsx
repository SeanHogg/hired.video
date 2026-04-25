// Marketplace surface for previewing and buying a resume template.
// Lives outside ResumeDetail so future marketplace UX changes (richer
// galleries, reviews, A/B'd CTAs, cross-sells) don't impact the user's
// owned-resume page. The same shape is intended for sibling pages —
// MarketplaceJobTemplatePreview, MarketplaceCompanyTemplatePreview, etc.

import { Check, Eye, FileText, ShoppingCart, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import CreatorPitchAside from "@/components/marketplace/CreatorPitchAside";
import MarketplaceItemShell from "@/components/marketplace/MarketplaceItemShell";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { useSEO } from "@/lib/seo";
import { resumeService, type ResumeSummary } from "@/lib/services/resume-service";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import type { Resume } from "@/types/resume";
import { getTemplateById, type ResumeTemplateDescriptor } from "@/types/resume-template";

function priceLabel(cents?: number): string {
  if (!cents || cents <= 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

// Mounted as the seo slot so useSEO only fires here, not on every parent
// re-render path. Title/description follow the descriptor so each template
// gets a distinct indexable page.
function TemplateSEO({ descriptor }: { descriptor: ResumeTemplateDescriptor }) {
  useSEO(`/marketplace/templates/${descriptor.id}`, {
    title: `${descriptor.name} — Resume Template — hired.video Marketplace`,
    description:
      `Preview the "${descriptor.name}" resume template — a professionally designed, ` +
      `ATS-friendly layout from the hired.video Marketplace. Buy once, apply to any of your resumes.`,
    keywords: `resume templates, ${descriptor.name} resume template, ${descriptor.industry ?? ""}, professional resume design, ATS-friendly resume, hired.video marketplace`,
    ogTitle: `${descriptor.name} Resume Template — hired.video`,
    ogDescription:
      `${descriptor.industry ? descriptor.industry + " — " : ""}professionally designed resume template. ` +
      `Preview, purchase, and apply to your resume in one click.`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `${descriptor.name} Resume Template`,
      category: descriptor.industry ?? "Resume Templates",
      brand: { "@type": "Organization", name: "hired.video" },
      offers: {
        "@type": "Offer",
        price: ((descriptor.priceCents ?? 0) / 100).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `https://hired.video/marketplace/templates/${descriptor.id}`,
      },
    },
  });
  return null;
}

export default function MarketplaceTemplatePreview() {
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { addItem, openCart } = useCart();

  // Resolve the descriptor. Unknown templateId redirects to the catalog
  // rather than rendering a broken preview.
  const descriptor = useMemo(
    () => getTemplateById(templateId) ?? null,
    [templateId],
  );

  // Which resume to render the template against — defaults to SAMPLE_RESUME
  // for anonymous visitors, swaps to the visitor's master resume once that
  // fetch resolves. "sample" is the explicit fallback.
  const [sampleSelection, setSampleSelection] = useState<string>("sample");
  const [previewResume, setPreviewResume] = useState<Resume>(SAMPLE_RESUME);
  const [userResumes, setUserResumes] = useState<ResumeSummary[]>([]);
  const [unlocked, setUnlocked] = useState(false);

  // Track unlock state for the live "Already purchased" flip after checkout.
  useEffect(() => {
    if (!descriptor) return;
    setUnlocked(isTemplateUnlocked(descriptor.id));
    const handler = () => setUnlocked(isTemplateUnlocked(descriptor.id));
    window.addEventListener("hired:template-unlocked", handler);
    return () => window.removeEventListener("hired:template-unlocked", handler);
  }, [descriptor?.id]);

  // Authenticated visitors get their resumes loaded so they can preview the
  // template against their own content. First load defaults the selection
  // to the master resume; explicit user picks aren't overridden by re-fetches.
  useEffect(() => {
    if (!isAuthenticated) {
      setUserResumes([]);
      return;
    }
    let cancelled = false;
    resumeService
      .getUserResumes()
      .then((rs) => {
        if (cancelled) return;
        setUserResumes(rs ?? []);
        const master = (rs ?? []).find(
          (r: any) => r.isMaster === true || r.IsMaster === true,
        );
        const def = master ?? (rs ?? [])[0];
        if (!def) return;
        const defId: string = (def as any).id ?? (def as any).Id;
        setSampleSelection((curr) => (curr === "sample" ? defId : curr));
      })
      .catch(() => {
        if (!cancelled) setUserResumes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Load the resume currently selected for preview. Falls back to
  // SAMPLE_RESUME if the fetch fails so the page never goes blank.
  useEffect(() => {
    if (sampleSelection === "sample") {
      setPreviewResume(SAMPLE_RESUME);
      return;
    }
    let cancelled = false;
    resumeService
      .getResumeById(sampleSelection)
      .then((r) => {
        if (!cancelled && r) setPreviewResume(r);
      })
      .catch(() => {
        if (!cancelled) setPreviewResume(SAMPLE_RESUME);
      });
    return () => {
      cancelled = true;
    };
  }, [sampleSelection]);

  // Unknown / missing template → bounce to the catalog. Keeps any unrelated
  // search params off the new URL.
  if (!descriptor) {
    return <Navigate to="/search?category=templates" replace />;
  }

  // Optional ?ref= / ?utm_* preservation when applying to user's resume.
  const carryParams = searchParams.toString() ? `&${searchParams.toString()}` : "";

  const masterResumeSummary = userResumes.find(
    (r: any) => r.isMaster === true || r.IsMaster === true,
  ) as any | undefined;
  const masterResumeId: string | null =
    masterResumeSummary?.id ?? masterResumeSummary?.Id ?? null;
  const applyHref = masterResumeId
    ? `/resumes/${masterResumeId}?template=${descriptor.id}${carryParams}`
    : "/resumes";

  const sampleSelectionLabel = (() => {
    if (sampleSelection === "sample") return "Sample resume";
    const match = userResumes.find(
      (r: any) => (r.id ?? r.Id) === sampleSelection,
    ) as any | undefined;
    return match?.title || match?.Title || "Your resume";
  })();

  const handleAddToCart = () => {
    addItem({
      id: `template:${descriptor.id}`,
      name: descriptor.name,
      price: (descriptor.priceCents ?? 0) / 100,
      type: "template",
    });
    openCart();
  };

  const badges = (
    <>
      <Badge variant="secondary" className="flex items-center gap-1">
        <Eye className="w-3 h-3" />
        <span className="font-mono">{descriptor.name}</span>
      </Badge>
      {descriptor.industry && (
        <Badge variant="outline" className="text-xs">{descriptor.industry}</Badge>
      )}
      <Badge
        variant={descriptor.priceCents && descriptor.priceCents > 0 ? "default" : "secondary"}
        className="text-xs"
      >
        {priceLabel(descriptor.priceCents)}
      </Badge>
    </>
  );

  const actions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <FileText className="w-4 h-4 mr-1" />
            <span className="max-w-[160px] truncate">{sampleSelectionLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Render this template using
          </DropdownMenuLabel>
          {isAuthenticated &&
            userResumes.length > 0 &&
            userResumes.map((r: any) => {
              const rid: string = r.id ?? r.Id;
              const title: string = r.title ?? r.Title ?? "Untitled";
              const isMaster = r.isMaster === true || r.IsMaster === true;
              return (
                <DropdownMenuItem
                  key={rid}
                  onClick={() => setSampleSelection(rid)}
                  className={sampleSelection === rid ? "bg-accent" : ""}
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{title}</span>
                    {isMaster && (
                      <span className="text-xs text-muted-foreground">Master resume</span>
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}
          <DropdownMenuItem
            onClick={() => setSampleSelection("sample")}
            className={sampleSelection === "sample" ? "bg-accent" : ""}
          >
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-medium truncate">Sample resume</span>
              <span className="text-xs text-muted-foreground">Showcase data</span>
            </div>
          </DropdownMenuItem>
          {!isAuthenticated && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-2 text-xs text-muted-foreground">
                <Link to="/login" className="underline hover:text-foreground">Sign in</Link>{" "}
                to render this template using your own resume.
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {unlocked ? (
        <Button asChild size="sm" variant="outline">
          <Link to={applyHref}>
            <Check className="w-4 h-4 mr-1" />
            {masterResumeId ? "Use on my resume" : "Already purchased"}
          </Link>
        </Button>
      ) : (
        <Button size="sm" onClick={handleAddToCart}>
          <ShoppingCart className="w-4 h-4 mr-1" />
          Add to Cart — {priceLabel(descriptor.priceCents)}
        </Button>
      )}

      <Button asChild size="sm" variant="ghost">
        <Link to="/search?category=templates">Browse all</Link>
      </Button>
    </>
  );

  // Right-rail: creator pitch with a secondary purchase card so the CTA stays
  // visible even when the visitor scrolls past the top action bar.
  const secondary = (
    <div className="rounded-xl border p-4 space-y-2">
      <h4 className="text-sm font-semibold">Like this template?</h4>
      <p className="text-xs text-muted-foreground">
        Add it to your library and apply it to any of your resumes — same content,
        instantly restyled.
      </p>
      {unlocked ? (
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to={applyHref}>
            <Check className="w-4 h-4 mr-1" />
            {masterResumeId ? "Use on my resume" : "Already purchased"}
          </Link>
        </Button>
      ) : (
        <Button size="sm" className="w-full" onClick={handleAddToCart}>
          <ShoppingCart className="w-4 h-4 mr-1" />
          Add to Cart — {priceLabel(descriptor.priceCents)}
        </Button>
      )}
      <Button asChild size="sm" variant="ghost" className="w-full">
        <Link to="/search?category=templates">
          <Store className="w-4 h-4 mr-1" />
          Browse all templates
        </Link>
      </Button>
    </div>
  );

  return (
    <MarketplaceItemShell
      seo={<TemplateSEO descriptor={descriptor} />}
      badges={badges}
      actions={actions}
      preview={
        <DeclarativeResumeRenderer resume={previewResume} descriptor={descriptor} />
      }
      sidebar={<CreatorPitchAside itemTypeLabel="resume templates" secondary={secondary} />}
    />
  );
}
