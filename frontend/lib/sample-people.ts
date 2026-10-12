// Hand-crafted sample candidates used by blog articles (and any other surface
// that wants to render a `PeopleCard` without hitting the real database).
// Each entry conforms to UserMetadata so it can be rendered alongside real
// candidates without branching the component code.
//
// Avatars use the public DiceBear API so no asset hosting is required.

import type { UserMetadata } from "@/types/people";

const NOW = "2026-04-26T00:00:00Z";

export const SAMPLE_PEOPLE: UserMetadata[] = [
  {
    id: "sample-jane-doe",
    slug: "jane-doe-product-designer",
    firstName: "Jane",
    lastName: "Doe",
    fullName: "Jane Doe",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Jane%20Doe",
    headline: "Senior Product Designer • Shipped onboarding from 38% → 61%",
    location: "San Francisco, CA",
    role: "job_seeker",
    visibility: "public",
    status: "looking",
    createdAt: NOW,
    updatedAt: NOW,
    lastActiveAt: NOW,
    profileViews: 1240,
    connectionCount: 342,
    followerCount: 128,
    emailConfirmed: true,
    isPro: true,
    openToWork: true,
    experienceLevel: "senior",
    currentPosition: "Lead Product Designer",
    currentCompany: "Lumen Health",
  },
  {
    id: "sample-marcus-chen",
    slug: "marcus-chen-staff-engineer",
    firstName: "Marcus",
    lastName: "Chen",
    fullName: "Marcus Chen",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Marcus%20Chen",
    headline: "Staff Software Engineer • Distributed systems, payments, Go/Rust",
    location: "Remote (PST)",
    role: "job_seeker",
    visibility: "public",
    status: "looking",
    createdAt: NOW,
    updatedAt: NOW,
    lastActiveAt: NOW,
    profileViews: 2180,
    connectionCount: 612,
    followerCount: 410,
    emailConfirmed: true,
    isPro: true,
    openToWork: true,
    experienceLevel: "staff",
    currentPosition: "Staff Engineer, Payments",
    currentCompany: "Bridgewall",
  },
  {
    id: "sample-priya-rao",
    slug: "priya-rao-enterprise-ae",
    firstName: "Priya",
    lastName: "Rao",
    fullName: "Priya Rao",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Priya%20Rao",
    headline: "Enterprise AE • 142% to plan FY24, $4.8M ARR closed",
    location: "Austin, TX",
    role: "job_seeker",
    visibility: "public",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    lastActiveAt: NOW,
    profileViews: 980,
    connectionCount: 487,
    followerCount: 215,
    emailConfirmed: true,
    isPro: true,
    openToWork: false,
    experienceLevel: "senior",
    currentPosition: "Enterprise Account Executive",
    currentCompany: "Northwind Cloud",
  },
];

export function getSamplePersonById(id: string): UserMetadata | undefined {
  return SAMPLE_PEOPLE.find((p) => p.id === id);
}
