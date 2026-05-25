# PRD — International Expansion, Localization & Data Residency

**Owner:** Platform / Compliance
**Status:** Draft 2026-05-24 — scope confirmed: ship in order **US compliance hardening → Canada (Phase 1) → Mexico (Phase 2) → EU (Phase 3 — requires the data-residency architecture below)**.
**Tracking:** Consolidated Gap Register entries **#1148 (parent)**, **#1149 (US compliance — data export upgrade + consent banner + GPC)**, **#1150 (Canada — fr-CA + Quebec Law 25 + postal validation)**, **#1151 (Mexico — es-MX + MX subdivisions + LFPDPPP + MXN/IVA)**, **#1152 (EU — data residency routing + DE/FR + DPA + DPO)**, **#1153 (dynamic region-aware Privacy / Terms / Cookie pages)**.
**Surfaces:** Settings → Language, Settings → Privacy, Settings → Cookies, Billing/Checkout, PrivacyPolicy / TermsOfService / CookiePolicy routes, every form with hardcoded English copy (audit at [frontend/i18n-hardcoded-audit.txt](../../frontend/i18n-hardcoded-audit.txt)), backend tenant routing layer (new).

---

## 0. Strategic framing

We are expanding from **US-only** to **US + Canada + Mexico** first, with **Europe** following. The work decomposes into four orthogonal concerns that historically get conflated:

| Concern | What it is | Driven by |
|---|---|---|
| **Localization (i18n)** | Translating UI copy to the user's language | User preference (lang) + market entry |
| **Regional formatting** | Dates, times, numbers, currency, addresses, phone, postal | User locale + billing country |
| **Legal compliance** | Privacy notices, consent gates, data-subject rights | User jurisdiction (country of residence) |
| **Data residency** | Where bytes physically sit + cross-border transfer rules | User jurisdiction + regulator |

These four axes are independently composable. A French-speaking user in Belgium needs (a) French copy, (b) EU date/time formats, (c) GDPR notices, (d) EU data storage. A Quebecois user needs (a) French copy, (b) Canadian formats, (c) PIPEDA + Law 25 notices, (d) US storage is fine.

**The architectural commitment:** every layer reads `user.country` (jurisdiction) + `user.locale` (language) + `user.dataRegion` (storage), and self-gates. Never prop-drill `isGdprUser` or `shouldShowCookieBanner` — components decide their own visibility per the standing DRY rule.

---

## 1. Audit — what exists today

### 1.1 i18n (further along than expected)

