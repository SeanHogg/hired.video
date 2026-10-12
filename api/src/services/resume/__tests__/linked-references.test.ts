/**
 * #2258 — résumé references live-linked to saved reference contacts.
 *   - a pulled item keeps the contact id next to its display text;
 *   - the server sweep is ONE scoped UPDATE (owner + linked-contact filter),
 *     rewriting only the matching array items in order.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/linked-references.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/neon-http";
import { schema, type Db } from "../../../db/index.js";
import { buildLinkedReferenceUpdate } from "../linked-references.js";
import {
  referenceDisplayText,
  referenceFromContact,
} from "../../../../../shared/resume-references.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const MAYA = { id: "c-maya", name: "Maya Chen", title: "VP Engineering", company: "Northwind Health", relationship: "Former manager" };
const OMAR = { id: "c-omar", name: "Omar Haddad", title: "CTO", company: null, relationship: null };

describe("referenceDisplayText / referenceFromContact", () => {
  it("joins role, company and relationship the way the résumé shows them", () => {
    assert.equal(referenceDisplayText(MAYA), "VP Engineering, Northwind Health · Former manager");
    assert.equal(referenceDisplayText(OMAR), "CTO");
    assert.equal(referenceDisplayText({ id: "x", name: "X" }), "");
  });

  it("a pulled reference keeps the contact id next to its text", () => {
    assert.deepEqual(referenceFromContact(MAYA, "r1"), {
      id: "r1",
      contactId: "c-maya",
      name: "Maya Chen",
      reference: "VP Engineering, Northwind Health · Former manager",
    });
  });
});

describe("buildLinkedReferenceUpdate — one scoped UPDATE", () => {
  const db = drizzle.mock({ schema }) as unknown as Db;
  // Maya was "Director of Engineering" before this edit.
  const MAYA_BEFORE = { ...MAYA, title: "Director of Engineering" };
  const { sql, params } = buildLinkedReferenceUpdate(db, OWNER, MAYA, MAYA_BEFORE, new Date("2026-10-10T12:00:00Z")).toSQL();

  it("updates only the owner's résumés that link this contact", () => {
    assert.match(sql, /^update "resume_information" set "content" = jsonb_set\(/);
    assert.match(sql, /"resume_information"\."user_id" = \$\d+/);
    assert.match(sql, /jsonb_typeof\("resume_information"\."content"->'references'\) = 'array'/);
    assert.match(sql, /"resume_information"\."content"->'references' @> \$\d+::jsonb/);
    assert.ok(params.includes(OWNER));
    assert.ok(params.includes(JSON.stringify([{ contactId: "c-maya" }])));
  });

  it("rewrites only the linked items that still show the old text, in their order", () => {
    assert.match(sql, /WHEN t\.elem->>'contactId' = \$\d+ AND coalesce\(t\.elem->>'name', ''\) = \$\d+ AND coalesce\(t\.elem->>'reference', ''\) = \$\d+ THEN t\.elem \|\| \$\d+::jsonb/);
    assert.match(sql, /ELSE t\.elem END ORDER BY t\.ord/);
    assert.match(sql, /jsonb_array_elements\("resume_information"\."content"->'references'\) WITH ORDINALITY AS t\(elem, ord\)/);
    assert.ok(params.includes(JSON.stringify({ name: "Maya Chen", reference: "VP Engineering, Northwind Health · Former manager" })));
  });

  it("unlinks a linked item the owner hand-edited instead of overwriting it", () => {
    assert.match(sql, /WHEN t\.elem->>'contactId' = \$\d+ THEN t\.elem - 'contactId'/);
    assert.ok(params.includes("Director of Engineering, Northwind Health · Former manager"), "matches against the PREVIOUS display text");
  });
});
