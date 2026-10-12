/**
 * Embed runtime (#1826/#1828) — makes a pasted snippet actually load + render.
 *
 *   /embed/v1/loader.js  — the loader: reads data-hired-* attrs, injects the
 *                          iframe, auto-resizes via postMessage. (public asset)
 *   /embed/v1/frame      — the iframe document: validates the key, sets a
 *                          frame-ancestors CSP from the key's allowed origins
 *                          (the browser-enforced cross-site gate), then renders
 *                          the surface from the data API. (public asset)
 *   /api/embed/v1/:view  — key-authenticated, READ-ONLY data for a surface.
 *                          Reuses the SAME segment-scoped PeopleOpsService the
 *                          authed app uses (DRY); returns a SAFE projection
 *                          (no salary/comp/email/phone/notes).
 *
 * Auth: a validated company embed key resolves the company's People-Ops
 * segment (no user session). See services/company/embed.ts resolveEmbedRequest.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  resolveEmbedRequest,
  EmbedAuthError,
} from "../services/company/embed.js";
import { getDb } from "../db/index.js";
import { studioProjects, videos } from "../db/schema/index.js";
import { cdnUrl } from "../utils/cdn.js";
import {
  PeopleOpsService,
  defaultPeopleOpsServiceDeps,
  type RosterEmployee,
} from "../domains/people-ops/peopleOpsService.js";
import { EMBED_VIEW_KEYS } from "../../../shared/embed.js";
import { computeTeamHealth } from "../domains/people-ops/teamHealth.js";
import { checkRateLimit } from "../utils/rate-limit.js";

/** Per-key soft rate limit on the public embed data API (#1828) — 120 reads
 *  per key per minute is generous for a live dashboard refresh while capping
 *  scraping/abuse of an unauthenticated, key-only surface. */
const EMBED_RATE_LIMIT = 120;
const EMBED_RATE_WINDOW_SECONDS = 60;

function readKey(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }): string {
  return c.req.header("x-hired-embed-key") || c.req.query("key") || "";
}

function mapEmbedError(c: any, e: unknown) {
  if (e instanceof EmbedAuthError) {
    const status = e.code === "INVALID_KEY" || e.code === "EXPIRED" ? 401 : 403;
    return c.json(error(e.code, e.message), status as 401 | 403);
  }
  return c.json(error("INTERNAL_ERROR", "Embed render failed"), 500);
}

/** SAFE projection — embeds never expose comp/PII. */
function safeEmployee(e: RosterEmployee) {
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    position: e.position,
    department: e.department,
    status: e.status,
    avatar: e.avatar,
    managerId: e.managerId,
    isFounder: e.isFounder,
  };
}

const buildService = () => new PeopleOpsService(defaultPeopleOpsServiceDeps());

// ── Data API ────────────────────────────────────────────────────────────────
export const embedApiRoutes = new Hono<AppEnv>();

embedApiRoutes.get("/v1/:view", async (c) => {
  const view = c.req.param("view");
  if (!EMBED_VIEW_KEYS.includes(view)) {
    return c.json(error("NOT_FOUND", "Unknown embed view"), 404);
  }
  try {
    const embedKey = readKey(c);
    // Per-key soft rate limit (#1828) — key on the unguessable prefix + view so
    // one key hammering one surface is throttled without affecting other keys.
    const rl = await checkRateLimit(
      `embed:${embedKey.slice(0, 16)}:${view}`,
      EMBED_RATE_LIMIT,
      EMBED_RATE_WINDOW_SECONDS,
    );
    if (!rl.allowed) {
      c.header("Retry-After", String(rl.retryAfterSeconds));
      return c.json(error("RATE_LIMITED", "Too many requests for this embed key"), 429);
    }
    const { scope } = await resolveEmbedRequest(embedKey, view, {
      origin: c.req.header("origin") ?? null,
    });
    const svc = buildService();
    if (view === "roster") {
      const [employees, hierarchy, metrics] = await Promise.all([
        svc.listEmployees(scope),
        svc.getHierarchy(scope),
        svc.getTeamMetrics(scope),
      ]);
      const mapNode = (n: { employee: RosterEmployee; reports: any[] }): unknown => ({
        employee: safeEmployee(n.employee),
        reports: n.reports.map(mapNode),
      });
      return c.json(
        success({
          displayName: scope.displayName,
          metrics: {
            totalHeadcount: metrics.totalHeadcount,
            activeHeadcount: metrics.activeHeadcount,
            departmentBreakdown: metrics.departmentBreakdown,
          },
          employees: employees.map(safeEmployee),
          hierarchy: hierarchy.map(mapNode),
        }),
      );
    }
    if (view === "team-health") {
      const health = await computeTeamHealth(scope);
      return c.json(success({ displayName: scope.displayName, ...health }));
    }
    if (view === "goals") {
      const [goals, employees] = await Promise.all([svc.listGoals(scope), svc.listEmployees(scope)]);
      const nameOf = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));
      return c.json(
        success({
          displayName: scope.displayName,
          goals: goals.map((g) => ({
            id: g.id,
            title: g.title,
            ownerName: nameOf.get(g.employeeId) ?? "—",
            status: g.status,
            priority: g.priority,
            progress: g.progress,
            atRisk: g.atRisk,
            dueDate: g.dueDate,
          })),
        }),
      );
    }
    // one-on-ones
    const [sessions, employees] = await Promise.all([
      svc.listOneOnOnes(scope),
      svc.listEmployees(scope),
    ]);
    const nameOf = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));
    return c.json(
      success({
        displayName: scope.displayName,
        sessions: sessions.map((s) => ({
          id: s.id,
          supervisorName: nameOf.get(s.supervisorId) ?? "—",
          participantName: nameOf.get(s.participantId) ?? "—",
          scheduledDate: s.scheduledDate,
          status: s.status,
          duration: s.duration,
          agendaCount: Array.isArray(s.agenda) ? s.agenda.length : 0,
        })),
      }),
    );
  } catch (e) {
    return mapEmbedError(c, e);
  }
});

