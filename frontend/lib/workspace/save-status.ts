/** Where the open document's save stands — one vocabulary for every saver
 *  in the workspace (a kit's résumé row, a format's project). "idle" =
 *  nothing saved yet in this visit; "conflict" = a newer copy was saved in
 *  another tab, so autosave waits for the user's choice (#2242). Mirrors
 *  useServerAutosave's AutosaveStatus. */
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
