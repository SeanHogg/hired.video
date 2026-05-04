-- Migration: Replace placeholder Creator Program terms with real terms.
--
-- Migrations 0036 / 0040 / 0042 seeded v1 of each program's terms doc with a
-- "Placeholder ... Update via the legal admin UI before going live." body so
-- the enrollment wizard could require explicit acceptance from day one. This
-- migration backfills the actual terms text for each program.
--
-- Strategy:
--   - UPDATE in place keyed on (kind, version='v1') AND body LIKE 'Placeholder %'.
--     This makes the migration a no-op if a superadmin has already published a
--     newer version through the legal admin UI (the placeholder body would have
--     been replaced and is_current flipped onto the new row).
--   - We keep version='v1' rather than publishing v2 because no production
--     acceptances exist yet — bumping the version would force every enrolled
--     creator to re-accept identical-in-spirit terms.
--   - Anyone who accepted v1 against the placeholder body has their acceptance
--     row preserved (the ledger snapshots kind+version+locale, not body), and
--     the now-real terms become what they're contractually bound to.

UPDATE legal_documents
SET body = $$# Video Promo Creator Program Terms

These Video Promo Creator Program Terms (these "Program Terms") govern your participation as a creator in the Video Promo program on hired.video (the "Platform"). They supplement, and are in addition to, the Platform's general Terms of Service and Privacy Policy. Capitalized terms not defined here have the meaning given in the Terms of Service.

## 1. Scope

The Video Promo program lets you offer paid promotional video production services to other Platform users ("Customers"). Customers send you a brief through a service inquiry, and if you both agree, the engagement becomes a Promo Project with a fixed price, three (3) included revisions, and a seven (7) day customer-acceptance window after delivery.

## 2. Eligibility

To enroll, you must (a) hold an active paid subscription on hired.video, (b) be at least 18 years old or the age of majority in your jurisdiction, (c) have completed payout onboarding with the Platform's payment processor, and (d) accept these Program Terms. The Platform may suspend or terminate your enrollment at any time for violations of these Program Terms, the Terms of Service, or the Acceptable Use Policy.

## 3. Your Responsibilities

You agree to (a) deliver each Promo Project in accordance with the brief, price, and timeline communicated to the Customer, (b) communicate professionally and respond to Customer messages within a reasonable time, (c) only deliver work that is your original creation or that you are otherwise licensed to deliver, (d) not deliver work that infringes any third party's intellectual-property, publicity, or privacy rights, contains unlawful content, or violates the Acceptable Use Policy, and (e) maintain the confidentiality of any Customer materials shared with you for the project.

## 4. Pricing, Platform Fee, and Payouts

You set the price for each Promo Project at order acceptance. The Platform charges a platform fee of 5% of the project price (basis points snapshotted on your creator profile at enrollment), retained from the Customer's payment. Payment processor fees charged by the Platform's processor are passed through to the Customer as a separate line item at checkout and do not reduce your payout. Funds are held in escrow from payment until the Customer accepts the delivered video, the seven-day auto-acceptance window expires, or the project is otherwise resolved under Section 7.

If you purchase additional revisions beyond the included three, those revisions are charged as separate line items, each subject to the same 5% platform fee.

## 5. Revisions and Delivery

Each Promo Project includes three (3) revisions at the project price. The Customer must approve or request changes on each delivered cut. Additional revisions beyond the included three are billed to the Customer as paid extras at the rate you have published on your creator profile.

Once you mark a cut as delivered, the Customer has seven (7) days to accept or request changes. If the Customer takes no action within seven days, the cut is automatically accepted and escrow is released to your account.

## 6. Intellectual Property and Customer License

Unless otherwise agreed in writing with the Customer, on full payment and acceptance of the final delivered video, you grant the Customer a perpetual, worldwide, non-exclusive license to use, reproduce, distribute, and display the delivered video for the purpose described in the brief. You retain ownership of all underlying creative assets, project files, and unused cuts. You may add the delivered video to your public portfolio on the Platform only if the Customer grants portfolio consent at the time of acceptance.

## 7. Refunds, Cancellations, and Disputes

You and the Customer may mutually cancel a Promo Project at any time before delivery, in which case escrow is refunded in full to the Customer, less any non-refundable processor fees. After delivery, refunds are subject to Platform dispute resolution. The Platform may, at its discretion, refund a Customer in whole or in part if you fail to deliver, deliver work that materially does not match the brief, or otherwise breach these Program Terms. The Platform's dispute decisions are final for the purpose of fund release from escrow.

