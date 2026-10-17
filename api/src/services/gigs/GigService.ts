// GigService — freelance / gig marketplace domain logic (#101).
//
// Hybrid model (decided 2026-06-12):
//   • gig_projects / gig_bids  — the marketplace: any user posts a brief with
//     deliverable items, others bid, the owner awards one. (#101 backend)
//   • gig_milestones           — the deliverable items, defined at post time,
//     each carrying its own escrow amount + status machine.
//   • tasks                    — on award, every milestone is materialised as
//     a personal task owned by the winning creator, so they work the gig on
//     the SAME reusable kanban board as their personal tasks (Content Creator
//     → Gigs). The task ↔ milestone link (tasks.gig_milestone_id) keeps the
//     two in lock-step: completing the task submits the milestone for the
//     poster to approve + release escrow.
//
// Route handlers stay thin — all multi-table writes (award, status sync) live
// in the cohesive modules below behind a transaction so the bridge can't
// half-apply. This class is a thin facade so `gigService.*` callers are
// unchanged:
//   gigProjects.ts — post + marketplace/owner/detail reads
//   gigBids.ts     — bids + award (task materialisation)
//   gigWork.ts     — creator work board + status sync
//   gigEscrow.ts   — milestones + escrow release
//   gigDisputes.ts — disputes (#1768)

import * as bids from "./gigBids.js";
import * as disputes from "./gigDisputes.js";
import * as escrow from "./gigEscrow.js";
import * as projects from "./gigProjects.js";
import { bumpGigVersion } from "./gigShared.js";
import * as work from "./gigWork.js";

export { GigError, type CreateGigInput, type GigItemInput, type PlaceBidInput } from "./gigShared.js";

export class GigService {
  /** Drop the version token so every cached gig read key becomes unreachable.
   *  Called by every gig write (incl. the escrow-release route handler). */
  bumpVersion(): void {
    bumpGigVersion();
  }

  // ── projects ─────────────────────────────────────────────────────────────
  createProject = projects.createProject;
  listOpenProjects = projects.listOpenProjects;
  listMyProjects = projects.listMyProjects;
  getProject = projects.getProject;

  // ── bids ─────────────────────────────────────────────────────────────────
  placeBid = bids.placeBid;
  listBidsForProject = bids.listBidsForProject;
  listMyBids = bids.listMyBids;
  awardBid = bids.awardBid;

  // ── creator work board ───────────────────────────────────────────────────
  listMyWork = work.listMyWork;
  updateWorkStatus = work.updateWorkStatus;

  // ── milestones + escrow ──────────────────────────────────────────────────
  addMilestone = escrow.addMilestone;
  approveMilestone = escrow.approveMilestone;
  releaseMilestoneEscrow = escrow.releaseMilestoneEscrow;

  // ── disputes (#1768) ─────────────────────────────────────────────────────
  openDispute = disputes.openDispute;
  addDisputeEvent = disputes.addDisputeEvent;
  getDisputeForMilestone = disputes.getDisputeForMilestone;
  resolveDispute = disputes.resolveDispute;
}

export const gigService = new GigService();
