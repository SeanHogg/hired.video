// apply-button.ts — "Apply with hired.video" embeddable button.
//
// Distribution strategy:
//   Employers and job boards add one <script> tag to their page.
//   The script renders a branded "Apply with hired.video" button.
//   Clicking it opens a modal that captures the candidate's email, creates a
//   marketing lead, and redirects them to a pre-filled signup / job application.
//
// Routes:
//   GET  /api/apply-button/snippet          — returns the JS embed snippet (text/javascript)
//   GET  /api/apply-button/:jobId/meta       — returns job title/company for button label
//   POST /api/apply-button/track             — records a button click (lead capture)

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getApplyButtonJobMeta, trackApplyButtonClick } from "../services/marketing/apply-button.js";
import { validateJson } from "./helpers/validate.js";

export const applyButtonRoutes = new Hono<AppEnv>();

// ─── Lead capture schema ───────────────────────────────────────────────────────

const TrackClickSchema = z.object({
  email: z.string().email().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().max(200).optional(),
  companyName: z.string().max(200).optional(),
  source: z.string().max(100).default("apply-button"),
  referrerUrl: z.string().max(2000).optional(),
});

// ─── POST /api/apply-button/track ─────────────────────────────────────────────
// Records a button click and optionally captures the candidate's email as a
// marketing lead. No auth required — anonymous visitors use this.

applyButtonRoutes.post("/track", validateJson(TrackClickSchema, () => error("VALIDATION_ERROR", "Invalid request")), async (c) => {
  return c.json(success(await trackApplyButtonClick(c.req.valid("json"))), 200);
});

// ─── GET /api/apply-button/:jobId/meta ────────────────────────────────────────
// Returns minimal job metadata so the embed button can display the job title.

applyButtonRoutes.get("/:jobId/meta", async (c) => {
  return c.json(success(await getApplyButtonJobMeta(c.req.param("jobId"))), 200);
});

// ─── GET /api/apply-button/snippet ────────────────────────────────────────────
// Returns the JavaScript embed snippet that employers paste into their page.
// The snippet renders a "Apply with hired.video" button and handles the click flow.

applyButtonRoutes.get("/snippet", (c) => {
  const origin = new URL(c.req.url).origin;

  const js = `
(function () {
  'use strict';
  var ORIGIN = '${origin}';
  function createButton(el) {
    var jobId = el.getAttribute('data-job-id') || '';
    var label = el.getAttribute('data-label') || 'Apply with hired.video';
    var btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'background:#7c3aed;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-family:system-ui,-apple-system,sans-serif;';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg> ' + label;
    btn.addEventListener('click', function () {
      var email = '';
      var emailInput = el.closest('form') ? el.closest('form').querySelector('input[type=email]') : null;
      if (emailInput) email = emailInput.value || '';
      fetch(ORIGIN + '/api/apply-button/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, jobId: jobId, source: 'apply-button', referrerUrl: window.location.href })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.data && d.data.signupUrl) window.location.href = ORIGIN + d.data.signupUrl;
        else window.location.href = ORIGIN + '/signup?source=apply-button&jobId=' + encodeURIComponent(jobId);
      }).catch(function () {
        window.location.href = ORIGIN + '/signup?source=apply-button&jobId=' + encodeURIComponent(jobId);
      });
    });
    el.parentNode.replaceChild(btn, el);
  }
  function init() {
    document.querySelectorAll('[data-hired-apply]').forEach(createButton);
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
`.trim();

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
