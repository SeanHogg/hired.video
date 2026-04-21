// SharedCandidateResume — unauthenticated reviewer view for a candidate
// resume share token. Renders the redacted resume content through the
// existing DeclarativeResumeRenderer under a brand-kit header banner
// (logo, primary colour, agency contact). Fails closed via the backend:
// expired / inactive / missing tokens return a generic "not found" state
// that never leaks whether a token once existed.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, Mail, ShieldCheck } from "lucide-react";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Footer from "@/components/Footer";
import { useSEO } from "@/lib/seo";
import {
  recruitService,
  type PublicCandidateResumeShare,
} from "@/lib/services/recruit-service";
import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

// Print-mode descriptor for the reviewer view. A reviewer reads a resume
// the way an ATS does — dense, un-gradient, caps-headings for scannability.
// The brand kit's primaryColor bleeds into the header banner but the body
// renders through the shared theme token set.
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
    { key: "languages", enabled: true, title: "Languages", icon: "languages", layout: "grid", columns: 3 },
    { key: "awards", enabled: true, title: "Awards", icon: "trophy", layout: "list" },
    { key: "volunteer", enabled: true, title: "Volunteer", icon: "heart", layout: "list" },
  ],
};

// Wrap the raw JSON-Resume content block the backend returns into the
// minimal Resume envelope shape DeclarativeResumeRenderer expects.
function wrapContentAsResume(content: Record<string, unknown>, title: string): Resume {
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

export default function SharedCandidateResume() {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicCandidateResumeShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Shared reviewer links should never be indexed.
  useSEO("/share/candidate-resume", {
    title: "Candidate Resume — hired.video",
    description: "Shared candidate resume — review via hired.video agency tooling.",
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
        const data = await recruitService.getPublicCandidateResume(token);
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

  const resume = useMemo(() => {
    if (!payload?.content) return null;
    return wrapContentAsResume(payload.content, payload.share.name ?? "Candidate");
  }, [payload]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading shared resume…</div>
      </div>
    );
  }

  if (notFound || !payload || !resume) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-3">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold">This share is no longer available</h1>
            <p className="text-sm text-muted-foreground">
              The link has been revoked or has expired. If you were expecting to review a candidate,
              contact the recruiter who sent you the link.
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const brand = payload.brand;
  const primaryColor = brand?.primaryColor ?? "#2563eb";

  return (
    <div className="min-h-screen bg-background">
      {/* Brand header banner — tinted from the agency's primaryColor. */}
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
                <AvatarImage src={brand.logoUrl} alt={brand?.name ?? "Agency"} />
                <AvatarFallback className="bg-white/20 text-inherit">
                  {(brand?.name ?? "A").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
            <div>
              <p className="text-xs uppercase tracking-widest opacity-80">Shared by</p>
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
              Redacted for review
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

      {/* Candidate-facing PII banner — makes the redaction explicit so the
          reviewer understands they're seeing a masked version. */}
      <div className="max-w-5xl mx-auto px-6 pt-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>This resume has been redacted for privacy.</AlertTitle>
          <AlertDescription>
            Personal identifiers have been removed by the recruiting agency. To request full
            contact details, reply to the recruiter who sent you this link.
          </AlertDescription>
        </Alert>
      </div>

      <main>
        <DeclarativeResumeRenderer
          resume={resume}
          descriptor={REVIEWER_DESCRIPTOR}
          embedded
        />
      </main>

      <Footer />
    </div>
  );
}