## 8. Reviews

Customers may leave a public review (rating, optional title, optional body, and per-axis communication / quality / timeliness scores) after a project is accepted. You may post a single creator reply per review. The Platform may remove reviews that violate the Acceptable Use Policy.

## 9. Takedowns

The Platform may remove a Promo Project, delivered video, portfolio item, or your enrollment in this Program if it receives a credible claim of intellectual-property infringement, a Customer complaint that is substantiated under Section 7, or a violation of the Terms of Service. You will be notified by email when this happens.

## 10. Termination

You may withdraw from the Video Promo program at any time from your creator dashboard. In-progress Promo Projects must be completed, refunded, or otherwise resolved under Section 7 before your enrollment is fully ended. The Platform may terminate your enrollment immediately for material breach of these Program Terms.

## 11. Taxes and Compliance

You are solely responsible for reporting and paying all taxes on your earnings under this Program in your jurisdiction. The Platform may collect tax-reporting information from you and issue tax forms as required by applicable law.

## 12. Changes

The Platform may publish a new version of these Program Terms at any time. Continued participation after a new version is published requires you to accept the new version through the enrollment wizard.$$,
    title = 'Video Promo Creator Program Terms',
    summary = 'Terms for the Video Promo creator program: paid promo video production, escrow, three included revisions, 7-day acceptance window, 5% platform fee.',
    updated_at = NOW()
WHERE kind = 'program_video_terms'
  AND version = 'v1'
  AND locale = 'en'
  AND body LIKE 'Placeholder %';

UPDATE legal_documents
SET body = $$# Voice Clone Creator Program Terms

These Voice Clone Creator Program Terms (these "Program Terms") govern your participation as a creator in the Voice Clone program on hired.video (the "Platform"). They supplement, and are in addition to, the Platform's general Terms of Service (including Section 9a — Voice Clone Marketplace) and Privacy Policy.

## 1. Scope

The Voice Clone program lets you train a voice model from a recorded sample of your own voice and, optionally, list it on the Platform's Voice Clone Marketplace for other users to license. Synthesis runs entirely client-side in the user's browser. The Platform stores only your reference sample and the per-user license ledger.

## 2. Voice Ownership and Consent

You may only enroll a voice that is your own natural speaking voice, or for which you hold a written, revocable license from the natural-voice owner that is at least as broad as the rights granted under these Program Terms. You may not, under any circumstances, train a voice model on a third party's voice (including any public figure, celebrity, or other identifiable individual) without their explicit, contemporaneous, written consent. By enrolling and uploading a sample, you affirm under penalty of removal and account termination that you hold all necessary rights in the sample.

## 3. Eligibility

To enroll, you must (a) hold an active paid subscription, (b) be at least 18 years old or the age of majority in your jurisdiction, (c) have completed payout onboarding if you intend to monetize listings, and (d) accept these Program Terms. The Platform reserves the right to remove any voice clone at any time at its sole discretion, including on receipt of a credible claim that the voice does not belong to the enrolling user.

## 4. Visibility, Listings, and Pricing

Every voice clone is private to you by default. You may set visibility to `unlisted` (synthesizable by anyone with the direct link) or `public` (listed on the marketplace). You set the listing price. If you publish a listing for the first time, you must check the explicit voice-marketplace consent confirmation in the Voice Clone Manager. Free listings grant a license on a single click. Paid listings are charged at checkout via the Platform's payment processor.

## 5. Platform Fee and Payouts

The Platform charges a platform fee of 5% of each paid voice license, retained from the buyer's payment. The remaining 95% is credited to your creator account, less applicable processor fees that are passed through to the buyer at checkout. Listing-side fees are snapshotted on the listing at the time of license grant so future fee changes do not retroactively affect outstanding licenses.

## 6. Buyer License Scope

When a buyer acquires a license to your voice clone, they receive a perpetual, worldwide, non-exclusive, non-sublicensable, personal-use license to synthesize speech with that voice for their own communications and creative work on or off the Platform. The buyer may not (a) re-distribute the voice model itself, (b) use the synthesized output in a manner that misrepresents the voice as belonging to the buyer or any third party, (c) train or fine-tune another model on the synthesized output, or (d) use the voice for unlawful, harassing, defamatory, or fraudulent purposes. These restrictions are stated in the buyer-side Terms of Service §9a and pass through automatically. You do not need to negotiate them.

