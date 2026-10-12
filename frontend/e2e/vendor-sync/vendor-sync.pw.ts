/**
 * Vendor Sync extension↔web round-trip (#2167).
 *
 * Real MV3 `--load-extension` cannot complete this loop under Playwright:
 * the jobseeker SW only broadcasts `vendor-sync:focused-html` to
 * https://hired.video/* and http://localhost:3000/*, and auth-bridge is
 * not injected on 127.0.0.1:4317. The harness therefore:
 *   • stubs `/api/vendor-sync/*` + resumes + bootstrap
 *   • seeds a non-guest JWT so the Sync CTA is visible
 *   • relays `hired.video:notify-extension` → `hired.video:extension-event`
 *     with type `vendor-sync:focused-html` (the same CustomEvent the
 *     auth-bridge would dispatch after scraping a vendor tab)
 *
 * Asserted path:
 *   Sync click → notify-extension → stub focused-html → importFromHtml
 *   → MergeResumeDialog titled "Merge résumés" showing extracted fields.
 *
 * Run: npm run test:visual  (or npx playwright test e2e/vendor-sync)
 */
import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/e2e/vendor-sync/vendor-sync.html";
const HTML_MARKER = "linkedin-profile-avery-chen";
const EXTRACTED_NAME = "Avery Chen";
const EXTRACTED_COMPANY = "Northwind Labs";
const RESUME_ID = "resume-master-1";

interface VendorSyncWindow {
  __vendorSyncReady?: boolean;
  __vendorSyncLastImport?: {
    connectorId: string;
    html: string;
    sourceUrl: string;
    targetResumeId: string;
  } | null;
}

async function openHarness(page: Page, search = ""): Promise<void> {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  (page as Page & { __pageErrors?: string[] }).__pageErrors = pageErrors;

  await page.goto(`${HARNESS}${search}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => (window as unknown as VendorSyncWindow).__vendorSyncReady === true,
    null,
    { timeout: 120_000 },
  );
}

function pageErrorsOf(page: Page): string[] {
  return (page as Page & { __pageErrors?: string[] }).__pageErrors ?? [];
}

test.describe("Vendor Sync", () => {
  test("Sync from LinkedIn tab opens merge dialog with extracted JSON Resume", async ({
    page,
  }) => {
    await openHarness(page);

    const sync = page.getByRole("button", { name: "Sync from LinkedIn tab" });
    await expect(sync).toBeVisible();
    await sync.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Merge résumés" })).toBeVisible();
    await expect(dialog.getByText(EXTRACTED_NAME)).toBeVisible();
    await expect(dialog.getByText(EXTRACTED_COMPANY)).toBeVisible();

    const last = await page.evaluate(
      () => (window as unknown as VendorSyncWindow).__vendorSyncLastImport,
    );
    expect(last, "importFromHtml was posted").toBeTruthy();
    expect(last?.connectorId).toBe("linkedin");
    expect(last?.targetResumeId).toBe(RESUME_ID);
    expect(last?.html).toContain(HTML_MARKER);
    expect(last?.html).toContain(EXTRACTED_NAME);
    expect(last?.sourceUrl).toContain("linkedin.com");

    expect(pageErrorsOf(page), "uncaught page errors").toEqual([]);
  });

  test("?autoSync=linkedin fires the same round-trip without a click", async ({
    page,
  }) => {
    await openHarness(page, "?autoSync=linkedin");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Merge résumés" })).toBeVisible();
    await expect(dialog.getByText(EXTRACTED_NAME)).toBeVisible();
    await expect(dialog.getByText(EXTRACTED_COMPANY)).toBeVisible();

    const last = await page.evaluate(
      () => (window as unknown as VendorSyncWindow).__vendorSyncLastImport,
    );
    expect(last?.connectorId).toBe("linkedin");
    expect(last?.html).toContain(HTML_MARKER);

    expect(pageErrorsOf(page), "uncaught page errors").toEqual([]);
  });
});
