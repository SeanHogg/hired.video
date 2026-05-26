# SCORM 2004 4th Edition Conformance Checklist

Companion to [run.sh](./run.sh) — gap #1461. Tracks which CMI elements
and RTE methods the hired.video SCORM runtime implements vs the ADL
spec. Update this file when a regression / extension lands; the ADL
suite is the authoritative pass/fail oracle but this checklist is the
implementer's-side mirror.

**Last reviewed:** 2026-05-26 (during the gap-sweep pass that closed
#1497 / #1498 / #1505 / etc.)

## Runtime API surface

Sources:
- Player runtime: [scorm-again](https://github.com/jcputney/scorm-again) v3.0.4, loaded by [ScormPlayer.tsx](../../components/courses/ScormPlayer.tsx)
- Commit endpoint: `POST /api/courses/scorm/:enrollmentId/commit` ([courses.ts](../../../api/src/routes/courses.ts))

### Initialize / Terminate / GetValue / SetValue / Commit
- [x] `Initialize` — implemented by scorm-again
- [x] `Terminate` — implemented by scorm-again
- [x] `GetValue` — implemented by scorm-again
- [x] `SetValue` — implemented by scorm-again
- [x] `Commit` — wired to our `commitScormState` helper, fires every 10s + on `passed` / `completed` flips
- [x] `GetLastError` / `GetErrorString` / `GetDiagnostic` — scorm-again standard

### CMI elements (write-through to `scorm_cmi_states.cmi_json`)
- [x] `cmi.completion_status` (`not attempted` / `incomplete` / `completed`)
- [x] `cmi.success_status` (`passed` / `failed` / `unknown`)
- [x] `cmi.score.raw`, `cmi.score.min`, `cmi.score.max`, `cmi.score.scaled`
- [x] `cmi.session_time`, `cmi.total_time`
- [x] `cmi.suspend_data` (round-trips across sessions)
- [x] `cmi.location` (resume position)
- [x] `cmi.exit` (suspend / normal / time-out / logout)
- [x] `cmi.learner_id` / `cmi.learner_name` (injected from JWT)
- [x] `cmi.interactions.n.id` / `result` / `weighting` / etc. (whole collection — opaque pass-through)
- [x] `cmi.objectives.n.id` / `success_status` / `score.scaled` (opaque pass-through)

### Sequencing & Navigation (SCORM 2004 only)
- [ ] `adl.nav.request` — partial; we honor `continue` / `previous` / `exit` / `exitAll` but the player chrome surfaces the buttons manually rather than letting the SCO drive
- [ ] `adl.nav.request_valid.continue` / `.previous` — **not implemented** (returns `unknown`)
- [ ] Rollup rules — **not implemented**; we evaluate completion at the lesson level, not the activity tree
- [ ] Pre/Post-condition rules — **not implemented**

> The sequencing model is the largest known gap. Most published
> courses don't ship sequencing rules; the ones that do (Articulate
> Storyline with branching, Captivate with prerequisites) will fall
> back to a flat lesson list. Tracked as a follow-up to #1461.

## Manifest parsing
- [x] `imsmanifest.xml` extraction + parse via [scorm-upload.ts](../../lib/courses/scorm-upload.ts)
- [x] Resource href resolution (relative paths resolve against the manifest base)
- [x] Multi-organization manifests — we pick the first `<organization>`; alternate org switching not supported
- [ ] Metadata sub-document (LOM) parsing — **not implemented** (course metadata comes from the lesson row, not the manifest)
- [ ] Package interchange format (.pif) — **not implemented**; we accept plain .zip

## Asset hosting
- [x] Same-origin proxy via [`GET /api/courses/scorm-asset/:userId/:pkgId/*`](../../../api/src/routes/courses.ts) — #1460
- [x] Whitelisted route regex + path-traversal rejection (pinned by tests in [courses-scorm-asset-route-regex.test.ts](../../../api/src/routes/__tests__/courses-scorm-asset-route-regex.test.ts))

## Running the suite

```bash
chmod +x ./run.sh
./run.sh                 # full run (clone + build + execute)
./run.sh --clone-only    # one-time bootstrap
```

Reports land in `./out/conformance-report-<timestamp>.html`. Compare
against this checklist; for every test the suite flags as failing,
either:

1. Update the implementation + re-run, OR
2. Move the affected checkbox to `[ ]` with a one-line note explaining
   why we chose not to support it (most likely candidates: pre-2004-3
   legacy CMI shapes, full sequencing rollup).

## Known limitations

- We do not run the suite in CI today — it requires a full browser
  driver + a running API + Java/Maven. Run it manually before any
  ScormPlayer / commit-endpoint change ships.
- The suite's "Test SCO #14" (sequencing rollup) is expected to fail
  pending the sequencing implementation noted above.
