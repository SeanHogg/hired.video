/**
 * #2364 — profession and life-stage /for/:audience pages must close with
 * AudienceUploadStep (the upload band) before SeoFinalCta. A source-order
 * pin so neither page can drop the closer without this test failing.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function source(rel: string): string {
  return readFileSync(resolve(here, rel), "utf8");
}

describe("/for/:audience pages end in the upload step (#2364)", () => {
  it.each([["../ProfessionLandingPage.tsx"], ["../LifeStageLandingPage.tsx"]] as const)(
    "%s renders AudienceUploadStep before the final CTA",
    (rel) => {
      const src = source(rel);
      const upload = src.indexOf("<AudienceUploadStep");
      const finalCta = src.lastIndexOf("<SeoFinalCta");
      expect(upload, `${rel} must render <AudienceUploadStep>`).toBeGreaterThan(-1);
      expect(finalCta, `${rel} must render <SeoFinalCta>`).toBeGreaterThan(-1);
      expect(upload, `${rel}: upload step must precede the final CTA`).toBeLessThan(finalCta);
    },
  );
});
