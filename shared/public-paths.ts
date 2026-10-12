/**
 * Public page paths — the ONE builder for every page an anonymous viewer
 * can open per entity. Shared by the frontend (cards, share menus, the
 * studio's linked-content CTA + export QR) and the API (admin feeds), so a
 * route change is one edit. Origin-relative; prefix `CANONICAL_ORIGIN`
 * (shared/structured-data) for an absolute link.
 *
 * Owner / editor routes (`/studio/:id`, `/resumes/edit/:id`, …) never
 * belong here: a link a viewer follows must not need an account.
 */

/** Ids may arrive as numbers from loosely-typed callers; both encode the same. */
const seg = (value: string | number): string => encodeURIComponent(value);

/** The public watch page (`PublicVideoResume`) at `/m/<id>` (media); the
 *  project's slug when it has one, else its id (the API accepts both).
 *  `/v/<id>` is a legacy alias. */
export function publicVideoPath(slugOrId: string): string {
  return `/m/${seg(slugOrId)}`;
}

/** ATS package landing (`ATSLandingPage`) at `/m/ats/<slug>` (legacy `/v/ats/<slug>`). */
export function publicAtsPath(slug: string): string {
  return `/m/ats/${seg(slug)}`;
}

/** A published article: `/articles/<author ref>/<slug>`. The author ref is
 *  the author's vanity slug or user id (`resolveUserRef` accepts both). */
export function publicArticlePath(authorRef: string, slug: string): string {
  return `/articles/${seg(authorRef)}/${seg(slug)}`;
}

/** A published article when only its id is known (a studio linked-content
 *  card stores the id): a resolver page that redirects to
 *  `publicArticlePath` (frontend ArticleByIdRedirect). */
export function publicArticleByIdPath(id: string): string {
  return `/articles/by-id/${seg(id)}`;
}

/** A public profile (`PeopleDetail`): user id or vanity slug. */
export function publicProfilePath(userRef: string | number): string {
  return `/people/${seg(userRef)}`;
}

/** A company page (`CompanyDetail`). */
export function publicCompanyPath(idOrSlug: string | number): string {
  return `/companies/${seg(idOrSlug)}`;
}

/** A job posting (`JobDetail`): id or slug. */
export function publicJobPath(idOrSlug: string | number): string {
  return `/jobs/${seg(idOrSlug)}`;
}

/** A résumé (`ResumeDetail`): falls back to the public read for a viewer
 *  who doesn't own it. */
export function publicResumePath(id: string | number): string {
  return `/resumes/${seg(id)}`;
}
