# Paid Media — Vendor Application Materials

Drafts for the five vendor app-review submissions that gate Standard / Advanced
API access. Each section is self-contained — copy/paste into the platform's
review form, replace `<...>` placeholders, and submit.

**Last updated:** 2026-05-23
**Product:** hired.video paid-media integration ([source](../../api/src/services/paid-media/))
**Owner:** seanhogg@gmail.com
**Privacy policy:** https://hired.video/privacy
**Terms of service:** https://hired.video/terms
**Data deletion endpoint:** `DELETE /api/users/me` (initiates account + downstream connector deletion)

---

## 1. Meta Marketing API (Standard Access)

**Where to apply:** https://developers.facebook.com/apps → your app → App Review → Permissions and Features

### Business Verification prerequisites
- [ ] Business legal name + registered address
- [ ] Domain verified via meta-tag or DNS TXT on `hired.video`
- [ ] Privacy policy URL + ToS URL set in Basic Settings
- [ ] Data Deletion Instructions URL: https://hired.video/privacy#deletion
- [ ] App icon 1024×1024, App name "hired.video Paid Media"

### Permissions to request
| Permission | Use Case |
|------------|----------|
| `ads_management` | Create and manage campaigns / ad sets / ads on the connected user's behalf via Marketing API. |
| `ads_read` | Read campaign performance for the in-app reporting dashboard at `/settings/ads`. |
| `business_management` | List Business Manager assets so users can pick the ad account to use. |
| `pages_show_list` | List Facebook Pages the user manages so they can select the page that owns video creatives. |
| `pages_read_engagement` | Required for Page-owned ads to render correctly. |
| `instagram_basic` | Allow campaigns to target the Instagram surface for connected Pages. |

### Use case narrative (paste into "Tell us how you'll use this permission")

> hired.video is a hiring platform where job seekers create AI-generated video resumes,
> recruiters source candidates, and employers post jobs and run recruitment marketing.
>
> Our paid-media module lets employers, recruiters, and creators connect their own Meta
> ad accounts and run programmatic campaigns through hired.video's unified builder. We
> reuse video assets created in our Studio editor as Meta video ads (Feed/Reels/Stories),
> targeting the Lookalike audiences of past applicants or custom audiences uploaded from
> the customer's ATS.
>
> All ad spend flows through the customer's own Meta payment method. We never proxy
> billing. We persist only OAuth tokens (envelope-encrypted with AES-GCM via HKDF-SHA-256,
> keyed by PAID_MEDIA_KMS_KEY) and a copy of the customer's campaign/ad-set/ad
> definitions so we can re-sync on edit. Conversion events (signup, paid_upgrade, lead)
> are sent server-side via the Conversions API with hashed PII (SHA-256 of normalised
> email/phone) and the visitor's fbclid cookie for click-level attribution.

### Test instructions to give Meta reviewers

> 1. Log in at https://hired.video/login with the test account (email/password supplied separately via App Contact email).
> 2. Navigate to https://hired.video/settings/ads.
> 3. Click "Connect" on the Meta tile. You will be redirected to the Meta consent screen with the requested scopes.
> 4. After approving, you'll be redirected back to /settings/ads?status=connected. The Connections tab shows your linked Business Manager + ad accounts.
> 5. Go to the Campaigns tab → "New campaign" → enter a name and TRAFFIC objective → Create.
> 6. Use the "Sync to…" dropdown on the campaign row, pick your Meta ad account. A campaign will be created on Meta with status=PAUSED.
> 7. Verify in https://business.facebook.com/adsmanager that the campaign exists and is paused.
> 8. Disconnect at any time via /settings/ads → Connections → Disconnect (revokes our token; campaigns remain on Meta).

### Data Use disclosure