## 7. Takedowns

You may unlist or delete your voice clone at any time. Deleting the clone removes the reference sample and revokes future synthesis but does not retroactively recall outputs already synthesized by licensees. The Platform may remove a clone or revoke a listing on credible report of impersonation, lack of consent, or violation of the Acceptable Use Policy.

## 8. Indemnification

You indemnify the Platform and its users against any claim arising from a voice clone you enrolled, listed, or made available, where the claim alleges that the voice did not belong to you, that you lacked the required consent under Section 2, or that the use breached Section 6 due to a misrepresentation you made about the voice.

## 9. Termination

You may withdraw from the Voice Clone program at any time from your creator dashboard. Withdrawing unlists every voice clone you own. Previously granted licenses are not revoked. The Platform may terminate your enrollment immediately for material breach of these Program Terms.

## 10. Taxes, Compliance, and Changes

You are responsible for tax reporting on your earnings. The Platform may publish a new version of these Program Terms at any time. Continued participation after a new version is published requires you to accept the new version through the enrollment wizard.$$,
    title = 'Voice Clone Creator Program Terms',
    summary = 'Terms for the Voice Clone creator program: only your own voice, marketplace listings, 5% platform fee, perpetual personal-use buyer license, no impersonation.',
    updated_at = NOW()
WHERE kind = 'program_voice_terms'
  AND version = 'v1'
  AND locale = 'en'
  AND body LIKE 'Placeholder %';

UPDATE legal_documents
SET body = $$# Services Creator Program Terms

These Services Creator Program Terms (these "Program Terms") govern your participation as a creator in the Services program on hired.video (the "Platform"). They supplement, and are in addition to, the Platform's general Terms of Service and Privacy Policy.

## 1. Scope

The Services program lets you offer paid professional services on the Platform — including, by way of example, career coaching, mock interviews, resume review, salary-negotiation coaching, and recruiter-side lead-generation services. Customers reach you through service inquiries. Engagements are scheduled, delivered, and reviewed on the Platform.

## 2. Eligibility

To enroll, you must (a) hold an active paid subscription, (b) be at least 18 years old or the age of majority in your jurisdiction, (c) have completed payout onboarding with the Platform's payment processor, (d) be qualified to provide the services you advertise — including holding any license, certification, or registration required by law in the customer's jurisdiction, and (e) accept these Program Terms.

## 3. Your Responsibilities

You agree to (a) provide accurate, non-misleading descriptions of every service you offer, (b) deliver each engagement at the agreed price, on the agreed schedule, and to a reasonable professional standard, (c) treat all customer information as confidential and use it only for the purpose of delivering the engagement, (d) refrain from offering legal, medical, financial, or other professional advice that you are not licensed to provide, and (e) comply with applicable employment, anti-discrimination, and consumer-protection laws.

## 4. Pricing, Platform Fee, and Payouts

You set the price of each service offering. The Platform charges a platform fee of 5% of the service price, retained from the customer's payment. Payment processor fees are passed through to the customer at checkout. Funds are released to your account on customer acceptance or auto-acceptance under the same escrow model used by the Video Promo program (see Section 4 of the Video Promo Program Terms for the mechanics), which applies equally here unless the engagement is structured as a session that is paid only after delivery, in which case the parties' written agreement controls.

## 5. No Employment Relationship

You are an independent service provider. Nothing in these Program Terms creates an employment, agency, partnership, or joint-venture relationship between you and the Platform or you and any customer. You are responsible for your own equipment, taxes, insurance, and benefits.

## 6. Disputes

Service quality disputes are resolved between you and the customer. The Platform may, at its discretion, refund the customer in whole or in part where you (a) fail to deliver, (b) deliver a service materially below the description on your offering, or (c) breach these Program Terms. The Platform's dispute decisions are final for the purpose of escrow release.

## 7. Reviews

Customers may post a public review of completed services. You may post a single creator reply per review. The Platform may remove reviews that violate the Acceptable Use Policy.

## 8. No Recruiting Conflicts

