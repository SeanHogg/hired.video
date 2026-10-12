/**
 * Content paths — the ONE way to point at a place inside a résumé's
 * `ResumeContent`, shared by the API and the frontend.
 *
 * A path is dot-separated segments over the JSON Resume document:
 *
 *   basics.label            a basics field
 *   work.2                  one entry of an array section
 *   work.2.highlights.1     one bullet of that entry
 *   work.2.summary          one field of that entry
 *   skills                  a whole section
 *
 * Every review surface anchors to these: a tailor change says WHERE it
 * edited (so Revert writes the original value back instead of fuzzy
 * matching text), the kit page annotates the entry / bullet a change or
 * merge decision belongs to, and create-from-a-job maps each requirement
 * to the bullets that prove it. Indices are positions in the stored
 * document (never a sorted render order).
 *
 * Pure: no I/O, never mutates its input.
 */

export type ContentPath = string;
export type PathSegment = string | number;

export function parsePath(path: ContentPath): PathSegment[] {
  if (!path) return [];
  return path.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

export function joinPath(...segments: ReadonlyArray<PathSegment | null | undefined>): ContentPath {
  return segments.filter((s) => s !== null && s !== undefined && s !== "").join(".");
}

/** The top-level section a path points into (`work.2.highlights.1` → `work`). */
export function sectionOf(path: ContentPath): string {
  return parsePath(path)[0]?.toString() ?? "";
}

/** The entry a path points into (`work.2.highlights.1` → `work.2`), or null
 *  when the path is not inside an array entry (`basics.label`, `skills`). */
export function entryPathOf(path: ContentPath): ContentPath | null {
  const [section, index] = parsePath(path);
  return typeof index === "number" ? joinPath(section, index) : null;
}

/** True when `path` is `ancestor` or lies inside it. */
export function isWithin(path: ContentPath, ancestor: ContentPath): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}

export function readAt(doc: unknown, path: ContentPath): unknown {
  let node: unknown = doc;
  for (const seg of parsePath(path)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[seg];
  }
  return node;
}

/** Copy `doc` with `value` written at `path` (structural sharing; only the
 *  nodes along the path are cloned). Missing objects along the way are
 *  created; an index past the end of an array appends. */
export function writeAt<T>(doc: T, path: ContentPath, value: unknown): T {
  const segments = parsePath(path);
  if (segments.length === 0) return value as T;
  const write = (node: unknown, depth: number): unknown => {
    const seg = segments[depth];
    const last = depth === segments.length - 1;
    if (typeof seg === "number") {
      const arr = Array.isArray(node) ? [...node] : [];
      arr[Math.min(seg, arr.length)] = last ? value : write(arr[seg], depth + 1);
      return arr;
    }
    const obj = node && typeof node === "object" && !Array.isArray(node) ? { ...(node as object) } : {};
    (obj as Record<string, unknown>)[seg] = last ? value : write((obj as Record<string, unknown>)[seg], depth + 1);
    return obj;
  };
  return write(doc, 0) as T;
}

/** Copy `doc` without the array items at `paths` (entries or bullets).
 *  Removals run deepest-and-highest-index first so earlier removals never
 *  shift the index a later path refers to. Non-array paths are ignored. */
export function omitPaths<T>(doc: T, paths: readonly ContentPath[]): T {
  const ordered = [...new Set(paths)]
    .map(parsePath)
    .filter((segs) => typeof segs[segs.length - 1] === "number")
    .sort((a, b) => b.length - a.length || compareSegments(b, a));
  let out = doc;
  for (const segs of ordered) {
    const index = segs[segs.length - 1] as number;
    const parentPath = joinPath(...segs.slice(0, -1));
    const parent = readAt(out, parentPath);
    if (!Array.isArray(parent) || index >= parent.length) continue;
    out = writeAt(out, parentPath, parent.filter((_, i) => i !== index));
  }
  return out;
}

/**
 * Where `path` lands once the array items at `omitted` are removed
 * (omitPaths): later siblings shift down. Null when `path` itself (or an
 * ancestor) was omitted.
 */
export function pathAfterOmit(path: ContentPath, omitted: readonly ContentPath[]): ContentPath | null {
  const segs = parsePath(path);
  const out = [...segs];
  for (const o of omitted) {
    const os = parsePath(o);
    const depth = os.length - 1;
    const oi = os[depth];
    if (typeof oi !== "number" || segs.length <= depth) continue;
    if (os.slice(0, depth).some((s, i) => s !== segs[i])) continue;
    const si = segs[depth];
    if (typeof si !== "number") continue;
    if (si === oi) return null;
    if (oi < si) out[depth] = (out[depth] as number) - 1;
  }
  return joinPath(...out);
}

function compareSegments(a: PathSegment[], b: PathSegment[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return a.length - b.length;
}

/** Compare résumé text the way every merge / diff surface does: case-,
 *  whitespace- and trim-insensitive. */
export function normalizeText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}
