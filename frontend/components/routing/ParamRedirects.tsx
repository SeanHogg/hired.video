import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { publicProfilePath, publicResumePath } from "@shared/public-paths";

// Back-compat: /resumes/VIEWER/:id was the preview sandbox before the declarative
// viewer became the default at /resumes/:id. Old links redirect in-place.
export function LegacyViewerRedirect() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const qs = search.toString();
  return <Navigate to={`${publicResumePath(id)}${qs ? "?" + qs : ""}`} replace />;
}

// Creator profiles live on /people/:id under the Services tab now —
// they're People with a Creator badge, not a separate surface.
export function CreatorPublicProfileRedirect() {
  const { userId } = useParams<{ userId: string }>();
  return <Navigate to={`${publicProfilePath(userId)}?tab=services`} replace />;
}

// Back-compat: /resumes/sample?template=X used to be the marketplace template
// preview. It now lives under /marketplace/templates/:templateId — redirect
// inbound links and any TemplateCard "Preview" buttons that haven't updated.
export function LegacySampleRedirect() {
  const [search] = useSearchParams();
  const tpl = search.get("template");
  if (!tpl) return <Navigate to="/templates" replace />;
  return <Navigate to={`/marketplace/templates/${tpl}`} replace />;
}

// Back-compat: review subjects linked templates as
// /marketplace/templates/{resume|video}/:id. Résumé and video templates are
// both studio templates now, on the ONE detail page (which resolves an id).
export function LegacyKindedTemplateRedirect() {
  const { templateId } = useParams<{ templateId: string }>();
  return <Navigate to={`/marketplace/templates/${encodeURIComponent(templateId ?? "")}`} replace />;
}

// Legacy /recruit/* surfaces moved to /services/* (My Services hub).
// These two carry an :id param so the parent Navigate can't express the
// rewrite in a single line — small wrappers keep the route table readable.
export function RecruitCandidateRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/services/candidates/${id}`} replace />;
}
export function RecruitPitchDeckRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/people/pitch-decks/${id}`} replace />;
}
export function ServicesPitchDeckRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/people/pitch-decks/${id}`} replace />;
}
// Gigs moved into the My Services hub (/services/gigs). The detail route
// carries an :id, so a tiny wrapper rewrites the legacy /gigs/:id deep-link.
export function GigDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/services/gigs/${id}`} replace />;
}
