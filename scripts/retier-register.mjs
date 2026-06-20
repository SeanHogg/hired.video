/**
 * ONE-OFF: re-group the Consolidated Gap Register by isolation track (TK1-TK11)
 * instead of revenue tier (T1-T4). Revenue tier is preserved as a new `Rev`
 * column. Also splits the malformed #1175/#1176 concatenated row and routes the
 * stray #1176 (✅ Done) into DONE.md.
 *
 * Modes: default = dry-run report + write README.regrouped.tmp ; --write = overwrite README.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const WRITE = process.argv.includes("--write");

const raw = readFileSync(README, "utf8");
const lines = raw.split("\n");

const startIdx = lines.findIndex((l) => l.startsWith("## Consolidated Gap Register"));
const firstTierIdx = lines.findIndex((l, i) => i > startIdx && /^### Tier 1\b/.test(l));
const resolvedIdx = lines.findIndex((l, i) => i > startIdx && /^### Resolved\b/.test(l));
if (startIdx < 0 || firstTierIdx < 0 || resolvedIdx < 0) throw new Error("register markers not found");

const preamble = lines.slice(startIdx, firstTierIdx); // heading..just before Tier 1
const body = lines.slice(firstTierIdx, resolvedIdx); // tier headings + tables
const tail = lines.slice(resolvedIdx); // ### Resolved -> DONE.md note .. EOF

// ---- split malformed concatenated rows: `... |` + `| NNNN | <status> |` glued as `||` ----
const STATUS_RE = "✅|🔲|⚠|⛔|🟪";
function explode(line) {
  return line.replace(new RegExp(`\\|\\|(?=\\s*\\d+\\s*\\|\\s*(?:${STATUS_RE}))`, "g"), "|\n|").split("\n");
}

// ---- parse rows, tracking current revenue tier ----
const TIER_OF = { "### Tier 1": "T1", "### Tier 2": "T2", "### Tier 3": "T3", "### Tier 4": "T4" };
let curTier = null;
const rows = []; // { id, status, type, tier, line }
const doneRows = []; // ✅ Done rows pulled out of the register entirely
for (const rawLine of body) {
  const th = Object.keys(TIER_OF).find((h) => rawLine.startsWith(h));
  if (th) { curTier = TIER_OF[th]; continue; }
  for (const line of explode(rawLine)) {
    const m = line.match(/^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/u);
    if (!m) continue;
    const id = Number(m[1]);
    const status = m[2].trim();
    const type = m[5].trim().replace(/`/g, "");
    const row = { id, status, type, tier: curTier, line };
    if (status.startsWith("✅")) doneRows.push(row);
    else rows.push(row);
  }
}

// ---- classifier ----
const ANCHORS = {
  TK1: [1770,1780,1783,1784,1972,1977,211,213,214,234,245,236],
  TK2: [511,526,535,774,2100,1344,1362,1506,229,259,262,852],
  TK3: [1850,1851,1856,2211,1764,1765,1777,1778,1786,1787,1792,1794],
  TK4: [2201,1947,1950,1951,1872,2204,2205,988,1776,1779,1781,1785],
  TK5: [1864,1769,1773,1795,2112,135,1322,1564,1159,2060,2043,2046],
  TK6: [823,1761,1791,1803,1146,1482,2121,2009,2031,2070,1957,2127],
  TK7: [1946,1948,1200,1202,1162,2113,756,954,2052,1495,139,182],
  TK8: [1793,1797,1799,1324,1157,1158,1189,1206,1219,1484,2032,2044],
  TK9: [1869,179,634,2036,1970,795,782,250,497,1183,2132,1654],
  TK10:[1949,1775,1479,981,917,1214,268,2047,2049,1975,1976,244],
  TK11:[897,339,1326],
};
// hard overrides for genuinely cross-cutting rows the keyword pass can't place
const OVERRIDE = {
  1303: "TK9", 947: "TK4", 1140: "TK8", 1212: "TK3", 1255: "TK8", 263: "TK9",
};
const anchorOf = new Map();
for (const [tk, ids] of Object.entries(ANCHORS)) for (const id of ids) anchorOf.set(id, tk);
for (const [id, tk] of Object.entries(OVERRIDE)) anchorOf.set(Number(id), tk);

// keyword weight tables. earlier-listed = stronger signal; path hints weigh heavy.
const KW = {
  TK2: [["payout",3],["helcim",3],["stripe",3],["invoice",3],["refund",3],["1099",3],["tax form",3],["token pack",3],["seat",2],["subscription",3],["boost",2],["billing",3],["payment",3],["escrow",2],["paywall",3],["pricing",2],["helcim",3],["payouts",3],["tremendous",2],["cashout",2],["affiliate payout",3]],
  TK3: [["recruiter",3],["sourcing",3],["screening",3],["placement",3],["applicant",3],["auto-apply",3],["job seeker",1],["jobs.tsx",4],["jobcreate",4],["interview",2],["candidate",2],["job board",3],["job posting",3],["bd pipeline",3],["job_sourcing",4],["job_items",3],["scorecard",3],["hiring manager",3],["pipeline stage",2]],
  TK4: [["resume",3],["studio",3],["canvas",2],["nle",3],["timeline",3],["ffmpeg",3],["storyboard",3],["scene",2],["caption",3],["voiceover",3],["comic",3],["video render",3],["webcodecs",3],["frame-renderer",4],["documentstate",2],["canvasstate",3],["proxyurl",3],["studiolayout",4],["eye-contact",3],["marquee",3],["lasso",3],["magic wand",3],["photoshop",3],["image-gen",2],["image gen",2],["teleprompter",3],["web speech",3],["webcam",2],["timeupdate",3],["cta hot-zone",3],["hot-zone",2],["webgpu",2],["mp4",2],["render queue",2],["thumbnail",1],["aspect ratio",2]],
  TK5: [["llm",3],["gateway",2],["token-ledger",3],["metering",3],["matching",3],["match route",3],["scoring",3],["ats score",3],["career 360",3],["career360",4],["sentiment",3],["moderation",3],["ai-context",3],["aichatpanel",4],["embedding",2],["model id",2],["use_case_profile",3],["ai chro",2],["ai_unavailable",3]],
  TK6: [["scorm",3],["xapi",3],["learning path",3],["course",3],["certificate",3],["cert ",2],["points",3],["badge",3],["streak",3],["fraud",2],["cohort",3],["gamification",3],["pathway",3],["learning",2],["lesson",3],["lrs",3]],
  TK7: [["creator",3],["voice-clone",3],["voice clone",3],["voice marketplace",3],["article",3],["gig",3],["coaching",3],["partner program",3],["creator profile",3],["creator_profiles",4],["promo_projects",2],["byok voice",3],["voice cloning",3],["writer-opt-in",3],["writer opt-in",3]],
  TK8: [["people",2],["profile section",3],["social feed",3],["feed_post",4],["feed post",3],["feed link",3],["connection",3],["chro",3],["roster",3],["org-chart",3],["org chart",3],["1:1",3],["geo",2],["content_location",4],["people.tsx",4],["people/",3],["warm-intro",3],["booking",2],["taxonomy",3],["tags",2],["company type",3],["statuses",2],["scorecard",1]],
  TK9: [["superadmin",3],["rbac",3],["role-feature-access",4],["impersonation",3],["permission debugger",3],["usage tracking",3],["access manifest",3],["admin tab",3],["/admin/",3],["resolveroleaccess",4],["dashboard-feed",2],["feed_features",2]],
  TK10:[["email sync",3],["gmail",3],["outlook",3],["push notification",3],["notification",2],["inbox",3],["e-sign",3],["esign",3],["docusign",3],["xero",3],["qbo",3],["enrichment",3],["messaging",2],["connector",2],["sendpulse",3],["sms",2],["notification_preferences",3],["mailbox",3],["mail ",2],["websocket",3],["real-time chat",3],["chat",2],["presence",2],["typing indicator",3],["pixel",3],["capi",3],["paid_media",3],["paid media",3],["insights backfill",3],["mailchimp",3],["slack",3],["zapier",3],["neardrop",3],["recurring events",3],["link-preview",3],["link preview",3],["opt-in",2],["double-opt-in",3],["gdpr",3],["casl",3],["gpc",3],["ccpa",3],["consent",2],["tiktok",3],["calendar",2],["ics ",2]],
  TK11:[["appshell",4],["useseo",4],["breadcrumb",3],["i18n",3],["locale",2],["mobile nav",3],["page chrome",3],["page-chrome",3],["seo entry",3]],
  TK1: [["migration",2],["ci ",2],["deploy",2],["read-through cache",3],["caching",2],["n+1",3],["worker-cpu",3],["worker cpu",3],["eslint",3],["lint",2],["test infra",3],["dead-code",2],["dead code",2],["refactor",2],["middleware",3],["recount",3],["_sql_migrations",3],["tsc",2],["typecheck",2],["route file",2],["getdb",2],["repository pattern",2]],
};
// path-based hard hints (filename/path tokens in the row → strong track signal)
const PATHHINT = [
  [/api\/src\/services\/billing|routes\/payment|tremendous|billing\.ts/i, "TK2"],
  [/services\/job\/|recruiter-marketplace|services\/screening|services\/interview|routes\/jobs|schema\/jobs|frontend\/pages\/jobs|components\/jobs/i, "TK3"],
  [/services\/resume|services\/studio|routes\/resumes|routes\/studio|schema\/resumes|schema\/studio|pages\/studio|components\/studio|shared\/resume/i, "TK4"],
  [/services\/adapters|services\/match|services\/career360|aichatpanel|ai-context/i, "TK5"],
  [/domains\/gamification|services\/learning|services\/courses|routes\/learning|routes\/courses|pages\/courses/i, "TK6"],
  [/services\/creators|services\/voice|services\/articles|services\/gig|components\/creator/i, "TK7"],
  [/routes\/people|services\/people|services\/social|services\/feed|services\/location|pages\/people|components\/feed/i, "TK8"],
  [/routes\/superadmin|routes\/admin|services\/admin|services\/access|pages\/admin/i, "TK9"],
  [/services\/email|services\/messaging|services\/notifications|routes\/push|services\/enrichment|workforce\/connectors/i, "TK10"],
  [/components\/ui\/|components\/layout\/|lib\/seo|public\/locales|shared\/i18n/i, "TK11"],
  [/api\/drizzle|\.github\/|src\/middleware|src\/utils|db\/index\.ts|api\/scripts/i, "TK1"],
];

function classify(row) {
  if (anchorOf.has(row.id)) return { tk: anchorOf.get(row.id), how: "anchor", score: 99 };
  const text = row.line.toLowerCase();
  // explicit TKn tag in the row text
  const tag = row.line.match(/\bTK(1[01]|[1-9])\b/);
  if (tag) return { tk: "TK" + tag[1], how: "tag", score: 90 };
  const scores = {};
  for (const [re, tk] of PATHHINT) if (re.test(row.line)) scores[tk] = (scores[tk] || 0) + 5;
  for (const [tk, kws] of Object.entries(KW))
    for (const [w, wt] of kws) if (text.includes(w)) scores[tk] = (scores[tk] || 0) + wt;
  // type nudges
  if (row.type === "billing") scores.TK2 = (scores.TK2 || 0) + 2;
  if (row.type === "perf" || row.type === "arch" || row.type === "quality") scores.TK1 = (scores.TK1 || 0) + 1;
  // revenue-tier nudge (weak): T1 leans billing, T4 leans platform
  if (row.tier === "T1") scores.TK2 = (scores.TK2 || 0) + 0.5;
  if (row.tier === "T4") scores.TK1 = (scores.TK1 || 0) + 0.5;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { tk: "TK1", how: "fallback", score: 0 };
  return { tk: ranked[0][0], how: "kw", score: ranked[0][1], runnerUp: ranked[1] };
}

const TRACK_META = {
  TK1: "platform-infra — Platform, Migrations, Perf & Arch (COORDINATOR)",
  TK2: "billing — Billing, Payments & Payouts",
  TK3: "jobs-recruit — Jobs, Recruiting & Sourcing",
  TK4: "resume-studio — Resume, Studio & Video",
  TK5: "ai-llm — AI, LLM Gateway & Matching",
  TK6: "learning-gamification — Learning, Courses & Gamification",
  TK7: "creator — Creator Economy",
  TK8: "people-social — People, Profile, Social & CHRO",
  TK9: "admin-rbac — Admin, RBAC & SuperAdmin",
  TK10: "integrations-comms — Integrations, Email & Notifications",
  TK11: "frontend-ux-i18n — Frontend Chrome, SEO & i18n",
};
const OWNED = {
  TK1: "`api/drizzle/**`, `.github/**`, `api/src/middleware/**`, `api/src/utils/**`, `api/scripts/**`, root build/lint configs",
  TK2: "`api/src/services/billing/**`, `api/src/routes/payment.ts`, `api/src/routes/billing*`, `api/src/services/tremendous/**`",
  TK3: "`api/src/services/{job,recruiter-marketplace,screening,interview}/**`, `api/src/routes/jobs.ts`, `frontend/pages/Jobs.tsx`, `frontend/components/jobs/**`",
  TK4: "`api/src/services/{resume,studio}/**`, `api/src/routes/{resumes,studio*}`, `frontend/pages/studio/**`, `frontend/components/studio/**`, `shared/resume.ts`",
  TK5: "`api/src/services/{adapters,match*,career360}/**`, `frontend/components/AIChatPanel.tsx`, `frontend/lib/ai-context*`",
  TK6: "`api/src/domains/gamification/**`, `api/src/services/{learning,courses}/**`, `api/src/routes/{learning*,courses*}`, `frontend/pages/courses/**`",
  TK7: "`api/src/services/{creators,voice*,articles,gig*}/**`, `frontend/components/creator/**`",
  TK8: "`api/src/routes/people*`, `api/src/services/{people,social*,feed,location}/**`, `frontend/pages/People*`, `frontend/components/feed/**`",
  TK9: "`api/src/routes/{superadmin*,admin*}`, `api/src/services/{admin,access}/**`, `frontend/pages/admin/**`",
  TK10: "`api/src/services/{email*,messaging,notifications,enrichment}/**`, `api/src/routes/push*`, `api/src/services/workforce/connectors/**`",
  TK11: "`frontend/components/{ui,layout}/**`, `frontend/lib/seo.ts`, `frontend/public/locales/**`, `shared/i18n.ts`",
};
const ORDER = ["TK1","TK2","TK3","TK4","TK5","TK6","TK7","TK8","TK9","TK10","TK11"];
const PRIO = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
const PHASE = { Now: 0, Soon: 1, Mid: 2, Later: 3 };

// classify all
const byTrack = Object.fromEntries(ORDER.map((t) => [t, []]));
const lowConf = [];
const crosstab = {};
for (const row of rows) {
  const c = classify(row);
  row.tk = c.tk;
  byTrack[c.tk].push(row);
  crosstab[row.tier] = crosstab[row.tier] || {};
  crosstab[row.tier][c.tk] = (crosstab[row.tier][c.tk] || 0) + 1;
  if (c.how === "kw" && c.score < 3) lowConf.push({ id: row.id, tk: c.tk, score: c.score });
  if (c.how === "fallback") lowConf.push({ id: row.id, tk: c.tk, score: 0, fallback: true });
}

// add Rev column + sort within track by Priority -> Phase -> id
function addRev(line, rev) {
  return line.replace(/^(\|\s*\d+\s*\|)(.*)$/u, `$1 ${rev} |$2`);
}
function priorityOf(line) {
  const m = line.match(/^\|[^|]*\|[^|]*\|[^|]*\|\s*(P\d)\s*\|/u);
  return m ? (PRIO[m[1]] ?? 5) : 5;
}
function phaseOf(line) {
  const m = line.match(/^\|[^|]*\|[^|]*\|\s*(Now|Soon|Mid|Later)\s*\|/u);
  return m ? (PHASE[m[1]] ?? 4) : 4;
}

const newHeader = "| # | Rev | Status | Phase | Priority | Type | Gap | Notes |";
const newSep = "|---|-----|--------|-------|----------|------|-----|-------|";

const out = [];
for (const tk of ORDER) {
  const list = byTrack[tk];
  list.sort((a, b) => priorityOf(a.line) - priorityOf(b.line) || phaseOf(a.line) - phaseOf(b.line) || a.id - b.id);
  out.push("");
  out.push(`### ${tk} — ${TRACK_META[tk]} — ${list.length} active`);
  out.push("");
  out.push(`**Owned paths:** ${OWNED[tk]}`);
  out.push("");
  out.push(newHeader);
  out.push(newSep);
  for (const r of list) out.push(addRev(r.line, r.tier));
}
out.push("");

const newBody = out.join("\n");
const newReadme = [...lines.slice(0, firstTierIdx), ...newBody.split("\n"), ...tail].join("\n");

// ---- report ----
console.log("== Active rows re-grouped:", rows.length, " Done pulled out:", doneRows.length);
console.log("== Per-track active counts (new placement):");
let sum = 0;
for (const tk of ORDER) { const n = byTrack[tk].length; sum += n; console.log(`   ${tk.padEnd(5)} ${String(n).padStart(4)}   ${TRACK_META[tk].split(" — ")[0]}`); }
console.log("   TOTAL", sum);
console.log("== Rev tier x Track crosstab:");
for (const tier of ["T1","T2","T3","T4"]) {
  const r = crosstab[tier] || {};
  console.log("  ", tier, ORDER.map((t) => `${t}:${r[t]||0}`).filter((s) => !s.endsWith(":0")).join(" "));
}
console.log("== Low-confidence classifications:", lowConf.length);
for (const x of lowConf.slice(0, 60)) console.log("   #" + x.id, "->", x.tk, x.fallback ? "(FALLBACK)" : "score=" + x.score);
console.log("== Done rows pulled to DONE.md:", doneRows.map((r) => "#" + r.id).join(", "));

if (WRITE) {
  writeFileSync(README, newReadme);
  console.log("\n✓ README.md rewritten");
  // emit the Done rows for DONE.md merge
  writeFileSync(join(ROOT, "_doneRows.tmp"), JSON.stringify(doneRows, null, 2));
} else {
  writeFileSync(join(ROOT, "README.regrouped.tmp"), newReadme);
  console.log("\n(dry-run) wrote README.regrouped.tmp");
}
