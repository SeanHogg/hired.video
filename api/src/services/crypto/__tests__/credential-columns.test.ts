import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openCredential, sealCredential, credentialEncryptionConfigured } from "../credential-columns.js";
import { SecretsError } from "../secrets.js";

const KEY = "test-credentials-master-key";

describe("credential-columns", () => {
  it("encrypts into enc and leaves the plaintext column null when a key is set", async () => {
    const sealed = await sealCredential("ya29.token", KEY);
    assert.equal(sealed.plain, null);
    assert.ok(sealed.enc?.startsWith("v1.aes-gcm.hkdf:"));
    assert.notEqual(sealed.enc, "ya29.token");
    assert.equal(await openCredential(sealed.enc, null, KEY), "ya29.token");
  });

  it("keeps writing plaintext when no key is configured (legacy behaviour)", async () => {
    assert.equal(credentialEncryptionConfigured(""), false);
    assert.deepEqual(await sealCredential("abc", ""), { enc: null, plain: "abc" });
  });

  it("treats empty input as no credential", async () => {
    assert.deepEqual(await sealCredential(null, KEY), { enc: null, plain: null });
    assert.deepEqual(await sealCredential("", KEY), { enc: null, plain: null });
    assert.equal(await openCredential(null, null, KEY), null);
  });

  it("falls back to the plaintext column for rows not yet backfilled", async () => {
    assert.equal(await openCredential(null, "legacy-token", KEY), "legacy-token");
  });

  it("prefers enc over a stale plaintext value", async () => {
    const sealed = await sealCredential("new-token", KEY);
    assert.equal(await openCredential(sealed.enc, "old-token", KEY), "new-token");
  });

  it("refuses to read an encrypted row without the key instead of returning nothing", async () => {
    const sealed = await sealCredential("t", KEY);
    await assert.rejects(() => openCredential(sealed.enc, null, ""), SecretsError);
  });

  it("does not decrypt under a different key", async () => {
    const sealed = await sealCredential("t", KEY);
    await assert.rejects(() => openCredential(sealed.enc, null, "another-key"), SecretsError);
  });
});
