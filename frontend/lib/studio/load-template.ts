/**
 * A built-in visual template (data/templates/<file>.json) as a video
 * script, or null when there is no such file. Each file is its own chunk,
 * loaded only when asked for.
 */
import type { VideoScript } from "@/types/video-script";

export async function loadTemplate(file: string): Promise<VideoScript | null> {
  try {
    const mod = await import(`../../data/templates/${file}.json`);
    return mod.default as VideoScript;
  } catch {
    return null;
  }
}