- ✅ **i18next** + `react-i18next` + `i18next-http-backend` + `LanguageDetector` fully wired ([frontend/lib/i18n/i18n.ts](../../frontend/lib/i18n/i18n.ts))
- ✅ English bundled into main JS chunk for zero-flash first render
- ✅ Spanish (`es`) loaded on demand from `/locales/es.json` (~5,200 keys, ~95% coverage)
- ✅ `w` debug locale (super_admin only) renders every alphabetic glyph as W — used in QA to spot unlocalized strings
- ✅ `applyLocale()` programmatic switcher in [shared/i18n.ts](../../shared/i18n.ts) normalises BCP47 ("en-US" → "en")
- ✅ Persisted on `account_preferences.language`
- ❌ **No fr-CA, no fr-FR, no es-MX, no de-DE**
- ❌ **~2,184 hardcoded English strings** across 307 components — audit file already exists at [frontend/i18n-hardcoded-audit.txt](../../frontend/i18n-hardcoded-audit.txt). Concentrated in legal pages, billing forms, marketing landing pages
- ❌ No region-aware copy keys (today there's no `address.field.state_or_province` that flexes to "Province" in CA)
- ❌ No RTL infrastructure (not needed for CA/MX/EU but blocks ME/HE expansion later)

### 1.2 Timezones (well-architected, just needs UI polish)

- ✅ All `timestamp` columns use `withTimezone: true` (UTC internally)
- ✅ Dedicated `useUserTimezone()` hook with IANA storage + browser fallback
- ✅ `formatInUserTimezone()` wraps `Intl.DateTimeFormat`
- ✅ Persisted on `account_preferences.timezone`
- ❌ Timezone picker UI not exposed in Settings (the data round-trips but the user can't change it explicitly — only browser-detected)

### 1.3 Data residency (single region today)

- Database: **PostgreSQL via Neon** (single project, currently US East). Neon supports EU/JP regions on separate projects but no multi-region code path exists
- File storage: **AWS S3 + Cloudflare R2** — region configurable via env, no multi-region replication code
- **No `dataRegion` / `tenantRegion` field anywhere on users, companies, or accounts**
- `billing_address.country` (ISO 3166-1 alpha-2) is the closest thing we have to "where the user is" — but it's billing-address only, not legal residence
- No DPA, no SCCs referenced, no cross-border transfer audit trail

### 1.4 Legal surfaces (partial credit, important gaps)

- ✅ **PrivacyPolicy.tsx** — 1,300+ lines, mentions GDPR, CCPA/CPRA, VCDPA, CTDPA, ColoradoCPA, **CASL & PIPEDA (Canada)**, **LFPDPPP (Mexico)**, 10+ US state laws. All in one page, all in English, no jurisdictional branching
- ✅ **TermsOfService.tsx** — controller named as "Fix Faster LLC, c/o HireFractionalTalent.com, Troy, MI"
- ✅ **CookiePolicy.tsx** — 34 sections (essential / analytics / marketing cookies)
- ✅ **DeleteAccountDialog.tsx** — GDPR right-to-be-forgotten with checkbox flow, 36-month retention enforced
- ✅ **`/api/Settings/export` endpoint** (in [routes/settings.ts:505](../../api/src/routes/settings.ts#L505)) — returns CSV. Functional but **CSV ≠ GDPR Art. 20 "structured, commonly used, machine-readable"**. Likely needs upgrading to JSON bundle covering profile + resumes + applications + media manifest
- ✅ **`useCookiePreferences` hook** ([frontend/hooks/use-cookie-preferences.ts](../../frontend/hooks/use-cookie-preferences.ts)) — full local + server round-trip, anonymous-to-authed seeding logic. Backed by `/api/Settings/cookies`
- ❌ **No cookie consent banner component is mounted** — the hook exists but nothing pre-gates analytics/marketing scripts on consent. GTM fires for everyone
- ❌ **No Global Privacy Control (GPC) signal honoring** — CCPA/CPRA requires it
- ❌ **No DPA page**, no Article 30 records of processing, no DPO contact
- ❌ Privacy notices conflate all jurisdictions — Quebec/Mexico want jurisdiction-specific language with named Privacy Officer + ARCO rights wording

### 1.5 Currency & pricing

- ✅ `PaymentProvider` interface in [api/src/services/billing/payment/types.ts](../../api/src/services/billing/payment/types.ts) accepts `currency` field
- ✅ Stripe + Helcim both wired to support CAD / MXN (both providers support these natively)
- ❌ No multi-currency price table — Pricing.tsx still implies USD
- ❌ No currency selector
- ❌ No tax calc per jurisdiction (VAT / GST+PST+QST / IVA)

### 1.6 Address / phone / postal

- ✅ Billing address schema in [shared/billing-address.ts](../../shared/billing-address.ts) — `country` is ISO 3166-1, `state` is free-form (max 100 chars) **but** Helcim requires ISO 3166-2 codes for US/CA
- ✅ US states + CA provinces in [frontend/lib/billing/subdivisions.ts](../../frontend/lib/billing/subdivisions.ts) — dropdown swaps based on country
- ❌ **No MX states** — Mexico has 31 states + CDMX, none seeded
- ❌ Phone is free-form (max 40 chars) — no E.164 validation, no country-specific format hints
- ❌ Postal code is free-form (max 20 chars) — no per-country pattern validation (Canada: `A1A 1A1`, Mexico: `12345`, UK: `SW1A 1AA`, etc.)

---

## 2. The legal landscape (what we have to comply with)

### 2.1 United States — the floor we already cover (mostly)

| Law | Scope | What we already do | What's missing |
|---|---|---|---|
| **CCPA/CPRA** | California residents | Privacy notice mentions it, delete flow works | Art. 20 portability is CSV-only, **no GPC signal honoring**, **no cookie banner / pre-consent gate** |
| **VCDPA** (Virginia) | VA residents | Mentioned in privacy notice | Same gaps |
| **CTDPA / ColoradoCPA / others** | per-state | Mentioned | Same gaps + per-state opt-out form not exposed |
| **CASL** (yes, mentioned for US too because of cross-border email) | Email marketing to Canada | — | Unsubscribe is wired in transactional email; marketing-pixel consent gate missing |
| **State minor laws** (e.g. age-appropriate design) | Under-18 / under-16 | Birthday + minor flag exists | Not formally audited |

**P0 US gaps to close BEFORE adding any new market:**
- Upgrade `/api/Settings/export` from CSV to a JSON bundle (profile, resumes, applications, messages, billing history, media manifest with R2 URLs)
- Mount a cookie consent banner that gates `analytics` + `marketing` + `personalization` scripts (the hook exists, just no UI mounted)
- Honor the `Sec-GPC: 1` request header as an automatic opt-out signal
- Wire delete flow to actually purge (not just soft-delete) after the 36-month bake window
- Self-service opt-out page (`/privacy/opt-out` or Settings → Privacy → "Do not sell or share")

### 2.2 Canada — PIPEDA + Quebec Law 25

- **PIPEDA** (federal) — covers all Canadians. Allows US storage with "comparable level of protection." Practical reqs: named Privacy Officer, breach notification, consent, access/correction rights
- **Quebec Law 25** (provincial, in force) — stricter. **Mandatory French parity**, named Privacy Officer with public contact, mandatory PIA for high-risk processing, explicit consent for biometric/sensitive data, automated decision-making disclosure
- **CASL** — anti-spam: explicit opt-in for commercial email to Canadians; unsubscribe in every msg

**Practical:** for Phase 1 we ship a Canadian-specific privacy addendum + French translation + named Privacy Officer + consent UI for any biometric processing (the voice clone marketplace is the only thing that comes close). **No data-residency change required** — PIPEDA permits US storage with safeguards.

### 2.3 Mexico — LFPDPPP

- **LFPDPPP** (federal) — modeled on GDPR-lite. ARCO rights (Access, Rectification, Cancellation, Opposition), Privacy Notice required at point of collection, consent for sensitive/financial data, INAI is the regulator
- **Cross-border transfers** allowed with notice + consent
- **No data residency requirement** — US storage is fine

**Practical:** es-MX locale (formal "usted" register differs from Spain's), Mexican Privacy Notice with ARCO procedure + designated person, MX state dropdown, MXN currency, IVA (16%) tax calc, RFC tax ID field in billing for B2B.

### 2.4 Europe — GDPR (and friends)

- **GDPR** — full subject rights, Art. 30 records, DPIA for high-risk, DPO if scale/sensitivity thresholds hit, breach notification 72h
- **ePrivacy Directive** — cookie consent gate **before** non-essential cookies fire (the cookie banner we already need for US is GDPR-required here)
- **Cross-border transfers from EU → US** — require SCCs or adequacy decision. Post-Schrems II this is fragile. Path of least resistance: **store EU data in EU**
- **Country additions on top of GDPR**: DE-specific BDSG, FR-specific CNIL, UK GDPR (post-Brexit, similar but separate)
- **EU AI Act** — applies to ML features (resume scoring, AI matching, voice cloning). Transparency obligations + high-risk classification for employment-related automated decisions — **this hits us directly**

**Practical:** EU expansion is a major engineering project, not a sprint. Data-residency architecture (§3) is the gating dependency. Defer until US + CA + MX revenue justifies it.

---

## 3. Architecture — data residency model

### 3.1 The schema change

Add three new columns to `users`:

```sql
ALTER TABLE users ADD COLUMN country_code char(2);            -- ISO 3166-1 alpha-2, user's legal residence
ALTER TABLE users ADD COLUMN data_region varchar(16) NOT NULL DEFAULT 'us';  -- 'us' | 'eu' | 'apac' (future)
ALTER TABLE users ADD COLUMN jurisdiction varchar(16);        -- derived: 'US-CA' | 'CA-QC' | 'MX' | 'EU-DE' | 'EEA' | 'UK' | etc.
```

- `country_code` is **declared by the user** at signup (not geo-IP — geo-IP is a hint, not authoritative). It can also be inferred at signup from the OAuth provider's locale.
- `data_region` is **derived from `country_code` at signup** via a `COUNTRY_TO_REGION` mapping, then **frozen**. Changing region requires a data-migration job (rare, manual).
- `jurisdiction` is a derived label used for compliance routing (which privacy notice variant to render, which consent flow to use, which tax rule applies). It's a function of `country_code` + state/province where relevant. Stored materialized to keep query patterns simple.

**Why frozen `data_region`:** the moment you allow `data_region` to mutate, you have to build cross-region migration tooling. We don't need that day-1 — a user who moves from US to EU can keep their US-stored account, or open a new EU account. This is the "tenant" boundary.

### 3.2 The routing layer

EU expansion means **two production environments**:

```
hired.video (US)                hired.video/eu (EU)
├── Neon project: us-east-1     ├── Neon project: eu-west-1
├── R2 bucket: us-default       ├── R2 bucket: eu-default
└── CF Worker: default          └── CF Worker: eu-routed
```

The Cloudflare Worker reads a routing cookie (`hv_region=eu`) or a `region` claim baked into the JWT at login, and proxies to the appropriate origin. The user picks their region **once at signup** (or it's chosen for them from declared country) and the JWT carries it forward.

Pre-EU, `data_region='us'` is the only value, the routing layer is a no-op, and we ship the schema without the infra. Adding the infra later is then mechanical: spin up the EU Neon + R2, deploy the EU Worker, flip a feature flag.

### 3.3 What stays single-region forever

Catalogues that aren't user data — template marketplace, voice clone marketplace, public job board, public articles — stay in a single canonical region (US) and are read by both worlds. Only **user-owned PII** (resumes, applications, messages, media, billing) is region-pinned.

### 3.4 Cross-region read patterns

When an EU user browses the US-hosted job marketplace, that's a read of public data (allowed). When they apply, the application row is written to **their** region (EU). The job-applications table lives in the recruiter's region; this means a US recruiter posting a job receives EU applications via a federation layer — likely Postgres logical replication of an `application_inbox` materialized view, region-to-region. **Open question** for EU phase.

---

## 4. i18n expansion strategy

### 4.1 Locale catalogue plan

| Phase | Add to `SUPPORTED_LOCALES` | Source | Quality target |
|---|---|---|---|
| P0 (US compliance) | none — extract hardcoded strings into `en.json` only | manual extraction sweep | 100% of legal + consent + billing UI translatable |
| P1 (Canada) | `fr-CA` | machine translation (Deepl/Google) → human Quebec-French review of legal + billing copy | 100% of legal pages, 95%+ of UI; mandatory for Quebec Law 25 |
| P2 (Mexico) | `es-MX` (forked from `es`) | diff against existing `es` for MX-specific terms, formal `usted` register | 95%+ |
| P3 (EU) | `fr-FR`, `de-DE`, optionally `es-ES` (today's `es` will diverge) | pro translation | 100% legal, 95% UI |

**SoT update:** [shared/i18n.ts](../../shared/i18n.ts) — extend `SUPPORTED_LOCALES` per phase. Today: `["en", "es", "w"]`. After P1: add `"fr"` (base) or treat as `"fr-CA"` (full BCP47 — see §4.3). Add corresponding `PUBLIC_LOCALES` entry.

### 4.2 Hardcoded-string extraction (P0)

The 2,184-string audit is the work item. Strategy:

1. **Block new hardcoded strings** with an ESLint rule (`react/jsx-no-literals` scoped to JSX text + a custom rule for string props like `placeholder=`, `title=`). Failing first prevents regression while we clean up
2. **Triage the audit by surface priority** — legal pages first (Quebec Law 25 won't ship without them in French), then billing/checkout, then settings, then dashboards, then marketing pages
3. **Sweep by component, not by string** — each touched component gets its strings extracted as a single PR rather than dribbling

### 4.3 BCP47 vs base-tag — decision point

Today `normalizeLocale()` strips region tags: `"en-US"` → `"en"`. This breaks for fr-CA vs fr-FR or es-MX vs es-ES.

**Decision:** keep the strip behavior for `en` (no expected variants) but **opt-in preserve** for `fr` and `es` once we ship CA/MX:

```ts
const PRESERVE_REGION: ReadonlySet<string> = new Set(["fr", "es"]);
```

So `"fr-CA"` stays `"fr-CA"`, `"fr"` stays `"fr"`, fallback chain is `fr-CA → fr → en`. Resource files become `/locales/fr-CA.json`, `/locales/fr.json` (later EU base), `/locales/es-MX.json`, `/locales/es.json`.

Migration of stored `account_preferences.language='es'` is a no-op — existing `es` rows continue working. Mexican users get `es-MX` only if they pick it.

### 4.4 Region-aware label keys

The "state vs province vs region" problem is **not** a translation problem — it's a regional-copy problem orthogonal to language. Solution: keys flexed by jurisdiction not language:

```ts
const ADDRESS_LABEL_KEYS = {
  US: "address.field.state",
  CA: "address.field.province",
  MX: "address.field.state",
  // default: "address.field.region"
};
```

A single `useAddressLabels(country)` hook returns the right keys. Same pattern for "ZIP" vs "Postal code" vs "Postcode."

---

## 5. Regional Privacy / Terms / Cookie pages — **dynamic, region-aware** (per decision)

### 5.1 The pattern

One `<PrivacyPolicy />` component, sectioned. Each section opts into a `jurisdictions: string[]` prop. The page reads `useUserJurisdiction()` (derived from `user.country_code` for logged-in users, geo-IP fallback for anonymous, with explicit "viewing as..." selector at the top of the page).

```tsx
function PrivacyPolicy() {
  const { jurisdiction } = useUserJurisdiction();  // 'US-CA' | 'CA-QC' | 'MX' | ...
  return (
    <>
      <BaseDataPracticesSection />                                {/* all */}
      <USCaliforniaRightsSection jurisdictions={["US-CA"]} />     {/* self-gates */}
      <PIPEDARightsSection jurisdictions={["CA-*"]} />
      <QuebecLaw25Section jurisdictions={["CA-QC"]} />
      <MexicoARCOSection jurisdictions={["MX"]} />
      <GDPRRightsSection jurisdictions={["EEA-*", "UK"]} />
    </>
  );
}
```

Each section component reads `useUserJurisdiction()` itself and `return null` when it shouldn't render — **no prop-drilled `canShowGdprSection` boolean** per the DRY rule. Wildcards (`CA-*`) are matched by a small `matchesJurisdiction(current, pattern)` helper in `shared/jurisdictions.ts`.

### 5.2 "Viewing as" selector

At the top of the policy page, a dropdown lets anyone see any jurisdiction's variant — important for legal review, regulator inspection, and the user's own ability to check what applies to them. The default selection is `useUserJurisdiction()`, the override is held in URL `?as=CA-QC`.

### 5.3 Why this over separate routes

- Legal review wants to see the **diff** between jurisdictions — easier with shared base + modular sections than with three forked files that drift
- Translations stay aligned — one `i18n` key per section
- Updates to shared boilerplate (data retention period, controller name) touch one section, not N forks
- **Risk:** harder to point regulators at "your specific notice" — mitigated by stable `?as=CA-QC` URL + an SEO-visible `<link rel="alternate" hreflang="fr-CA" href="?as=CA-QC&lang=fr">`

Same pattern applied to **TermsOfService** (jurisdiction-specific governing law, arbitration carve-outs) and **CookiePolicy** (which cookies fire per jurisdiction).

### 5.4 The `useUserJurisdiction()` hook contract

```ts
type Jurisdiction =
  | "US" | "US-CA" | "US-VA" | "US-CT" | "US-CO" | ...
  | "CA" | "CA-QC" | "CA-BC" | ...
  | "MX"
  | "EEA-DE" | "EEA-FR" | "EEA-IE" | ... | "EEA-OTHER"
  | "UK"
  | "ROW";  // rest of world

function useUserJurisdiction(): {
  jurisdiction: Jurisdiction;
  source: "user_declared" | "billing_address" | "geo_ip" | "override";
  overrideTo: (j: Jurisdiction | null) => void;
};
```

Resolution priority: explicit URL `?as=` override → `user.jurisdiction` (logged-in) → `billing_address.country + state` → geo-IP guess → `"ROW"`.

---

## 6. Currency, tax, payment routing

### 6.1 Currency selection

| Mechanism | Drives |
|---|---|
| `user.locale` | Display formatting (`Intl.NumberFormat`) |
| `billing_address.country` | Stripe/Helcim charge currency |
| New `user.preferred_currency` (optional) | Override for display only |

Pricing table needs per-currency localized prices (not just FX-converted USD). Decision: hold prices as USD-canonical and present per-region "approximately X CAD" until we set proper localized prices for each tier. PRD'd separately under the existing pricing roadmap ([project_token_pricing.md](../../../../Users/seanh/.claude/projects/c--code-hired/memory/project_token_pricing.md)).

### 6.2 Tax

| Region | Tax | Implementation |
|---|---|---|
| US | Sales tax (per-state nexus) | Stripe Tax or TaxJar — defer until revenue thresholds hit a nexus |
| CA | GST (5%) federal + PST/QST/HST per-province | Helcim supports CA tax — wire it on phase 1 |
| MX | IVA (16%) federal | Helcim supports — wire on phase 2 |
| EU | VAT per-MS + MOSS | Stripe Tax MOSS — phase 3 |

B2B sellers (recruiters / employers paying for seats) need **VAT ID** / **GST/HST number** / **RFC** capture fields in billing — extends [shared/billing-address.ts](../../shared/billing-address.ts).

---

## 7. Address / phone / postal validation

### 7.1 Subdivisions

Extend [frontend/lib/billing/subdivisions.ts](../../frontend/lib/billing/subdivisions.ts) per phase:

- **Phase 1:** No new entries (CA already done)
- **Phase 2:** Add `MX_STATES` (32 entries: 31 states + CDMX) — needed for Helcim MX customer creation
- **Phase 3:** Add `GB_COUNTRIES` (4), `DE_LANDER` (16), `FR_REGIONS` (18), `AU_STATES` (8 — useful side benefit since AU isn't on the roadmap but Helcim supports it)

### 7.2 Postal code patterns

New file `shared/postal-codes.ts`:

```ts
export const POSTAL_PATTERNS: Record<string, { pattern: RegExp; placeholder: string }> = {
  US: { pattern: /^\d{5}(-\d{4})?$/, placeholder: "12345" },
  CA: { pattern: /^[ABCEGHJKLMNPRSTVXY]\d[A-Z] ?\d[A-Z]\d$/i, placeholder: "A1A 1A1" },
  MX: { pattern: /^\d{5}$/, placeholder: "12345" },
  GB: { pattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, placeholder: "SW1A 1AA" },
  DE: { pattern: /^\d{5}$/, placeholder: "12345" },
  FR: { pattern: /^\d{5}$/, placeholder: "75001" },
};
```

Validation added to `BillingAddressSchema` as a `.superRefine` that branches on `country`.

### 7.3 Phone validation

Add `libphonenumber-js` (already mature, well-maintained, small footprint when tree-shaken to the metadata of the countries we support). Format to E.164 on submit. Country-specific placeholder hint based on `billing_address.country`.

---

## 8. Phased rollout

### Phase 0 — US compliance hardening (closes **Gap #1149**) — **start immediately**

**Goal:** every gap we'd be embarrassed to ship internationally with, fixed at home first.

- [ ] **Mount cookie consent banner** wired to `useCookiePreferences` — bottom-of-page slide-in on first visit, persistent "Cookie settings" footer link
- [ ] **Gate GTM / analytics on `preferences.analytics === true`** — don't fire `gtag` script tag until consent
- [ ] **Honor `Sec-GPC: 1`** header in `useCookiePreferences` initial load — treat as `analytics: false, marketing: false, personalization: false` on first visit (user can still opt back in)
- [ ] **Upgrade `/api/Settings/export`** from CSV to JSON-bundle download (zip containing `profile.json`, `resumes.json`, `applications.json`, `messages.json`, `billing.json`, `media-manifest.json`). Keep the CSV option for users who prefer it
- [ ] **Self-service "Do not sell or share my personal information" page** at `/privacy/opt-out` for CCPA compliance — toggles the marketing/personalization cookie categories + sets a server-side `do_not_share` flag on the user row
- [ ] **Hard-delete worker** — today the delete flow soft-deletes + retains for 36 months per privacy policy; needs a nightly job that purges rows past retention from primary + replicas + analytics. The policy promises this; the worker doesn't exist yet
- [ ] **Named DPO contact in privacy notice** + dedicated mailbox (`privacy@hired.video`)

**Scope cut from P0 (deferred to later):** the dynamic region-aware Privacy Policy refactor (§5) is its own gap **#1153** — landing this in P0 means doing the architecture once and shipping all jurisdictions through it, rather than re-doing it three times.

**Acceptance:** a privacy-conscious US user can sign in with GPC enabled, see no analytics fire, opt out of "sell/share" without contacting support, request a downloadable JSON bundle of their data, and delete their account with a clear statement that purge happens at the end of the retention window.

### Phase 1 — Canada (closes **Gap #1150**)

**Depends on:** P0 complete + §5 dynamic privacy refactor (#1153) shipped.

- [ ] **Add `fr-CA` locale** to `SUPPORTED_LOCALES`, `/locales/fr-CA.json`, BCP47 region-preserve for `fr` (§4.3)
- [ ] **Sweep hardcoded English strings** in legal pages + billing + settings + onboarding — extract into `en.json` keys; machine-translate to `fr-CA`; human review of legal copy by certified Quebec-French legal translator
- [ ] **Mount `<QuebecLaw25Section />`** + `<PIPEDARightsSection />` in the dynamic privacy page (§5)
- [ ] **Named Privacy Officer** for Canada published on `/privacy?as=CA-QC` per Law 25 § 8.1
- [ ] **Postal code validation** wired in `BillingAddressSchema` (§7.2)
- [ ] **Address label keys** flex to "Province" + "Postal code" in CA (§4.4)
- [ ] **CAD currency** wired in checkout based on billing country — Helcim default for CA
- [ ] **GST/HST/PST/QST tax** wired via Helcim per province
- [ ] **CASL-compliant marketing email** — explicit opt-in checkbox at signup for `marketing_emails_optin` if billing country is CA; default false. Transactional email is fine without
- [ ] **Voice clone marketplace consent** — Quebec Law 25 § 12 says explicit consent for biometric/sensitive — the voice clone flow needs a CA-specific consent gate (the surface already exists per [project_voice_marketplace.md](../../../../Users/seanh/.claude/projects/c--code-hired/memory/project_voice_marketplace.md))

**No data-residency work.** US storage is permitted under PIPEDA with safeguards.

**Acceptance:** a user in Montreal signs up, sees the UI in fr-CA, sees their privacy notice cite Law 25 with the named Privacy Officer, pays in CAD with QST applied, gives explicit consent before any voice clone or marketing email goes out.

### Phase 2 — Mexico (closes **Gap #1151**)

**Depends on:** P0 complete + §5 dynamic privacy refactor (#1153) shipped.

- [ ] **Add `es-MX` locale** — fork `es.json` → `es-MX.json`, diff for MX-specific terms (e.g. "trabajo" vs "empleo" vs "puesto"), formal "usted" register for billing/legal copy
- [ ] **Add `MX_STATES`** to subdivisions.ts (§7.1)
- [ ] **Postal code validation** for MX (§7.2)
- [ ] **Mount `<MexicoARCOSection />`** in dynamic privacy page (§5) with named designated person + ARCO request procedure
- [ ] **MXN currency** wired in checkout
- [ ] **IVA (16%) tax** wired via Helcim
- [ ] **RFC tax ID field** in billing for B2B invoices (extends `BillingAddressSchema`)
- [ ] **Spanish-language Cookie Policy** + Privacy Notice **at point of collection** (LFPDPPP requires this — show a short version on the signup page itself, not just buried in /privacy)

**No data-residency work.** US storage is permitted under LFPDPPP with notice + consent.

**Acceptance:** a user in CDMX signs up in es-MX, sees ARCO rights spelled out, pays MXN with IVA applied, can request RFC-enabled invoices.

### Phase 3 — Europe (closes **Gap #1152**)

**Depends on:** all of the above + a sustained business case for EU expansion (revenue / partnership / strategic).

- [ ] **Data-residency schema** (§3.1) — `country_code`, `data_region`, `jurisdiction` columns on `users`
- [ ] **Tenant routing layer** at the Cloudflare Worker level (§3.2)
- [ ] **EU Neon project** in `eu-west-1` + **EU R2 bucket** in EU
- [ ] **Region selector at signup** + frozen-once-chosen
- [ ] **Cross-region read patterns** for marketplaces + applications (§3.4 — open question)
- [ ] **Add fr-FR, de-DE locales** (and possibly es-ES forked from existing es)
- [ ] **DPA page** + signable DPA template
- [ ] **Records of Processing** (Art. 30) published or available on request
- [ ] **DPO** appointed if thresholds hit (likely yes given scale + sensitive processing)
- [ ] **EU AI Act compliance audit** of resume scoring + AI matching + voice cloning — transparency labels + high-risk classification documentation
- [ ] **Mount `<GDPRRightsSection />`** in dynamic privacy page
- [ ] **VAT MOSS** registration + wire via Stripe Tax
- [ ] **UK GDPR variant** for `?as=UK` if shipping UK alongside EU

**Acceptance:** an EU user signs up, their JWT carries `region=eu`, every API call routes to EU infra, no PII crosses the Atlantic for their account, the EU AI Act transparency requirements are met for any AI feature surfaced to them.

---

## 9. Open questions

1. **Federated marketplaces under EU residency** — US recruiter posts a job, EU candidate applies. Where does the application row live? Working assumption: in candidate's region with a federated read into recruiter's region via logical replication. Validate before P3.
2. **Existing `es` users post-`es-MX` split** — do we auto-migrate users whose `billing_address.country='MX'` to `es-MX`? Recommendation: yes, on next login, with a one-time toast "We've localized for Mexico — change back in Settings."
3. **Geo-IP fallback library** — Cloudflare provides `cf-ipcountry` header for free. Use that for the anonymous-visitor jurisdiction hint; no third-party library needed.
4. **AI Act applicability for non-EU users** — does the resume scorer need transparency labeling for US users too? Likely yes from a brand-trust standpoint even where not required. Decision deferred.
5. **Children / minor protections** — Quebec Law 25 has stricter consent rules for under-14. Today's birthday/minor flag handling needs an audit per phase.

---

## 10. Cross-references

- Existing privacy preferences schema: [api/drizzle/0011_privacy_preferences.sql](../../api/drizzle/0011_privacy_preferences.sql)
- Existing cookie hook: [frontend/hooks/use-cookie-preferences.ts](../../frontend/hooks/use-cookie-preferences.ts)
- Existing i18n SoT: [shared/i18n.ts](../../shared/i18n.ts), [frontend/lib/i18n/i18n.ts](../../frontend/lib/i18n/i18n.ts)
- Existing billing address schema: [shared/billing-address.ts](../../shared/billing-address.ts)
- Existing subdivisions: [frontend/lib/billing/subdivisions.ts](../../frontend/lib/billing/subdivisions.ts)
- Existing CSV export: [api/src/routes/settings.ts:505](../../api/src/routes/settings.ts#L505)
- Hardcoded-string audit: [frontend/i18n-hardcoded-audit.txt](../../frontend/i18n-hardcoded-audit.txt)
- Voice clone marketplace consent surface (relevant for Quebec Law 25): per memory [[project_voice_marketplace]]
- Token pricing (relevant for per-region price tables): per memory [[project_token_pricing]]
