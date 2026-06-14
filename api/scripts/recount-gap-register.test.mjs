/**
 * Tests for the gap-register recount helper (gap #791). Covers the parser's
 * happy path, boundary cases (the many non-gap `| N |` tables elsewhere in
 * the README, the `⚠️` two-codepoint status), duplicate-id detection
 * (gap #2009), and the totals-block upsert/round-trip.
 *
 * Fixtures mirror the REAL README shape: a register section bounded by
 * `## Consolidated Gap Register` and a trailing `## ` heading, mixed status
 * vocabulary, an interleaved non-register table, and a genuine duplicate id.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseRow,
  tally,
  totalsLine,
  sectionLines,
  blockText,
  withBlock,
  currentBlock,
} from "./recount-gap-register.mjs";

// A realistic README slice: real heading, the auto-block absent, a header row,
// a separator, five gap rows (one duplicate id #42, every status used), an
// interleaved NON-gap table that must NOT be counted, then the next section.
const README_FIXTURE = `# Project

## Some Earlier Section

| 7 | not a gap | this row predates the register and must be ignored |

## Consolidated Gap Register

Intro prose.

| # | Status | Phase | Priority | Type | Gap | Notes |
|---|--------|-------|----------|------|-----|-------|
| 10 | 🔲 Open | Now | P1 | \`feature\` | **A** | open one |
| 11 | ⚠️ Partial | Soon | P2 | \`arch\` | **B** | partial one |
| 12 | ✅ Done | Mid | P3 | \`bug\` | **C** | done one |
| 13 | ⛔ Removed | Later | P4 | \`legacy\` | **D** | removed one |
| 14 | 🟪 Wontfix | Later | P4 | \`quality\` | **E** | wontfix one |
| 42 | 🔲 Open | Now | P1 | \`perf\` | **Dup first** | dup |

A non-register lookalike table inside the section (different cell-2 shape):

| 99 | plain label | no status emoji so it is not a gap row |

| 42 | ✅ Done | Mid | P2 | \`feature\` | **Dup second** | the concurrent-edit duplicate |

## Done — Shipped Capability Summary

| 500 | ✅ Done | this is OUTSIDE the register and must be ignored |
`;

test("parseRow classifies each status and ignores non-gap rows", () => {
  assert.deepEqual(parseRow("| 10 | 🔲 Open | x |"), { id: 10, status: "Open" });
  assert.deepEqual(parseRow("| 11 | ⚠️ Partial | x |"), { id: 11, status: "Partial" });
  assert.deepEqual(parseRow("| 12 | ✅ Done | x |"), { id: 12, status: "Done" });
  assert.deepEqual(parseRow("| 13 | ⛔ Removed | x |"), { id: 13, status: "Removed" });
  assert.deepEqual(parseRow("| 14 | 🟪 Wontfix | x |"), { id: 14, status: "Wontfix" });
  // boundary: header, separator, and emoji-less label rows are not gaps
  assert.equal(parseRow("| # | Status | Gap |"), null);
  assert.equal(parseRow("|---|--------|-----|"), null);
  assert.equal(parseRow("| 99 | plain label | nope |"), null);
  assert.equal(parseRow("not a table line"), null);
});

test("sectionLines scopes strictly to the register section", () => {
  const { lines } = sectionLines(README_FIXTURE.split("\n"));
  const joined = lines.join("\n");
  // inside the section
  assert.ok(joined.includes("**A**"));
  assert.ok(joined.includes("Dup second"));
  // the earlier section's row and the trailing Done-summary row are excluded
  assert.ok(!joined.includes("predates the register"));
  assert.ok(!joined.includes("OUTSIDE the register"));
});

test("tally counts the scoped rows and flags duplicate ids", () => {
  const { lines } = sectionLines(README_FIXTURE.split("\n"));
  const t = tally(lines);
  // 5 distinct-status rows + 2 rows for #42 = 7 gap rows; the `| 99 |` and
  // `| 7 |` / `| 500 |` lookalikes are excluded.
  assert.equal(t.rows, 7);
  assert.equal(t.counts.Open, 2); // #10 + #42(first)
  assert.equal(t.counts.Partial, 1);
  assert.equal(t.counts.Done, 2); // #12 + #42(second)
  assert.equal(t.counts.Removed, 1);
  assert.equal(t.counts.Wontfix, 1);
  assert.equal(t.active, 3); // Open(2) + Partial(1)
  assert.deepEqual(t.duplicates, [{ id: 42, count: 2 }]);
});

test("totalsLine renders the canonical string", () => {
  const { lines } = sectionLines(README_FIXTURE.split("\n"));
  assert.equal(
    totalsLine(tally(lines)),
    "3 active — 2 Open · 1 Partial · 2 Done · 1 Removed · 1 Wontfix · 7 rows · 1 duplicate id(s)",
  );
});

test("withBlock inserts then idempotently updates the totals block", () => {
  const t = tally(sectionLines(README_FIXTURE.split("\n")).lines);

  // first write: block is inserted under the heading
  const once = withBlock(README_FIXTURE, t);
  assert.ok(once.includes("<!-- gap-register-totals:START -->"));
  assert.equal(currentBlock(once)?.trim(), blockText(t).trim());
  // inserted immediately after the heading, before the intro prose
  const headingPos = once.indexOf("## Consolidated Gap Register");
  const blockPos = once.indexOf("<!-- gap-register-totals:START -->");
  const introPos = once.indexOf("Intro prose.");
  assert.ok(headingPos < blockPos && blockPos < introPos);

  // second write on already-blocked content: no duplicate block, same result
  const twice = withBlock(once, t);
  assert.equal(twice, once);
  assert.equal((twice.match(/gap-register-totals:START/g) || []).length, 1);
});

test("withBlock refreshes a stale block in place", () => {
  const t = tally(sectionLines(README_FIXTURE.split("\n")).lines);
  const fresh = withBlock(README_FIXTURE, t);
  const stale = fresh.replace("3 active", "999 active");
  assert.ok(currentBlock(stale).includes("999 active"));
  const refreshed = withBlock(stale, t);
  assert.ok(!refreshed.includes("999 active"));
  assert.equal(currentBlock(refreshed).trim(), blockText(t).trim());
});
