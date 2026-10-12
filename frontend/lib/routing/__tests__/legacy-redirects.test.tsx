/**
 * #1915 / #1955 — every retired entity create / edit form route redirects to
 * the studio (route tests over the ONE redirect table), and the retired form
 * pages + components are gone.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HIRING_PERSONAS_ENABLED } from "@shared/user-roles";
import { STUDIO_NEW_COMPANY_PATH, STUDIO_NEW_JOB_PATH } from "@shared/studio-paths";
import LegacyRedirect from "@/components/routing/LegacyRedirect";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";
import { LEGACY_REDIRECTS } from "../legacy-redirects";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="landed">{`${pathname}${search}`}</div>;
}

function landAt(url: string): string {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {LEGACY_REDIRECTS.map((row) => (
          <Route key={row.path} path={row.path} element={<LegacyRedirect row={row} />} />
        ))}
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("landed").textContent ?? "";
}

const JOB_ID = "4f1c9a2b-7e3d-4c8a-b6f0-1d2e3a4b5c6d";
const COMPANY_ID = "c7a1e5d3-2b4f-4a6c-8e9d-0f1a2b3c4d5e";
const RESUME_ID = "8b6f2c1e-0d6a-4b8e-9f3a-2c7d5e1a9b40";
const DRAFT_ID = "0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";

/** Every old URL (with a realistic id) → where it must land. */
const CASES: Array<[string, string]> = [
  ["/resumes/create", "/studio?contentTemplate=resume-doc"],
  [`/resumes/create/${DRAFT_ID}`, "/studio?contentTemplate=resume-doc"],
  [`/resumes/edit/${RESUME_ID}`, `/studio/resume/${RESUME_ID}`],
  ["/jobs/create", "/studio?contentTemplate=job_doc"],
  [`/jobs/create/${DRAFT_ID}`, "/studio?contentTemplate=job_doc"],
  ["/jobs/upload", "/studio?contentTemplate=job_doc"],
  [`/jobs/edit/${JOB_ID}`, `/studio?editJob=${JOB_ID}`],
  ["/post-a-job", HIRING_PERSONAS_ENABLED ? "/studio?contentTemplate=job_doc" : "/"],
  ["/companies/create", "/studio?contentTemplate=company_doc"],
  [`/companies/create/${DRAFT_ID}`, "/studio?contentTemplate=company_doc"],
  [`/companies/edit/${COMPANY_ID}`, `/studio?editCompany=${COMPANY_ID}`],
];

describe("legacy route redirects", () => {
  it.each(CASES)("%s → %s", (from, to) => {
    expect(landAt(from)).toBe(to);
  });

  it("covers every row of the table (no untested retirement)", () => {
    const tested = new Set(CASES.map(([from]) => from.replace(/[0-9a-f-]{36}/, ":id")));
    for (const row of LEGACY_REDIRECTS) expect(tested.has(row.path), row.path).toBe(true);
  });

  it("the shared studio paths match the frontend's entity hrefs", () => {
    expect(studioNewEntityHref("job")).toBe(STUDIO_NEW_JOB_PATH);
    expect(studioNewEntityHref("company")).toBe(STUDIO_NEW_COMPANY_PATH);
  });

  it("App.tsx mounts the table and no longer routes the retired pages", () => {
    const app = readFileSync(resolve(FRONTEND, "App.tsx"), "utf8");
    expect(app).toContain("LEGACY_REDIRECTS.map");
    for (const row of LEGACY_REDIRECTS) expect(app, row.path).not.toContain(`path="${row.path}"`);
  });

  it.each([
    "pages/JobCreatePage.tsx",
    "pages/PostAJob.tsx",
    "pages/CompanyCreatePage.tsx",
    "pages/CompanyEditPage.tsx",
    "components/company/CompanyBuilder.tsx",
  ])("the retired form %s is deleted", (file) => {
    expect(existsSync(resolve(FRONTEND, file))).toBe(false);
  });
});