If you offer services through the Platform that touch on hiring, sourcing, or candidate placement (for example, recruiter-side lead generation), you must not (a) circumvent the Platform's sourcing-fee mechanic by routing the same engagement off-Platform, (b) misrepresent your independence from any company you also represent on the Platform, or (c) provide services that would violate your obligations to any other employer or client.

## 9. Termination

You may withdraw from the Services program at any time from your creator dashboard. Open engagements must be completed, refunded, or otherwise resolved before your enrollment is fully ended.

## 10. Taxes, Indemnification, and Changes

You are responsible for tax reporting on your earnings. You indemnify the Platform and its users against any claim arising from your delivery of services, including any claim that you lacked a required license, breached a duty of professional care, or violated applicable law. The Platform may publish a new version of these Program Terms at any time. Continued participation requires acceptance of the new version through the enrollment wizard.$$,
    title = 'Services Creator Program Terms',
    summary = 'Terms for the Services creator program: career coaching, resume review, lead-gen services. 5% platform fee, escrow, independent-contractor relationship.',
    updated_at = NOW()
WHERE kind = 'program_services_terms'
  AND version = 'v1'
  AND locale = 'en'
  AND body LIKE 'Placeholder %';

UPDATE legal_documents
SET body = $$# Articles Creator Program Terms

These Articles Creator Program Terms (these "Program Terms") govern your participation as a creator in the Articles program on hired.video (the "Platform"). They supplement, and are in addition to, the Platform's general Terms of Service and Privacy Policy.

## 1. Scope

The Articles program lets you publish long-form, user-authored articles to the Platform's community feed and search index. Articles are published from your account, attributed to you, and discoverable in the Platform's content feed. The Articles program is currently free to participate in and free for readers. No creator payouts are made under this Program at this time.

## 2. Eligibility

To enroll, you must (a) hold an active Platform account, (b) be at least 13 years old (or the minimum age permitted by Platform Terms of Service in your jurisdiction), and (c) accept these Program Terms.

## 3. Your Responsibilities

You agree to (a) only publish articles that you authored yourself, or for which you hold all rights necessary to publish under these Program Terms, (b) not publish content that infringes any third party's intellectual-property, publicity, or privacy rights, (c) not publish content that is unlawful, defamatory, harassing, hateful, sexually explicit involving minors, or otherwise prohibited by the Acceptable Use Policy, (d) clearly disclose any material commercial relationship that would be relevant to the reader (sponsored content, affiliate links, employer affiliation when discussing employer products), and (e) not use the Articles surface to publish bulk machine-generated content that has not been meaningfully reviewed and edited by you.

## 4. AI Quality Review

Each article is automatically reviewed by an AI quality classifier on publish. Articles that fail the classifier are reverted to draft and may be flagged for manual review by Platform staff. Repeated low-quality submissions may result in temporary or permanent suspension from this Program.

## 5. License You Grant the Platform

By publishing an article, you grant the Platform a worldwide, non-exclusive, royalty-free license to host, store, reproduce, modify (only to the extent necessary for technical formatting, indexing, content moderation, and presentation), distribute, and publicly display the article on and through the Platform's services, including in feed, search, recommendation, and email surfaces. You retain ownership of your articles and may unpublish or delete them at any time, subject to standard back-up retention. The Platform's license terminates a reasonable time after deletion, except as needed for archival, legal, or moderation purposes.

## 6. Reader Engagement and Future Monetization

Engagement signals (views, claps, shares) on your articles may be tracked for Platform analytics and may, in the future, feed a separate Partner Program with its own terms, eligibility, and revenue share. Enrollment in this Program does not enroll you in any future Partner Program. That will require separate, explicit opt-in.

## 7. Takedowns

The Platform may unpublish, hide, or delete an article at any time on receipt of a credible intellectual-property complaint, a violation of the Acceptable Use Policy, a determination that the content violates applicable law, or a finding by Platform staff that the article is materially low-quality, deceptive, or spam.

## 8. Termination

You may withdraw from the Articles program at any time from your creator dashboard. Withdrawal unpublishes all your articles from public surfaces. You may re-enroll later.

## 9. Indemnification

You indemnify the Platform and its users against any claim arising from an article you publish, including any claim that the article infringes a third party's rights, contains a defamatory statement, or violates applicable law.

## 10. Changes

