/**
 * useKitProject — the studio project a career kit IS (subjects `resume` +
 * `resume_video`, see resumeVideoLinks). The résumé row stays the one place
 * the kit's text, letter and video plan live; the project carries the
 * rendered output (timelineSpec + hosted MP4) and is what the studio
 * library, analytics, embed and Post work with.
 *
 *   • Opened at /studio/<projectId>: that is the project.
 *   • New kit / /studio/resume/<id>: once the résumé has a row, the project
 *     carrying its `resume_video` link is found — or made, once — and the
 *     address becomes /studio/<projectId> (replace, with router state so
 *     the same workspace stays mounted; see workspace-route.ts).
 *   • Find-or-make is ONE in-flight promise (`ensureProjectId`), shared with
 *     the Post panel's publisher, and a failed lookup never creates — so a
 *     résumé never gets two kit projects.
 *   • The project's timelineSpec follows the video once the kit is EDITED
 *     in this visit (or the project was made in it) — debounced, flushed
 *     when the tab hides or the kit closes — so the library shows what the
 *     kit shows. Only looking writes nothing: narration landing on open
 *     changes the video without anyone editing it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resumeVideoLinks } from "@shared/studio-subject";
import { studioService } from "@/lib/services/studio-service";
import type { ResumeContent } from "@shared/resume";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { KitRouteState } from "./workspace-route";

const SYNC_DEBOUNCE_MS = 4000;

interface Args {
  /** The project in the URL, when the kit was opened by it. */
  routeProjectId: string | null;
  /** The résumé's row, once it has one (useDraftAutosave). */
  resumeId: string | null;
  /** Project name (the video's title). */
  title: string;
  /** The video as shown — written to the project as derived output. */
  canvas: CanvasState | null;
  /** The résumé as shown: a change to it after the project opened is an
   *  edit (the video is derived from it). */
  draft: ResumeContent | null;
  /** Which draft that is (the intake source): another one (a version
   *  opened in place) is not an edit of this project's résumé. */
  draftKey: unknown;
}

export function useKitProject({ routeProjectId, resumeId, title, canvas, draft, draftKey }: Args) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [projectId, setProjectId] = useState<string | null>(routeProjectId);
  const latest = useRef({ title, canvas, projectId, resumeId });
  latest.current = { title, canvas, projectId, resumeId };
  const inflight = useRef<{ resumeId: string; promise: Promise<string | null> } | null>(null);
  // Projects whose timeline follows the video, with what it last held:
  // made in this visit, or edited in it.
  const following = useRef(new Map<string, CanvasState | null>());

  // A different project in the URL (Back / a link) wins.
  useEffect(() => {
    if (routeProjectId) setProjectId(routeProjectId);
  }, [routeProjectId]);

  // The project belongs to ONE résumé: Start over (no résumé) or opening
  // another résumé in this workspace lets go of it.
  const ownerRef = useRef<string | null>(null);
  useEffect(() => {
    const owner = ownerRef.current;
    ownerRef.current = resumeId;
    if (!owner || owner === resumeId) return;
    inflight.current = null;
    setProjectId(null);
    if (!resumeId) navigate("/studio/new", { replace: true });
  }, [resumeId, navigate]);

  /** The résumé's ONE kit project — found, or made once. Null while there
   *  is no résumé row, or when the lookup failed (no session yet, offline):
   *  a later call retries. */
  const ensureProjectId = useCallback((): Promise<string | null> => {
    const { projectId: known, resumeId: owner } = latest.current;
    if (known) return Promise.resolve(known);
    if (!owner) return Promise.resolve(null);
    if (inflight.current?.resumeId === owner) return inflight.current.promise;
    const links = resumeVideoLinks(owner);
    const promise = (async () => {
      try {
        const found = await studioService.findSubjectProjectStrict(links.reuse, "video");
        let id = found?.id ?? null;
        if (!id) {
          const made = latest.current.canvas;
          id = (await studioService.saveVideoDraft({ name: latest.current.title, canvas: made, subjects: links.save })).data?.id ?? null;
          if (id) following.current.set(id, made);
        }
        if (id && latest.current.resumeId === owner) setProjectId(id);
        if (!id) inflight.current = null;
        return id;
      } catch {
        inflight.current = null;
        return null;
      }
    })();
    inflight.current = { resumeId: owner, promise };
    return promise;
  }, []);

  useEffect(() => {
    if (!projectId && resumeId) void ensureProjectId();
  }, [projectId, resumeId, ensureProjectId]);

  // The address names the project.
  useEffect(() => {
    if (!projectId) return;
    const target = `/studio/${encodeURIComponent(projectId)}`;
    if (pathname === target) return;
    const state: KitRouteState = { kit: { projectId, resumeId } };
    // Keep one-shot entry params (?section=…) until the entry hook has read
    // them: it clears them itself.
    navigate(`${target}${search}`, { replace: true, state });
    // `search` is carried, not watched.
  }, [projectId, resumeId, pathname, navigate]);

  // Derived output: the project's timeline follows the video.
  const synced = useRef<CanvasState | null>(null);
  const pending = useRef<{ projectId: string; canvas: CanvasState; name: string } | null>(null);
  const flush = useCallback(() => {
    const due = pending.current;
    if (!due) return;
    pending.current = null;
    synced.current = due.canvas;
    void studioService
      .saveVideoDraft({ name: due.name, projectId: due.projectId, canvas: due.canvas })
      .catch(() => {
        synced.current = null;
      });
  }, []);
  // The résumé a project opened with: a later one is an edit.
  const opened = useRef<{ projectId: string; draft: ResumeContent; draftKey: unknown } | null>(null);
  useEffect(() => {
    // Another project's edits still waiting (opened another résumé): write
    // them to THEIR project before anything else.
    if (pending.current && pending.current.projectId !== projectId) flush();
    if (!projectId || !canvas || !draft) return;
    const follows = following.current;
    if (opened.current?.projectId !== projectId) {
      opened.current = { projectId, draft, draftKey };
      // Made here: it holds the video it was made with. Opened: what it
      // holds is the baseline.
      synced.current = follows.has(projectId) ? follows.get(projectId) ?? null : canvas;
    } else if (draftKey !== opened.current.draftKey) {
      // Another résumé on screen, this project not yet let go of (the
      // owner hand-off is a render behind): its video is not this one's.
      return;
    } else if (draft !== opened.current.draft && !follows.has(projectId)) {
      follows.set(projectId, synced.current);
    }
    if (!follows.has(projectId) || synced.current === canvas) return;
    pending.current = { projectId, canvas, name: latest.current.title };
    const handle = window.setTimeout(flush, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [projectId, canvas, draft, draftKey, flush]);
  // Don't drop the last edits: write them when the tab hides or the kit closes.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flush]);

  return { projectId, ensureProjectId };
}
