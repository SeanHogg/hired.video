/**
 * #2395 — ProjectDetailsSheet campaign first-load error + i18n retry.
 * #3214 / #679 — EngagementTab host wire (lazy import on the engagement tab).
 *
 * Campaigns fetch is lazy; a silent empty list on first-load failure
 * looks like "no campaigns". The sheet must surface an error + Retry
 * that re-fetches, and the copy must live in the locale catalogues.
 *
 * The engagement tab must keep lazy-mounting EngagementTab even though
 * the same file also owns #2395 i18n + campaign query invalidation.
 *
 * Run: vitest run components/studio/shared/__tests__/ProjectDetailsSheet.test.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, "../ProjectDetailsSheet.tsx"), "utf8");

function locale(name: string): Record<string, string> {
  return JSON.parse(
    readFileSync(
      join(here, `../../../../public/locales/${name}.json`),
      "utf8",
    ),
  ) as Record<string, string>;
}

describe("ProjectDetailsSheet campaigns (#2395)", () => {
  it("tracks campaignsError and retries by clearing it", () => {
    expect(sheet).toContain("campaignsError");
    expect(sheet).toContain("setCampaignsError(true)");
    expect(sheet).toContain('data-testid="campaigns-load-error"');
    expect(sheet).toMatch(/t\(["']studio\.projectDetails\.campaignsLoadFailed["']\)/);
    expect(sheet).toMatch(/t\(["']studio\.projectDetails\.retryLoad["']\)/);
  });

  it("invalidates studioCampaignsQueryKey after create/update", () => {
    expect(sheet).toContain("studioCampaignsQueryKey");
    expect(sheet).toMatch(/invalidateQueries\(\s*\{\s*queryKey:\s*studioCampaignsQueryKey/);
  });

  it("catalogues load-failed + retry strings in en/es/fr-CA", () => {
    const en = locale("en");
    const es = locale("es");
    const fr = locale("fr-CA");
    expect(en["studio.projectDetails.campaignsLoadFailed"]).toMatch(/campaign/i);
    expect(en["studio.projectDetails.retryLoad"]).toBe("Retry");
    expect(es["studio.projectDetails.campaignsLoadFailed"]).toMatch(/campaña/i);
    expect(es["studio.projectDetails.retryLoad"]).toBe("Reintentar");
    expect(fr["studio.projectDetails.campaignsLoadFailed"]).toMatch(/campagne/i);
    expect(fr["studio.projectDetails.retryLoad"]).toBe("Réessayer");
  });
});

describe("ProjectDetailsSheet EngagementTab host (#3214 / #679)", () => {
  it("lazy-imports EngagementTab and mounts it on the engagement tab", () => {
    expect(sheet).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(["']@\/components\/engagement\/EngagementTab["']\)/,
    );
    expect(sheet).toContain('key: "engagement"');
    expect(sheet).toMatch(/<EngagementTab\s+project=\{project\}\s*\/>/);
  });
});