The Platform may publish a new version of these Program Terms at any time. Continued participation requires acceptance of the new version through the enrollment wizard.$$,
    title = 'Articles Creator Program Terms',
    summary = 'Terms for publishing user-authored long-form articles to the hired.video community feed and search. Free to publish, AI quality review, license back to Platform.',
    updated_at = NOW()
WHERE kind = 'program_articles_terms'
  AND version = 'v1'
  AND locale = 'en'
  AND body LIKE 'Placeholder %';

UPDATE legal_documents
SET body = $$# Courses Creator Program Terms

These Courses Creator Program Terms (these "Program Terms") govern your participation as a creator in the Courses program on hired.video (the "Platform"). They supplement, and are in addition to, the Platform's general Terms of Service and Privacy Policy.

## 1. Scope

The Courses program lets you author and sell self-paced courses on the Platform, optionally with a Platform-issued certificate of completion for learners who pass an assessment.

## 2. Eligibility

To enroll, you must (a) hold an active paid subscription, (b) be at least 18 years old or the age of majority in your jurisdiction, (c) have completed payout onboarding with the Platform's payment processor, and (d) accept these Program Terms.

## 3. Your Responsibilities

You agree to (a) only publish course content that you authored or are otherwise licensed to publish, (b) provide accurate, non-misleading descriptions of course outcomes, prerequisites, and what is included, (c) maintain the course in good order — including fixing broken links and addressing learner-reported errata within a reasonable time — for so long as the course is offered for sale, (d) not publish course content that infringes any third party's intellectual-property, publicity, or privacy rights, that violates the Acceptable Use Policy, or that purports to provide professional advice (legal, medical, financial) you are not licensed to give, and (e) clearly disclose any sponsorship or material commercial relationship reflected in the course.

## 4. Pricing, Platform Fee, and Payouts

You set the price for each course. The Platform charges a platform fee of 5% of the course price, retained from the learner's payment. Payment processor fees are passed through to the learner at checkout. Course payments are released to your account on the schedule used for other Platform creator payouts (see your creator dashboard for the current cadence).

## 5. Learner License Scope

When a learner purchases your course, they receive a perpetual, worldwide, non-exclusive, non-sublicensable, personal-use license to access and view the course materials on the Platform for their own learning. The learner may not (a) re-distribute the course materials, (b) re-sell access, (c) use the materials to train any model, or (d) reproduce certificates of completion they did not earn.

## 6. Certificates

If the course offers a certificate of completion, you must define the assessment criteria honestly and apply them consistently. The Platform may revoke certificates that are issued in error, obtained through cheating, or that violate these Program Terms.

## 7. Refunds

Learners may request a refund within fourteen (14) days of purchase if they have completed less than 30% of the course content, or under any additional refund policy you publish on the course's listing page. The Platform may grant additional refunds at its discretion where you fail to maintain the course under Section 3 or where a course is materially misrepresented. Granted refunds are debited from your creator balance.

## 8. Reviews

Learners may post a public review of completed or substantially completed courses. You may post a single creator reply per review. The Platform may remove reviews that violate the Acceptable Use Policy.

## 9. Takedowns

The Platform may unpublish, hide, or delete a course at any time on receipt of a credible intellectual-property complaint, a determination that the course violates the Acceptable Use Policy or applicable law, or a sustained pattern of refunds or low-quality reports. Existing learners retain access to materials they have already paid for unless removal is mandated by law or by the rights holder.

## 10. Termination

You may withdraw from the Courses program at any time from your creator dashboard. Withdrawal unpublishes your courses from public surfaces. Existing learners retain access to courses they have already purchased for the access term granted under Section 5.

## 11. Indemnification, Taxes, and Changes

You indemnify the Platform and its learners against any claim arising from a course you author or sell, including any claim that the course infringes a third party's rights, contains a defamatory or unlawful statement, or that you lacked a required license to teach or to claim a credential. You are responsible for tax reporting on your earnings. The Platform may publish a new version of these Program Terms at any time. Continued participation requires acceptance of the new version through the enrollment wizard.$$,
    title = 'Courses Creator Program Terms',
    summary = 'Terms for authoring and selling self-paced courses (with optional certificates). 5% platform fee, perpetual personal learner license, 14-day / <30%-completed refund window.',
    updated_at = NOW()
WHERE kind = 'program_courses_terms'
  AND version = 'v1'
  AND locale = 'en'
  AND body LIKE 'Placeholder %';