| Data type | How we use it | Where it's stored | Retention |
|-----------|---------------|-------------------|-----------|
| OAuth access/refresh tokens | Authorise API calls on user's behalf | `paid_media_connections.access_token_enc` (AES-GCM at rest) | Until user disconnects or revokes |
| External user id + handle | Display "Connected as X" in UI | `paid_media_connections.external_user_id` | Same as above |
| Ad account list | Let user select which account to use | `paid_media_accounts` | Same as above |
| Campaign/ad-set/ad definitions | Source of truth for sync | `paid_media_campaigns`, `paid_media_ad_sets`, `paid_media_ads` | Until user deletes |
| Hashed conversion identifiers | Server-side CAPI attribution | `paid_media_conversions.email_hashed` (SHA-256 only) | 90 days |
| fbclid cookie | Click-level attribution on conversions | `_hv_fbclid` cookie (90 days) | 90 days |

### Special Ad Category
We default new campaigns to `special_ad_categories: ["EMPLOYMENT"]` because hired.video
is an employment platform — campaigns promote job postings, employer brands, and
career-services. This is set in [meta/index.ts:createCampaign](../../api/src/services/paid-media/adapters/meta/index.ts).

---

## 2. Google Ads API (Standard Access + Developer Token)

**Where to apply:** https://ads.google.com → Tools & Settings → API Center → Apply for Standard Access

### Prerequisites
- [ ] Google Ads Manager Account (MCC) under which the developer token lives
- [ ] OAuth 2.0 client created in https://console.cloud.google.com (Web Application type)
- [ ] Authorized redirect URI: `https://api.hired.video/api/paid-media/oauth/callback`
- [ ] Authorized JavaScript origins: `https://hired.video`, `https://api.hired.video`

### Application narrative

> hired.video is a hiring platform. Our paid-media module ([source](../../api/src/services/paid-media/)) integrates with the Google Ads API so customers can launch and manage Search, Display, Video, and Performance Max campaigns from within our product.
>
> **API usage profile:**
> - Read: `customer.list`, `googleAds.search` (GAQL) for reporting pulls
> - Write: `campaignBudgets.mutate`, `campaigns.mutate`, `adGroups.mutate`, `adGroupAds.mutate`
> - Geo: pulled on demand for campaign creation
> - Audience push: customer-uploaded match lists via `userLists` (deferred to Phase 5)
>
> **Expected QPS:** <1 per customer per minute steady-state; bursts up to 20 QPS during campaign launches.
>
> **Tools and frameworks:** Direct REST calls from a TypeScript backend hosted on Cloudflare Workers. No Google client libraries (Workers runtime). REST endpoint: `https://googleads.googleapis.com/v16/`. Adapter source: [adapters/google/index.ts](../../api/src/services/paid-media/adapters/google/index.ts).

### Standard Access checklist
- Privacy policy URL: https://hired.video/privacy
- Terms of service URL: https://hired.video/terms
- API integration overview document: this file
- Production landing page exercising the API: https://hired.video/settings/ads
- Customer support email: support@hired.video
- Bulk-write protection: every mutate operation includes an idempotency_key passed to `paid_media_sync_runs` and de-duped server-side.

---

## 3. LinkedIn Marketing Developer Platform

**Where to apply:** https://www.linkedin.com/developers/apps → your app → Products → request "Marketing Developer Platform"

### Application content

> **Company:** hired.video
> **Industry:** Internet — Recruitment & Staffing
> **Website:** https://hired.video
> **Integration description:** hired.video lets recruiters and employers run LinkedIn Sponsored Content campaigns through a unified multi-platform campaign builder. Customers connect their LinkedIn Business Manager ad account via OAuth, then build campaigns once in our UI and push them to LinkedIn (and 4 other platforms) simultaneously.

### Requested scopes
- `r_ads`, `rw_ads` — campaign / campaign-group / creative CRUD
- `r_ads_reporting` — analytics endpoint for the reporting dashboard
- `r_organization_social` — list pages so customers can select the post-owning organization

### Use case justification (per scope)

> **r_ads / rw_ads:** Customers create LinkedIn Campaign Groups (our "Campaigns") and Campaigns (our "Ad Sets") through our UI. We translate from a platform-neutral targeting spec into LinkedIn's targetingCriteria object — see [adapters/linkedin/index.ts:liTargeting](../../api/src/services/paid-media/adapters/linkedin/index.ts).
>
> **r_ads_reporting:** The /settings/ads → Reporting tab calls `/rest/adAnalytics?q=analytics` to pull daily impressions, clicks, spend, externalWebsiteConversions, and videoViews into a unified cross-platform dashboard.
>
> **r_organization_social:** Sponsored Content requires a page-owned post (urn:li:share:...). We list pages the user manages so they can pick the right post for each ad.

