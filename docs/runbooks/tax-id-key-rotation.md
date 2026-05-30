# `PAYOUT_TAX_ID_KEY` Rotation Runbook

Closes gap-register **#776**. Pairs with the AES-256-GCM tax-ID
encryption shipped in `api/src/services/payout/encryption.ts` (gap
**#309**, migration `0092_payouts_ledger_and_onboarding.sql`).

This runbook documents the steps to rotate the active
`PAYOUT_TAX_ID_KEY` secret without losing the ability to decrypt rows
that were wrapped under the previous key. It is the procedure CISOs
will ask for when reviewing the platform against SOC 2 / ISO 27001 /
PCI-DSS controls for cryptographic key management.

The rotation is **versioned** — every `payout_profiles` row records
the key id it was wrapped under (`tax_id_kms_key_id`), so multiple
keys can be live at once and the application picks the correct one to
decrypt with.

---

## Operational invariants

1. **Plaintext tax IDs never leave the application boundary.** Only
   the AES-GCM ciphertext + 12-byte nonce + key-id are stored at rest.
2. **Authenticated encryption.** GCM mode means a tampered ciphertext
   fails the tag check on decrypt instead of producing garbled
   plaintext we would silently store.
3. **Per-row key id.** `tax_id_kms_key_id` records which key wrapped
   the row, so a backfill can skip rows already migrated.
4. **Rotation does not block PATCH writes.** New saves immediately
   land under the new key. Old rows are re-wrapped lazily by the
   backfill — there is no read outage during rotation.

---

## When to rotate

- **Scheduled:** every 12 months, aligned with the platform's annual
  security review.
- **Unscheduled:** on suspected compromise (e.g. CFAA incident,
  contractor offboarding without secret revocation, accidental
  commit of `wrangler secret list` output).

---

## Pre-requisites

- `wrangler` CLI authenticated to the production Cloudflare Workers
  account.
- Access to the `1Password — hired.video Production Secrets` vault to
  archive the previous-key value.
- Confirmed quiet window for the eventual deploy of step 4 below.
  Roughly 30 minutes; no traffic impact, but the deploy needs to land
  during business hours so the on-call can observe.

---

## Steps

### 1. Generate the new key

```bash
node -e "import('./api/src/services/payout/encryption.js').then(m => m.generateTaxIdKey()).then(console.log)"
```

Capture the base64-encoded 32-byte value. Store it immediately in
1Password as `PAYOUT_TAX_ID_KEY (v2)` with metadata `rotated_from: v1,
rotated_at: <ISO 8601>, rotated_by: <username>`. **Do not** commit the
value to source control or chat anywhere.

### 2. Deploy with both keys readable

Push the new key under a versioned name AND keep the previous key
around so existing rows decrypt:

```bash
wrangler secret put PAYOUT_TAX_ID_KEY        # paste the new (v2) value
wrangler secret put PAYOUT_TAX_ID_KEY_V1     # paste the old value
wrangler secret put PAYOUT_TAX_ID_KEY_ID     # set to "v2"
```

Verify the deploy:

```bash
curl -s "https://api.hired.video/api/_meta/health" | jq '.checks.payoutEncryption'
```

(Expected: `{ activeKeyId: "v2", legacyKeysLoaded: ["v1"] }`. If the
endpoint reports `activeKeyId: "v1"`, the deploy hasn't picked up the
new secret — recheck `wrangler secret list`.)

### 3. Backfill — re-encrypt all rows under the new key

Run the admin one-shot endpoint (a thin wrapper around `encryptTaxId`
that iterates `payout_profiles WHERE tax_id_kms_key_id != 'v2' AND
tax_id_ciphertext IS NOT NULL`):

```bash
curl -X POST "https://api.hired.video/api/admin/payouts/rotate-tax-ids" \
  -H "Authorization: Bearer $SUPERADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "targetKeyId": "v2" }'
```

The endpoint is idempotent — running it twice on a finished migration
is a no-op. Watch the response for `{ rowsRotated: N, errors: [...] }`.
Investigate any errors before proceeding.

### 4. Deploy with only the new key

Once the backfill confirms 0 rows still wrapped under v1, drop the
legacy secret:

```bash
wrangler secret delete PAYOUT_TAX_ID_KEY_V1
```

Confirm:

```bash
curl -s "https://api.hired.video/api/_meta/health" | jq '.checks.payoutEncryption.legacyKeysLoaded'
```

(Expected: `[]`.)

### 5. Archive

Move the old key from the active production secrets section of
1Password to the `Rotated Secrets — Archive` section with a final
note: `last row decryptable under v1 rotated <ISO 8601>`. Set a 12-
month destroy reminder on the archive entry.

---

## Rollback

If step 3 surfaces decrypt errors:

1. **Stop the backfill** immediately.
2. Leave `PAYOUT_TAX_ID_KEY_V1` deployed — both keys remain readable
   so currently-broken rows can still be inspected.
3. File an incident ticket with the per-row error list emitted from
   step 3.
4. Re-run the backfill only after the root cause is understood and
   the bad rows have been hand-repaired.

---

## Audit trail

- `billing_events` records every successful backfill batch with
  `event_type='payout_tax_id_rekey_batch'` so the audit team can
  reconstruct rotation history without touching the encrypted column.
- `audit_log` rows for SuperAdmin endpoint calls capture the
  `targetKeyId` parameter and the row count.

---

## Pairs With

- Gap **#774** — drop the legacy plaintext `tax_id_encrypted` column
  after the first rotation has confirmed every row is wrapped under
  the new schema.
- Gap **#775** — one-time backfill encrypting any surviving plaintext
  values into the AES-GCM columns before #774's drop can ship.
