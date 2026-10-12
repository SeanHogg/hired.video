/**
 * Every non-Timeline format runtime the studio editor composes. Each canvas
 * runtime owns its own state model per PRD §1.2 (image #932, animation, CAD +
 * 3D CAD #930, Comic+ #1960, document #1912, game #939), each mounted
 * unconditionally (in this fixed order) so undo/redo needs no kind branch.
 * Lifted out of StudioEditorV2.
 */
import { useImageRuntime } from "./use-image-runtime";
import { useAnimationRuntime } from "./use-animation-runtime";
import { useGameRuntime } from "./use-game-runtime";
import {
  type StudioRuntimes,
  useCad3DRuntime,
  useCadRuntime,
  useDocumentRuntime,
  useInteractiveComicRuntime,
} from "./use-history-runtimes";

export function useStudioRuntimes(): StudioRuntimes {
  const image = useImageRuntime();
  const animation = useAnimationRuntime();
  const cad = useCadRuntime();
  const cad3d = useCad3DRuntime();
  const interactiveComic = useInteractiveComicRuntime();
  const document = useDocumentRuntime();
  const game = useGameRuntime();
  return { image, animation, game, cad, cad3d, interactiveComic, document };
}
