/**
 * The CAD formats' canvas surfaces (#930): 2D vector drafting
 * (`<CadStage>`) and 3D primitive solids (`<Cad3DStage>`). Neither has a
 * left-tab / inspector surface of its own yet.
 */
import CadStage from "@/components/studio/cad/CadStage";
import Cad3DStage from "@/components/studio/cad-3d/Cad3DStage";
import type { Cad3DSurfaceCtx, CadSurfaceCtx } from "../types";

export function cadCanvas(ctx: CadSurfaceCtx) {
  const { cadState, setCadState, cadCommit, cadStateHydrated } = ctx.cad;
  return cadStateHydrated ? (
    <CadStage
      state={cadState}
      setState={setCadState}
      commit={cadCommit}
      zoom={Math.max(0.5, ctx.zoom * 2)}
      tool="select"
      drawColor="#0f172a"
      drawStrokeWidthMm={0.25}
    />
  ) : null;
}

export function cad3DCanvas(ctx: Cad3DSurfaceCtx) {
  const { cad3DState, setCad3DState, cad3DCommit, cad3DStateHydrated } = ctx.cad3d;
  return cad3DStateHydrated ? (
    <Cad3DStage
      state={cad3DState}
      setState={setCad3DState}
      commit={cad3DCommit}
      mode="edit"
      className="absolute inset-0"
    />
  ) : null;
}
