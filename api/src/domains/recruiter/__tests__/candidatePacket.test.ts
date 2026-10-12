import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { candidateInitials, anonymizeIdentity } from "../candidatePacket.js";

describe("candidateInitials (#243)", () => {
  it("takes first+last initial for a multi-word name", () => {
    assert.equal(candidateInitials("Ada Lovelace"), "AL");
    assert.equal(candidateInitials("  grace  brewster  hopper "), "GH");
  });
  it("uses a single initial for a one-word name", () => {
    assert.equal(candidateInitials("cher"), "C");
  });
  it("falls back to '?' when there are no letters/digits", () => {
    assert.equal(candidateInitials(""), "?");
    assert.equal(candidateInitials("   "), "?");
    assert.equal(candidateInitials("— —"), "?");
  });
  it("handles names with digits", () => {
    assert.equal(candidateInitials("3M Worker"), "3W");
  });
});

describe("anonymizeIdentity (#243)", () => {
  const real = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    avatarUrl: "https://cdn/ada.png",
  };

  it("passes identity through untouched when anonymize is off", () => {
    assert.deepEqual(anonymizeIdentity(real, false), real);
  });

  it("replaces name with initials and strips email + photo when on", () => {
    assert.deepEqual(anonymizeIdentity(real, true), {
      name: "AL",
      email: null,
      avatarUrl: null,
    });
  });

  it("never leaks a partial identity (no email/photo bleed)", () => {
    const out = anonymizeIdentity(real, true);
    assert.equal(out.email, null);
    assert.equal(out.avatarUrl, null);
    assert.notEqual(out.name, real.name);
  });
});
