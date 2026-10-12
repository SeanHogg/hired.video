/**
 * Signed-out navigation — ONE list for every surface that shows it (the
 * desktop header and the phone menu drawer), so labels, hrefs and order can't
 * drift between them (consolidated-header mockup: Watch · How it works ·
 * Tools · Templates · Pricing).
 *
 * Watch / How it works are home-page sections, linked as `/#<id>` so they work
 * from any page: the hash-scroll hook (hooks/use-hash-scroll) lands the visitor
 * on the section after the route change, and smooth-scrolls on the home page.
 */

/** Section ids on the home page that the header links into. */
export const HOME_ANCHOR_IDS = {
  watch: "watch",
  howItWorks: "how-it-works",
} as const;

export interface PublicNavLink {
  href: string;
  labelKey: string;
  /** Set for links into a home-page section (never shown as the current page). */
  section?: string;
}

export const PUBLIC_NAV_LINKS: readonly PublicNavLink[] = [
  { href: `/#${HOME_ANCHOR_IDS.watch}`, labelKey: "nav.links.watch", section: HOME_ANCHOR_IDS.watch },
  { href: `/#${HOME_ANCHOR_IDS.howItWorks}`, labelKey: "nav.links.howItWorks", section: HOME_ANCHOR_IDS.howItWorks },
  { href: "/tools", labelKey: "nav.links.tools" },
  { href: "/templates", labelKey: "nav.links.templates" },
  { href: "/pricing", labelKey: "labels.pricing" },
];

/** Secondary signed-out destinations that live below the divider in the phone
 *  menu (and in the footer), not in the top bar. */
export const PUBLIC_SECONDARY_LINKS: readonly PublicNavLink[] = [
  { href: "/rewards", labelKey: "labels.rewards" },
];

/**
 * Whether `link` is the page the visitor is on (drives aria-current). Section
 * links are never "the current page" — on the home page nothing is
 * highlighted, which keeps the header free of scroll-tracking work.
 */
export function isPublicNavLinkActive(link: PublicNavLink, pathname: string): boolean {
  if (link.section) return false;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