// ── Assets (loader + frame) ───────────────────────────────────────────────────
export const embedAssetRoutes = new Hono<AppEnv>();

const LOADER_JS = `(function(){
  var s = document.currentScript;
  if (!s) return;
  var base = new URL(s.src).origin;
  var company = s.getAttribute('data-hired-company');
  var view = s.getAttribute('data-hired-view') || 'roster';
  var key = s.getAttribute('data-hired-key');
  if (!company || !key || key.indexOf('HIRED_EMBED_KEY') !== -1) {
    console.error('[hired.video embed] missing data-hired-company / data-hired-key (did you inject the key from an env var?)');
    return;
  }
  var mount = s.nextElementSibling;
  if (!mount || !mount.hasAttribute('data-hired-embed')) {
    mount = document.querySelector('[data-hired-embed]');
  }
  if (!mount) { mount = document.createElement('div'); s.parentNode.insertBefore(mount, s.nextSibling); }
  var iframe = document.createElement('iframe');
  var q = 'company=' + encodeURIComponent(company) + '&view=' + encodeURIComponent(view) + '&key=' + encodeURIComponent(key);
  iframe.src = base + '/embed/v1/frame?' + q;
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.minHeight = '320px';
  iframe.setAttribute('title', 'hired.video');
  iframe.setAttribute('loading', 'lazy');
  mount.innerHTML = '';
  mount.appendChild(iframe);
  window.addEventListener('message', function(ev){
    if (ev.origin !== base) return;
    var d = ev.data || {};
    if (d.type === 'hired-embed-height' && typeof d.height === 'number') {
      iframe.style.height = d.height + 'px';
    }
  });
})();`;

embedAssetRoutes.get("/v1/loader.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(LOADER_JS);
});

function escapeAttr(s: string): string {
  return s.replace(/[<>"'&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" }[ch] as string));
}

