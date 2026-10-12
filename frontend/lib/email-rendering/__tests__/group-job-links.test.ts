/**
 * Tests for `groupJobLinks` — the helper that pairs title-anchor +
 * Apply-anchor pairs into one row per role in the inbox detail
 * sheet's Job-actions card. Each scenario mirrors a real digest
 * email shape (LinkedIn Job Alerts, Indeed, Greenhouse).
 *
 * Run: vitest run lib/email-rendering/__tests__/group-job-links.test.ts
 */

import { describe, it, expect } from "vitest";
import { groupJobLinks } from "../group-job-links";

describe("groupJobLinks", () => {
  it("merges LinkedIn title + Apply anchors that share a numeric job id", () => {
    const groups = groupJobLinks([
      {
        url: "https://www.linkedin.com/comm/jobs/view/3892357412?trk=eml-1",
        label: "Founding CTO",
      },
      {
        url: "https://www.linkedin.com/comm/jobs/view/3892357412?trk=eml-2",
        label: "Apply",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      jobId: "li:3892357412",
      title: "Founding CTO",
    });
    expect(groups[0].viewUrl).toContain("trk=eml-1");
    expect(groups[0].applyUrl).toContain("trk=eml-2");
  });

  it("drops alert-management anchors by label", () => {
    const groups = groupJobLinks([
      {
        url: "https://www.linkedin.com/comm/jobs/alerts/settings/12345",
        label: "Manage alerts",
      },
      {
        url: "https://www.linkedin.com/comm/jobs/alerts/edit/12345",
        label: "Edit alert",
      },
      {
        url: "https://www.linkedin.com/comm/jobs/view/9999999",
        label: "Senior VP of Engineering",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Senior VP of Engineering");
  });

  it("drops alert-management anchors by URL path even when the label looks like a job", () => {
    const groups = groupJobLinks([
      {
        // LinkedIn sometimes labels this with the saved search term
        // itself ("Your job alert for chief technology officer").
        url: "https://www.linkedin.com/comm/jobs/alerts/edit/abc123",
        label: "Chief Technology Officer",
      },
    ]);
    expect(groups).toHaveLength(0);
  });

  it("emits unlabeled / pure-Apply anchors as ungrouped fallbacks when no other anchor shares the id", () => {
    const groups = groupJobLinks([
      {
        url: "https://boards.greenhouse.io/acme/jobs/4567890",
        label: null,
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("View role");
    expect(groups[0].applyUrl).toBe(groups[0].viewUrl);
  });

  it("groups Indeed digest links by the jk query param", () => {
    const groups = groupJobLinks([
      {
        url: "https://www.indeed.com/viewjob?jk=abc123xyz&from=email",
        label: "Director of Consulting",
      },
      {
        url: "https://www.indeed.com/viewjob?jk=abc123xyz&from=email&apply=1",
        label: "Apply now",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      jobId: "ind:abc123xyz",
      title: "Director of Consulting",
    });
  });

  it("groups generic ATS slug anchors (Greenhouse / Lever / Ashby)", () => {
    const groups = groupJobLinks([
      {
        url: "https://boards.greenhouse.io/acme/jobs/staff-engineer-9876",
        label: "Staff Engineer",
      },
      {
        url: "https://boards.greenhouse.io/acme/jobs/staff-engineer-9876/apply",
        label: "Apply",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Staff Engineer");
  });

  it("picks the longest descriptive label when several non-Apply anchors share an id", () => {
    const groups = groupJobLinks([
      {
        url: "https://www.linkedin.com/comm/jobs/view/1234567",
        label: "CTO",
      },
      {
        url: "https://www.linkedin.com/comm/jobs/view/1234567",
        label: "Founding CTO at Talently",
      },
    ]);
    expect(groups[0].title).toBe("Founding CTO at Talently");
  });
});
