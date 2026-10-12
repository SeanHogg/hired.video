/**
 * classifyMessageIntent — questions in the /build chat are recognised in
 * code so they can never be applied as edits. Messages are the shapes real
 * visitors type (including the prod one that wiped a summary).
 *
 * Run: node --import tsx --test src/services/resume/__tests__/message-intent.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyMessageIntent } from "../message-intent.js";

describe("classifyMessageIntent — questions", () => {
  for (const q of [
    'how did you determine that this user "has a career break"?',
    "why skills-first",
    "What does hybrid mean?",
    "is my summary too long?",
    "Explain the template choice",
    "tell me what you read",
    "can you explain why you picked functional?",
    "did you read all my jobs?",
  ]) {
    it(`"${q}" → question`, () => assert.equal(classifyMessageIntent(q), "question"));
  }
});

describe("classifyMessageIntent — possible change requests stay open", () => {
  for (const m of [
    "Make the summary punchier",
    "can you make it fit on one page?",
    "please tailor it for product roles",
    "what if you shortened the bullets",
    "how about cutting the oldest role",
    "should I remove the summary?",
    "one page",
    "",
  ]) {
    it(`"${m}" → open`, () => assert.equal(classifyMessageIntent(m), "open"));
  }
});
