/**
 * Pure HTML helpers for candidate profile extraction (profile-extraction.ts).
 */

export interface HarvestedContacts {
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  twitter: string;
  website: string;
}

/**
 * Pull contact info + social URLs straight out of the raw page HTML — a
 * deterministic backstop behind the LLM extraction so we never miss a
 * `mailto:`/`tel:` link or a visible LinkedIn / GitHub / X URL
 * (Loxo Boost contact-field parity).
 */
export function harvestContactsFromHtml(html: string): HarvestedContacts {
  const mailto = /mailto:([^"'>\s?]+)/i.exec(html);
  const tel = /tel:([+0-9 ()-]{6,})/i.exec(html);
  const linkedin = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[a-zA-Z0-9-_%]+/i.exec(html);
  const github = /https?:\/\/github\.com\/[a-zA-Z0-9-]+(?!\/)/i.exec(html);
  const twitter = /https?:\/\/(?:twitter|x)\.com\/[a-zA-Z0-9_]+/i.exec(html);

  // "website": prefer an explicit href= that isn't a social/recruiting host.
  let website = "";
  const hrefMatches = html.matchAll(/href=["']?(https?:\/\/[^\s"'>]+)/gi);
  for (const m of hrefMatches) {
    const url = m[1] ?? "";
    const lc = url.toLowerCase();
    if (!url || lc.length > 200) continue;
    if (/linkedin\.com|github\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|indeed\.com|glassdoor\.com|mailto:|tel:/.test(lc)) continue;
    website = url;
    break;
  }

  return {
    email: mailto?.[1]?.trim() ?? "",
    phone: tel?.[1]?.trim() ?? "",
    linkedin: linkedin?.[0] ?? "",
    github: github?.[0] ?? "",
    twitter: twitter?.[0] ?? "",
    website,
  };
}

/** Visible text of a page (scripts/styles/tags stripped), capped at 10k chars. */
export function stripHtmlForProfile(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}