embedAssetRoutes.get("/v1/frame", async (c) => {
  const view = c.req.query("view") || "roster";
  const key = c.req.query("key") || "";
  if (!EMBED_VIEW_KEYS.includes(view)) return c.text("Unknown view", 404);

  // Validate the key here so we can (a) set frame-ancestors from the key's
  // allowed origins — the browser-enforced cross-site gate — and (b) fail
  // closed before serving any markup.
  let frameAncestors = "'none'";
  try {
    const { allowedOrigins } = await resolveEmbedRequest(key, view, {});
    frameAncestors = allowedOrigins.length ? allowedOrigins.join(" ") : "*";
  } catch (e) {
    const msg = e instanceof EmbedAuthError ? e.message : "Embed unavailable";
    c.header("Content-Type", "text/html; charset=utf-8");
    return c.body(`<!doctype html><meta charset=utf-8><body style="font:14px system-ui;color:#b91c1c;padding:16px">${escapeAttr(msg)}</body>`);
  }

  c.header("Content-Type", "text/html; charset=utf-8");
  c.header("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
  return c.body(FRAME_HTML(view, key));
});

/** Self-contained iframe document — no SPA bundle. Fetches the data API
 *  (same-origin) and renders a light, read-only surface, then reports its
 *  height to the parent for auto-resize. */
function FRAME_HTML(view: string, key: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{color-scheme:light}
  body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:16px;color:#111827}
  h2{font-size:16px;margin:0 0 12px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px}
  th{color:#6b7280;font-weight:600}
  .badge{display:inline-block;padding:1px 8px;border-radius:9999px;background:#eef2ff;color:#3730a3;font-size:11px}
  .muted{color:#6b7280}
  .stat{display:inline-block;margin-right:18px}.stat b{font-size:18px}
  .pwr{margin-top:14px;font-size:11px;color:#9ca3af}
</style></head><body>
<div id="root" class="muted">Loading…</div>
<div class="pwr">Powered by hired.video</div>
<script>
(function(){
  var view=${JSON.stringify(view)}, key=${JSON.stringify(key)};
  var root=document.getElementById('root');
  function esc(s){return String(s==null?'':s).replace(/[<>&]/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;'}[c];});}
  function postHeight(){ try{ parent.postMessage({type:'hired-embed-height',height:document.body.scrollHeight}, '*'); }catch(e){} }
  fetch('/api/embed/v1/'+encodeURIComponent(view)+'?key='+encodeURIComponent(key))
    .then(function(r){ if(!r.ok) throw new Error('unavailable'); return r.json(); })
    .then(function(res){
      var d=res.data;
      if(view==='roster'){
        var rows=(d.employees||[]).map(function(e){
          return '<tr><td>'+esc(e.firstName)+' '+esc(e.lastName)+(e.isFounder?' <span class=badge>Founder</span>':'')+'</td><td>'+esc(e.position)+'</td><td>'+esc(e.department)+'</td><td class=muted>'+esc(e.status)+'</td></tr>';
        }).join('');
        root.className='';
        root.innerHTML='<h2>'+esc(d.displayName)+' · Team</h2>'+
          '<div style="margin-bottom:12px"><span class=stat><b>'+d.metrics.totalHeadcount+'</b> <span class=muted>total</span></span>'+
          '<span class=stat><b>'+d.metrics.activeHeadcount+'</b> <span class=muted>active</span></span></div>'+
          (rows?'<table><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class=muted>No team members yet.</p>');
      } else if(view==='team-health'){
        var dims=d.dimensions||{};
        var rowsH=Object.keys(dims).map(function(k){
          return '<tr><td>'+esc(k)+'</td><td><div style="background:#e5e7eb;border-radius:9999px;height:6px;width:160px;overflow:hidden"><div style="background:#4f46e5;height:6px;width:'+dims[k]+'%"></div></div></td><td class=muted>'+dims[k]+'</td></tr>';
        }).join('');
        root.className='';
        root.innerHTML='<h2>'+esc(d.displayName)+' · Team Health</h2>'+
          '<div style="font-size:40px;font-weight:700;margin-bottom:8px">'+d.score+'<span style="font-size:16px;color:#6b7280">/100</span></div>'+
          '<table><tbody>'+rowsH+'</tbody></table>';
      } else if(view==='goals'){
        var rows=(d.goals||[]).map(function(g){
          var bar='<div style="background:#e5e7eb;border-radius:9999px;height:6px;width:120px;overflow:hidden"><div style="background:'+(g.atRisk?'#dc2626':'#4f46e5')+';height:6px;width:'+g.progress+'%"></div></div>';
          return '<tr><td>'+esc(g.title)+(g.atRisk?' <span class=badge style="background:#fee2e2;color:#991b1b">At risk</span>':'')+'</td><td class=muted>'+esc(g.ownerName)+'</td><td>'+bar+'</td><td class=muted>'+g.progress+'%</td></tr>';
        }).join('');
        root.className='';
        root.innerHTML='<h2>'+esc(d.displayName)+' · Goals & OKRs</h2>'+
          (rows?'<table><thead><tr><th>Goal</th><th>Owner</th><th>Progress</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class=muted>No goals yet.</p>');
      } else {
        var rows=(d.sessions||[]).map(function(s){
          return '<tr><td>'+esc(s.supervisorName)+' ↔ '+esc(s.participantName)+'</td><td class=muted>'+new Date(s.scheduledDate).toLocaleString()+'</td><td class=muted>'+esc(s.status)+'</td></tr>';
        }).join('');
        root.className='';
        root.innerHTML='<h2>'+esc(d.displayName)+' · 1:1s</h2>'+
          (rows?'<table><thead><tr><th>Participants</th><th>When</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class=muted>No 1:1s scheduled.</p>');
      }
      postHeight(); setTimeout(postHeight,200);
    })
    .catch(function(){ root.className='muted'; root.textContent='This embed is unavailable.'; postHeight(); });
  window.addEventListener('resize', postHeight);
})();
</script></body></html>`;
}

// ── Video embed (#1860) ───────────────────────────────────────────────────────
// Public, KEYLESS embedding of a published Studio video on any site.
//   /embed/video/loader.js — reads data-hired-video, injects the iframe.
//   /embed/video/frame     — self-contained player; resolves the video
//                            server-side and bakes the CDN URL into the
//                            markup (no SPA bundle, no second fetch).
// Unlike the company-data surfaces above, a published video is public
// marketing content, so no key is required. Private projects are refused.

interface EmbeddableVideo {
  title: string;
  videoUrl: string | null;
  youtubeVideoId: string | null;
  thumbnailUrl: string | null;
}

/** Resolve a Studio project id to its rendered, publicly-embeddable
 *  video. Returns null when the project is missing, private, or not yet
 *  rendered (an external iframe can't run the live canvas renderer). */
async function resolveEmbeddableVideo(id: string): Promise<EmbeddableVideo | null> {
  const db = getDb();
  const [row] = await db
    .select({
      title: videos.title,
      r2Key: videos.r2Key,
      youtubeVideoId: videos.youtubeVideoId,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
    })
    .from(studioProjects)
    .leftJoin(videos, eq(videos.id, studioProjects.videoId))
    .where(eq(studioProjects.id, id))
    .limit(1);
  if (!row) return null;
  if (row.privacyStatus === "private") return null;
  const videoUrl = row.r2Key ? cdnUrl(row.r2Key) : null;
  if (!videoUrl && !row.youtubeVideoId) return null; // not rendered yet
  return {
    title: row.title ?? "Video",
    videoUrl,
    youtubeVideoId: row.youtubeVideoId ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
  };
}

const VIDEO_LOADER_JS = `(function(){
  var s = document.currentScript;
  if (!s) return;
  var base = new URL(s.src).origin;
  var id = s.getAttribute('data-hired-video');
  if (!id) { console.error('[hired.video embed] missing data-hired-video'); return; }
  var mount = s.previousElementSibling;
  if (!mount || !mount.hasAttribute('data-hired-video-embed')) {
    mount = document.querySelector('[data-hired-video-embed]');
  }
  if (!mount) { mount = document.createElement('div'); s.parentNode.insertBefore(mount, s); }
  var iframe = document.createElement('iframe');
  iframe.src = base + '/embed/video/frame?v=' + encodeURIComponent(id);
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.aspectRatio = '9 / 16';
  iframe.style.maxHeight = '90vh';
  iframe.setAttribute('title', 'hired.video');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
  iframe.setAttribute('allowfullscreen', '');
  mount.innerHTML = '';
  mount.appendChild(iframe);
})();`;

embedAssetRoutes.get("/video/loader.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(VIDEO_LOADER_JS);
});

embedAssetRoutes.get("/video/frame", async (c) => {
  const id = c.req.query("v") || "";
  c.header("Content-Type", "text/html; charset=utf-8");
  // Public marketing content — embeddable anywhere.
  c.header("Content-Security-Policy", "frame-ancestors *");
  if (!id) return c.body(VIDEO_FRAME_ERROR("Missing video id"));
  let video: EmbeddableVideo | null = null;
  try {
    video = await resolveEmbeddableVideo(id);
  } catch {
    return c.body(VIDEO_FRAME_ERROR("This video is unavailable."));
  }
  if (!video) return c.body(VIDEO_FRAME_ERROR("This video is unavailable."));
  return c.body(VIDEO_FRAME_HTML(video));
});

function VIDEO_FRAME_ERROR(msg: string): string {
  return `<!doctype html><meta charset=utf-8><body style="margin:0;display:grid;place-items:center;height:100vh;font:14px system-ui;color:#9ca3af;background:#0f172a">${escapeAttr(msg)}</body>`;
}

/** Self-contained player document — flat CDN `<video>` or a YouTube
 *  iframe. No SPA bundle. */
function VIDEO_FRAME_HTML(video: EmbeddableVideo): string {
  const poster = video.thumbnailUrl ? ` poster="${escapeAttr(video.thumbnailUrl)}"` : "";
  const player = video.videoUrl
    ? `<video controls playsinline${poster} style="width:100%;height:100%;object-fit:contain;background:#000" src="${escapeAttr(video.videoUrl)}"></video>`
    : `<iframe style="width:100%;height:100%;border:0" src="https://www.youtube.com/embed/${escapeAttr(video.youtubeVideoId ?? "")}" title="${escapeAttr(video.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}</style></head>
<body>${player}</body></html>`;
}
