/**
 * Re-export shim — the canonical world-3d mutation helpers now live in
 * [shared/world-3d-edit.ts](../../../../shared/world-3d-edit.ts) so the
 * Phase-5 AI agent route (server side) can import the same `addEntity`
 * / `updateEntity` / etc. as the frontend editor. One mutation surface,
 * one DRY commitment — no fork between agent and human author paths.
 *
 * Existing frontend callers (`<GameStage3D>`, `<InspectorPanel>`,
 * `<ChallengesPanel>`, the game-seed factory) continue to import from
 * this path; the shim forwards every export unchanged.
 */

export * from "@shared/world-3d-edit";
