/**
 * Bin folder tree helpers (#358).
 *
 * The `nle_media_sources.bin_folder` column is a free-text string. We
 * adopt a `/`-delimited path convention client-side: "broll/interviews"
 * is a child of "broll", "broll/interviews/2024" sits one level deeper,
 * etc. The server's rename endpoint understands the same convention so
 * moves stay consistent across browsers.
 *
 * This module owns the parse/normalise/tree logic so BinPanel + the
 * future drag-to-folder UI don't re-derive it.
 */

export interface BinFolderNode {
  /** Display name — the last segment of the path ("interviews"). */
  name: string;
  /** Full path key ("broll/interviews") — pass into renameFolder /
   *  store in nleMediaSources.bin_folder verbatim. Empty string for
   *  the synthetic root. */
  path: string;
  children: BinFolderNode[];
  /** How many sources sit directly in this folder (not in children). */
  directCount: number;
}

/** Normalise a stored bin folder string into a canonical path: trim
 *  leading/trailing slashes, collapse doubles. Null returns null. */
export function normaliseBinFolder(folder: string | null | undefined): string | null {
  if (!folder) return null;
  const clean = folder.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
  return clean || null;
}

/** Build a folder tree from a flat list of `bin_folder` strings.
 *  Folders that exist only as path prefixes (no source sits directly in
 *  them) appear in the tree with `directCount === 0`. */
export function buildBinFolderTree(
  folderPaths: ReadonlyArray<string | null | undefined>,
): BinFolderNode {
  const root: BinFolderNode = {
    name: "(root)",
    path: "",
    children: [],
    directCount: 0,
  };
  const index = new Map<string, BinFolderNode>();
  index.set("", root);

  for (const raw of folderPaths) {
    const norm = normaliseBinFolder(raw);
    if (norm === null) {
      root.directCount += 1;
      continue;
    }
    const segments = norm.split("/");
    let parentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const segPath = segments.slice(0, i + 1).join("/");
      let node = index.get(segPath);
      if (!node) {
        node = { name: segments[i], path: segPath, children: [], directCount: 0 };
        index.set(segPath, node);
        index.get(parentPath)!.children.push(node);
      }
      parentPath = segPath;
    }
    // Source sits in the leaf node (the full path).
    index.get(norm)!.directCount += 1;
  }

  // Sort each level alphabetically so the tree renders deterministically.
  const sortRecursive = (node: BinFolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortRecursive);
  };
  sortRecursive(root);

  return root;
}

/** Predicate: does the source belong in (or under) the given folder
 *  path? Empty path means "everything". */
export function folderMatches(
  sourceFolder: string | null | undefined,
  filterPath: string,
): boolean {
  if (!filterPath) return true;
  const norm = normaliseBinFolder(sourceFolder);
  if (!norm) return false;
  return norm === filterPath || norm.startsWith(`${filterPath}/`);
}