### Compliance
- LinkedIn Conversions API: implemented in [conversions/capi.ts:sendLinkedIn](../../api/src/services/paid-media/conversions/capi.ts) — hashes email with SHA-256 before send, uses customer-supplied `conversionRule` URN, captures `li_fat_id` from landing-page cookie for first-party attribution.
- Token storage: envelope encryption (AES-GCM via HKDF-SHA-256), key in CF Worker secrets.

---

## 4. TikTok Marketing API

**Where to apply:** https://business-api.tiktok.com/portal → Developer → "Apply for a developer account"

### Application content

> **App name:** hired.video Paid Media
> **App category:** Marketing Tool
> **Description:** Multi-platform ad campaign manager for the hired.video hiring platform. Customers connect their TikTok For Business advertiser account and use hired.video's unified campaign builder to launch TikTok in-feed video ads alongside Meta, Google, LinkedIn, and Microsoft campaigns. Video creatives are sourced from hired.video Studio (our in-product editor) or uploaded directly.

### Endpoint usage

| Endpoint | Purpose |
|----------|---------|
| `/oauth2/access_token/` | Token exchange after consent |
| `/oauth2/refresh_token/` | Long-lived token refresh |
| `/oauth2/advertiser/get/` | List advertiser accounts visible to the connected user |
| `/campaign/{create,update,status/update}/` | Campaign CRUD |
| `/adgroup/{create,update,status/update}/` | Ad-set CRUD |
| `/ad/{create,status/update}/` | Ad CRUD |
| `/report/integrated/get/` | Reporting pull |
| `/event/track/` | Server-side Events API for conversion fan-out |

