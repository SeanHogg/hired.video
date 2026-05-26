-- 0138_seed_missing_must_have_lessons.sql
--
-- Fills gap #1517 in the README Consolidated Gap Register: the
-- AI-Era Must-Have Skills course shipped on 2026-05-25 with 5
-- modules but only 3 lessons. Modules 4 (Data Literacy) and 5
-- (Human-in-the-Loop Judgment) had no lesson rows, so the
-- curriculum rail in CourseLearner.tsx renders empty headers and
-- the "X of N lessons complete" tally was wrong.
--
-- Follows the same shape as the 2026-05-25 seed
-- (0131_seed_platform_learning_library.sql): md5-cast UUIDs for
-- stable / deterministic IDs, source_type='text_md' until the
-- real SCORM zip path (#1400) and Studio-video pairing (#1520)
-- land. ON CONFLICT DO NOTHING so re-applying is safe.

INSERT INTO "course_lessons" (
  "id", "course_id", "module_id", "title", "summary",
  "source_type", "body_md", "estimated_minutes", "is_required", "sort_order",
  "created_at", "updated_at"
) VALUES
  ((md5('seed-lesson:must:l4'))::uuid,
   (md5('seed-course:ai-era-must-have-skills'))::uuid,
   (md5('seed-module:must:data-literacy'))::uuid,
   'Reading Charts and Distributions',
   'Numbers without context lie. Distributions tell the truth.',
   'text_md',
   E'# Reading Charts and Distributions\n\nAI tools now generate charts on demand. The bottleneck has shifted from *making* the chart to *reading* it correctly. Most workplace mistakes around data come from three habits that AI cannot fix for you.\n\n**1. Confusing the average with the experience**\n\n"Our customers wait 4 minutes on average for support" can mean every customer waits 4 minutes, or that half wait 30 seconds and half wait 8 minutes. The average is the same; the customer experience is not. Always ask for the **distribution** — the spread — not just the mean. p50 (median), p90, and p99 tell you what the typical, frustrated, and furious customer feels.\n\n**2. Mistaking correlation for causation**\n\nA dashboard that shows "ice cream sales correlate with drownings" is technically correct and operationally useless. Both are caused by summer. Before you act on a correlation, ask: **what third variable could be driving both?** AI is *worse* than humans at this — it pattern-matches eagerly and rarely volunteers the lurking variable on its own.\n\n**3. Ignoring base rates**\n\n"Our AI screening tool catches 95% of bad candidates" sounds great until you realize 1% of applicants were actually bad and the tool also flags 10% of good ones. Out of 1,000 applicants: 9.5 of 10 bad candidates caught (great), but 99 of 990 good candidates also flagged (terrible). The base rate — how rare the thing you are detecting actually is — determines whether a "95% accurate" tool is useful or actively harmful.\n\n**Practice this week:**\n\nFor every chart or AI-generated statistic you see at work, write down:\n- What is the unit? (average, median, count, rate)\n- What is the spread? (min, max, p90)\n- What is the base rate? (how often does this happen at all)\n\nMake AI run the numbers. Make yourself ask whether the numbers mean what they appear to mean.',
   14, true, 3, NOW(), NOW()),

  ((md5('seed-lesson:must:l5'))::uuid,
   (md5('seed-course:ai-era-must-have-skills'))::uuid,
   (md5('seed-module:must:hitl-judgment'))::uuid,
   'When to Trust, When to Override',
   'The skill that compounds: knowing which decisions to hand off and which to hold.',
   'text_md',
   E'# When to Trust, When to Override\n\nHuman-in-the-loop is the entire job for most knowledge workers now. AI proposes; you dispose. The skill is knowing **which loops** are worth keeping a human in, and which ones are dead weight.\n\n**The four-quadrant test**\n\nFor any AI-assisted decision, plot it on two axes:\n\n- **Reversibility:** can this be undone cheaply if wrong? (Sending an email — easy to correct. Firing someone — not.)\n- **Specificity:** does this affect one person/case, or a policy/group? (Drafting a single reply vs writing the canned reply that goes to thousands.)\n\nThe four quadrants:\n\n| | **Low specificity** (one case) | **High specificity** (policy) |\n|---|---|---|\n| **High reversibility** (cheap to undo) | **Let AI ship.** Drafting a meeting agenda, summarising a thread. | **Light review.** Auto-categorising tickets — sample, do not approve each. |\n| **Low reversibility** (hard to undo) | **You decide, AI advises.** Rejecting a candidate, replying to a complaint. | **Heavy human ownership.** Setting an interview rubric, writing a refund policy. |\n\n**The override trap**\n\nThe failure mode is not *over-trusting* AI. It is **under-engaging** with the cases you should override. The AI says "reject this candidate" and you click reject because reading the rationale costs 90 seconds and you have 200 to get through. Three months later you cannot explain why a qualified person was rejected and your hiring system has quietly inherited every bias the model was trained on.\n\nRule of thumb: **if you cannot articulate the reason yourself in one sentence, you have not made the decision — the model has.** That is fine for low-stakes ticket categorisation. It is not fine for a hiring screen.\n\n**Practice for the next week:**\n\nOn every AI-recommended action you take, ask: *"Would I make the same call if the AI had not pre-decided?"* Write down the cases where the answer is no. Those are the loops worth slowing down.\n\nThe people who keep their seat at the table for the next decade are the ones who can defend their judgement when AI disagrees — not the ones who just agree faster.',
   16, true, 4, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
