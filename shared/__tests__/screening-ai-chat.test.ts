// AI screening chat item type (#1853). Pins that the new conversational-AI
// screen is a first-class screening item: present in the type set + catalog,
// validated (requires screener instructions), and not always-required.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SCREENING_ITEM_TYPES,
  SCREENING_ITEM_CATALOG,
  getScreeningCatalogEntry,
  validateScreeningItem,
} from "../screening.js";

describe("ai_screening_chat screening item (#1853)", () => {
  it("is a recognized item type with a catalog entry", () => {
    assert.ok((SCREENING_ITEM_TYPES as readonly string[]).includes("ai_screening_chat"));
    const entry = getScreeningCatalogEntry("ai_screening_chat");
    assert.equal(entry.itemType, "ai_screening_chat");
    assert.equal(entry.alwaysRequired, false);
    assert.equal(entry.needsRef, false);
    assert.equal(entry.needsConfig, true);
    assert.ok(SCREENING_ITEM_CATALOG.some((e) => e.itemType === "ai_screening_chat"));
  });

  it("requires screening instructions so the AI knows what to assess", () => {
    assert.throws(
      () => validateScreeningItem({ itemType: "ai_screening_chat", config: {} }),
      /instructions/i,
    );
    assert.throws(
      () => validateScreeningItem({ itemType: "ai_screening_chat", config: { instructions: "   " } }),
      /instructions/i,
    );
  });

  it("accepts a config with non-empty instructions", () => {
    const config = validateScreeningItem({
      itemType: "ai_screening_chat",
      config: { instructions: "Assess React + system-design depth; 5 questions." },
    });
    assert.equal(config.instructions, "Assess React + system-design depth; 5 questions.");
  });
});
