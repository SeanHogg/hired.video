/**
 * Tests for the company-profile feature DTO enrichment — the fields that
 * used to be hardcoded stub fiction in rowToCompanyProfile (benefits,
 * culture, values, mission, vision, technologies, perks, tagline,
 * locations, teamMembers, views) are now real data. These tests pin the
 * expected DTO shape.
 *
 * The serializer is pure: it takes (row, counts, locations, teamMembers,
 * viewerId) and produces the full CompanyProfileDTO. No DB in the path.
 *
 * Run: node --import tsx --test src/routes/__tests__/company-features.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { rowToCompanyProfile, type CompanyProfileExtras } from "../companies.js";

function makeRow(overrides: Partial<Record<string, unknown>> = {}): any {
  const now = new Date("2026-04-19T00:00:00Z");
  return {
    id: "company-1",
    ownerId: "owner-1",
    name: "Acme Robotics",
    slug: "acme-robotics",
    description: "We build robots.",
    website: "https://acme.example",
    logoUrl: "https://cdn.example/logo.png",
    industry: "Robotics",
    size: "11-50",
    foundedYear: 2019,
    headquarters: "Detroit, MI",
    tagline: "Robots that care.",
    mission: "Make robots that improve human life.",
    vision: "A world where robots handle the drudgery.",
    technologies: ["TypeScript", "Rust", "ROS 2"],
    perks: ["Free espresso", "Remote Fridays"],
    culture: ["Transparent", "Curious"],
    values: ["Integrity", "Craft"],
    benefits: {
      healthInsurance: true,
      retirement401k: true,
      remoteWork: true,
      other: ["Pet insurance"],
    },
    isVerified: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const emptyExtras: CompanyProfileExtras = {
  jobCount: 0,
  activeJobCount: 0,
  followerCount: 0,
  viewCount: 0,
  locations: [],
  teamMembers: [],
};

describe("rowToCompanyProfile — real feature DTO", () => {
  it("surfaces tagline, mission, vision, technologies, perks, culture, values directly from the row", () => {
    const dto = rowToCompanyProfile(makeRow(), emptyExtras, null);
    assert.equal(dto.tagline, "Robots that care.");
    assert.equal(dto.mission, "Make robots that improve human life.");
    assert.equal(dto.vision, "A world where robots handle the drudgery.");
    assert.deepEqual(dto.technologies, ["TypeScript", "Rust", "ROS 2"]);
    assert.deepEqual(dto.perks, ["Free espresso", "Remote Fridays"]);
    assert.deepEqual(dto.culture, ["Transparent", "Curious"]);
    assert.deepEqual(dto.values, ["Integrity", "Craft"]);
  });

  it("surfaces the structured benefits object with boolean flags", () => {
    const dto = rowToCompanyProfile(makeRow(), emptyExtras, null);
    assert.equal(dto.benefits.healthInsurance, true);
    assert.equal(dto.benefits.retirement401k, true);
    assert.equal(dto.benefits.remoteWork, true);
    assert.deepEqual(dto.benefits.other, ["Pet insurance"]);
    // A flag that wasn't set is falsy (absent, not fabricated as false)
    assert.equal(dto.benefits.stockOptions, undefined);
  });

  it("surfaces the aggregated view count from extras (no fake 0)", () => {
    const dto = rowToCompanyProfile(makeRow(), { ...emptyExtras, viewCount: 42 }, null);
    assert.equal(dto.views, 42);
  });

  it("surfaces locations verbatim from extras", () => {
    const locations = [
      {
        id: "loc-1",
        companyId: "company-1",
        label: "HQ",
        address: "1 Main St",
        city: "Detroit",
        region: "MI",
        postalCode: "48201",
        countryCode: "US",
        isPrimary: true,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any;
    const dto = rowToCompanyProfile(makeRow(), { ...emptyExtras, locations }, null);
    assert.equal(dto.locations.length, 1);
    assert.equal(dto.locations[0].city, "Detroit");
    assert.equal(dto.locations[0].isPrimary, true);
  });

  it("surfaces team members verbatim from extras", () => {
    const teamMembers = [
      {
        id: "tm-1",
        companyId: "company-1",
        userId: null,
        name: "Ada Lovelace",
        title: "CTO",
        bio: "Leads engineering.",
        avatarUrl: null,
        linkedinUrl: null,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any;
    const dto = rowToCompanyProfile(makeRow(), { ...emptyExtras, teamMembers }, null);
    assert.equal(dto.teamMembers.length, 1);
    assert.equal(dto.teamMembers[0].name, "Ada Lovelace");
    assert.equal(dto.teamMembers[0].title, "CTO");
  });

  it("returns empty arrays / empty benefits object when the row has no data yet", () => {
    const bareRow = makeRow({
      tagline: null,
      mission: null,
      vision: null,
      technologies: [],
      perks: [],
      culture: [],
      values: [],
      benefits: {},
    });
    const dto = rowToCompanyProfile(bareRow, emptyExtras, null);
    assert.equal(dto.tagline, null);
    assert.equal(dto.mission, null);
    assert.equal(dto.vision, null);
    assert.deepEqual(dto.technologies, []);
    assert.deepEqual(dto.perks, []);
    assert.deepEqual(dto.culture, []);
    assert.deepEqual(dto.values, []);
    assert.deepEqual(dto.benefits, {});
    assert.deepEqual(dto.locations, []);
    assert.deepEqual(dto.teamMembers, []);
    assert.equal(dto.views, 0);
  });

  it("sets isOwner/canEdit=true when viewerId matches ownerId", () => {
    const dto = rowToCompanyProfile(makeRow(), emptyExtras, "owner-1");
    assert.equal(dto.isOwner, true);
    assert.equal(dto.canEdit, true);
  });

  it("sets isOwner/canEdit=false for anonymous or non-owner viewers", () => {
    assert.equal(rowToCompanyProfile(makeRow(), emptyExtras, null).isOwner, false);
    assert.equal(rowToCompanyProfile(makeRow(), emptyExtras, "someone-else").isOwner, false);
  });
});