### Test plan
1. Connect TikTok at https://hired.video/settings/ads
2. Pick an advertiser account
3. Create a campaign with objective=TRAFFIC and a $10 daily budget
4. Upload a 15-second test video via /file/video/ad/upload (manual step today; tracked in gap register #PM-T1)
5. Create an ad referencing the video_id
6. Verify the ad appears in TikTok Ads Manager with status=DISABLED
7. Pull reporting after 24 hours

### Data handling
- Hashed email/phone/external_id sent via Events API
- `ttclid` cookie captured at landing for click-level attribution
- Access tokens stored encrypted (AES-GCM)
- Adapter source: [adapters/tiktok/index.ts](../../api/src/services/paid-media/adapters/tiktok/index.ts)

---

## 5. Microsoft Advertising (Bing) Developer Token

**Where to apply:** https://developers.ads.microsoft.com → Apply for developer token

### Application content

> **Company:** hired.video
> **Application name:** hired.video Paid Media Integration
> **Purpose:** Programmatic campaign management — customers connect their Microsoft Advertising accounts via OAuth and use hired.video to launch Search and Audience Network campaigns alongside Meta, Google, LinkedIn, and TikTok.
> **Tech stack:** TypeScript on Cloudflare Workers. REST endpoints only (no SOAP). Pinned to current REST surface.

### Token tier requested
**Standard** — production traffic for paying customers' ad accounts. Initial volume <100 customers; expected to grow.

### Scope: `https://ads.microsoft.com/msads.manage offline_access`

### Endpoints used
| Endpoint | Purpose |
|----------|---------|
| `/CustomerManagement/v13/Accounts/Search` | List accessible ad accounts after OAuth |
| `/api/v1/campaigns` | Campaign create/update/delete |
| `/api/v1/adGroups` | Ad group CRUD |
| `/api/v1/ads` | Ad CRUD (Responsive Search Ads) |
| `/api/v1/reports/{campaignPerformance,adGroupPerformance,adPerformance}` | Reporting |
| `https://uet.atdmt.com/conversions` | UET Conversions API for server-side conversion delivery |

### Production landing surfaces
- Customer-facing: https://hired.video/settings/ads
- Internal (Microsoft reviewer): https://hired.video/superadmin/ads

### Adapter source
[adapters/bing/index.ts](../../api/src/services/paid-media/adapters/bing/index.ts)

---

## Tracking submission status

Add a row to the Consolidated Gap Register in [hired.video/README.md](../../README.md) for each platform's review:

```
- **#PM-VENDOR-META** — Meta Marketing API Standard Access app submitted YYYY-MM-DD. Reviewer needs test account. Expected SLA: 5-7 days.
- **#PM-VENDOR-GOOGLE** — Google Ads Standard Access submitted YYYY-MM-DD. Developer token granted? (Y/N)
- **#PM-VENDOR-LINKEDIN** — Marketing Developer Platform requested YYYY-MM-DD. Review status: pending|approved|denied.
- **#PM-VENDOR-TIKTOK** — TikTok Marketing API app submitted YYYY-MM-DD.
- **#PM-VENDOR-BING** — Microsoft Advertising developer token submitted YYYY-MM-DD.
```

---

## Common reviewer asks

These come up across multiple platforms — answer once, reuse:

**"How do you store and protect access tokens?"**
> All OAuth access and refresh tokens are stored encrypted at rest using AES-GCM
> with a 256-bit key derived via HKDF-SHA-256 from a master key (`PAID_MEDIA_KMS_KEY`)
> held only in Cloudflare Worker secrets. The ciphertext is self-describing
> (`base64(iv).base64(ciphertext+tag)`) so master-key rotation requires only
> re-encryption on next write — no schema change. Decryption happens only at the
> point of use inside the adapter call; tokens are never logged, never returned
> in API responses, and never stored in cookies or client-side storage.

**"How do users disconnect?"**
> Customers click "Disconnect" on the Connections tab at /settings/ads. This
> deletes the row from `paid_media_connections` (cascading to
> `paid_media_accounts` and `paid_media_platform_refs`). We do not pre-revoke
> the platform-side OAuth grant (that requires user action in the platform's
> own privacy controls).

**"What happens to user data on account deletion?"**
> When a hired.video user is deleted (`DELETE /api/users/me`), the cascade
> removes all owned `paid_media_*` rows. The corresponding ad campaigns on
> the third-party platforms are NOT deleted — those belong to the customer's
> own platform account and persist there. Users are informed of this in our
> account-deletion confirmation flow.

**"Do you charge customers for ad spend?"**
> No. Customers pay each platform directly using their own billing setup. We
> never proxy spend.

---

## Submission Status Tracker (gap-register #984)

This is the live tracker for the five Standard / Advanced access reviews. Each
submission's review SLA is set by the platform (typically 1–6 weeks) and
CANNOT be sped up by code; the only work here is keeping reviewers in front
of accurate materials and answering follow-up questions promptly.

Update the rows below as submissions land. Once all five reach `approved` the
register entry can flip to ✅ Done.

| Code | Platform | Submitted | Status | Reviewer / Ticket | Notes |
|------|----------|-----------|--------|-------------------|-------|
| PM-VENDOR-META    | Meta Marketing API (Standard Access)         | _pending_ | `unsubmitted` | — | Business Verification must complete first. |
| PM-VENDOR-GOOGLE  | Google Ads Developer Token                   | _pending_ | `unsubmitted` | — | Test account credentials prepared. |
| PM-VENDOR-LINKEDIN| LinkedIn Marketing Developer Platform        | _pending_ | `unsubmitted` | — | Internal Marketing Developer Platform application. |
| PM-VENDOR-TIKTOK  | TikTok Marketing API                          | _pending_ | `unsubmitted` | — | Awaiting TikTok For Business app review enrolment. |
| PM-VENDOR-BING    | Microsoft Advertising Developer Token        | _pending_ | `unsubmitted` | — | One developer token per app; submit after Google. |

Per-submission worksheet — fill in as we go:

- **Date submitted:** ISO 8601
- **Reviewer SLA:** value pulled from each platform's docs at submission time
- **Outcome:** `approved` | `denied` | `additional_info_requested`
- **Date resolved:** ISO 8601
- **Notes / follow-ups:** free text

When a submission is denied or asks for additional information, capture the
verbatim reviewer message + our response here so the next person doesn't have
to re-derive context.

