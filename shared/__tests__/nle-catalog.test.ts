import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NLE_TITLE_TEMPLATES,
  findTitleTemplate,
} from "../nle-titles-catalog.js";
import {
  NLE_M5_CAPABILITIES,
  getNleCapability,
  listShippedCapabilities,
} from "../nle-capabilities.js";
import { SCENE_TYPES } from "../scene-types.js";

/**
 * #1965 — NLE data/catalog integrity: unique ids, required fields,
 * enum membership, no dangling refs.
 */

const HEX_OR_RGBA = /^(#[0-9A-Fa-f]{6}|rgba?\([\d.,\s]+\))$/;

describe("NLE titles catalog", () => {
  it("has unique ids", () => {
    const ids = NLE_TITLE_TEMPLATES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate title template id");
  });

  it("has unique cssClass per template (no shared style collisions)", () => {
    const classes = NLE_TITLE_TEMPLATES.map((t) => t.cssClass);
    assert.equal(new Set(classes).size, classes.length, "duplicate cssClass");
  });

  it("every template has complete, well-formed required fields", () => {
    const categories = new Set(["lower_third", "intro", "outro", "callout", "subtitle"]);
    for (const t of NLE_TITLE_TEMPLATES) {
      assert.ok(t.id.trim().length > 0, "empty id");
      assert.ok(t.label.trim().length > 0, `${t.id} empty label`);
      assert.ok(categories.has(t.category), `${t.id} bad category ${t.category}`);
      assert.ok(Number.isInteger(t.durationMs) && t.durationMs > 0, `${t.id} bad durationMs`);
      assert.ok(t.cssClass.trim().length > 0, `${t.id} empty cssClass`);
      for (const k of ["bg", "fg", "accent"] as const) {
        assert.match(t.defaultPalette[k], HEX_OR_RGBA, `${t.id} palette.${k} not a colour`);
      }
    }
  });

  it("findTitleTemplate resolves known ids and returns undefined otherwise", () => {
    const first = NLE_TITLE_TEMPLATES[0];
    assert.equal(findTitleTemplate(first.id)?.id, first.id);
    assert.equal(findTitleTemplate("does_not_exist"), undefined);
    assert.equal(findTitleTemplate(""), undefined);
  });
});

describe("NLE M5 capabilities", () => {
  it("has unique ids", () => {
    const ids = NLE_M5_CAPABILITIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate capability id");
  });

  it("every capability has valid enum-bound status/tier and a gapId", () => {
    const statuses = new Set(["shipped", "in_progress", "planned"]);
    const tiers = new Set(["free", "pro", "preview"]);
    for (const c of NLE_M5_CAPABILITIES) {
      assert.ok(c.id.trim().length > 0, "empty id");
      assert.ok(c.label.trim().length > 0, `${c.id} empty label`);
      assert.ok(c.description.trim().length > 0, `${c.id} empty description`);
      assert.ok(statuses.has(c.status), `${c.id} bad status ${c.status}`);
      assert.ok(tiers.has(c.tier), `${c.id} bad tier ${c.tier}`);
      assert.ok(Number.isInteger(c.gapId) && c.gapId > 0, `${c.id} bad gapId`);
    }
  });

  it("getNleCapability resolves known ids and returns undefined otherwise", () => {
    assert.equal(getNleCapability("motion_graphics")?.id, "motion_graphics");
    assert.equal(getNleCapability("nope"), undefined);
  });

  it("listShippedCapabilities returns only shipped entries", () => {
    const shipped = listShippedCapabilities();
    assert.ok(shipped.every((c) => c.status === "shipped"));
    assert.equal(
      shipped.length,
      NLE_M5_CAPABILITIES.filter((c) => c.status === "shipped").length,
    );
  });
});

describe("scene-types enum", () => {
  it("has unique, kebab/lower scene types", () => {
    assert.equal(new Set(SCENE_TYPES).size, SCENE_TYPES.length, "duplicate scene type");
    for (const t of SCENE_TYPES) {
      assert.match(t, /^[a-z][a-z-]*$/, `bad scene type token: ${t}`);
    }
  });

  it("includes the four resume-default scene shapes the storyboard generator emits", () => {
    for (const t of ["intro", "achievement", "skills", "closing"]) {
      assert.ok((SCENE_TYPES as readonly string[]).includes(t), `missing scene type ${t}`);
    }
  });
});
