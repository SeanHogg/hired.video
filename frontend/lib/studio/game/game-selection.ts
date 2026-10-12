/**
 * The game editor's selection bus — what the canvas, the levels / sprites
 * rails and the properties panel (2D + 3D) have selected. One selection per
 * project, shared by every game surface.
 */
export type GameSelection =
  | { kind: "canvas" }
  | { kind: "level"; levelId: string }
  | { kind: "sprite"; levelId: string; spriteId: string }
  // 3D world selection — used when `gameState.engine === "world-3d"`.
  // The right-rail `<Game3DRightRail>` reads this; GameStage3D
  // dispatches selection updates through the same gameSelection
  // setter the 2D path uses (DRY: one selection bus per project).
  | { kind: "entity-3d"; entityId: string };
