/**
 * Merge decisions — the pure builders now live in shared/ so the Chrome
 * extension's profile import uses the same defaults as the web merge
 * surfaces. Re-exported here so existing importers keep their path.
 */
export {
  addedEntryPaths,
  buildBasicDecisions,
  buildDecisions,
  buildFinalDecisions,
  buildNewItemDecisions,
  newItemKey,
  type BasicDecisions,
} from "@shared/resume-merge-decisions";
