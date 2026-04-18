// autofill.ts — AI-powered application form analysis and answer generation.
// Uses a 3-tier strategy for form detection and a 3-layer strategy for answer
// generation (direct profile mapping → answer cache → LLM).

import { z } from "zod";
import { callLLMJsonWithUsage, getApiKey, type LLMUsage } from "./ai.js";
import type {
  FormField,
  FormFieldType,
  FieldCategory,
  FieldAnswer,
} from "../../../shared/autofill.js";

// ============================================================================
// FORM FIELD ANALYSIS
// ============================================================================

/**
 * Known ATS field mappings — maps HTML name/id attributes to structured
 * FormField definitions for Tier 1 (deterministic) extraction.
 */
const GREENHOUSE_FIELDS: Record<string, Partial<FormField>> = {
  "job_application[first_name]": { label: "First Name", type: "text", category: "personal_info", required: true },
  "job_application[last_name]": { label: "Last Name", type: "text", category: "personal_info", required: true },
  "job_application[email]": { label: "Email", type: "email", category: "contact", required: true },
  "job_application[phone]": { label: "Phone", type: "tel", category: "contact", required: false },
  "job_application[location]": { label: "Location", type: "text", category: "personal_info", required: false },
  "job_application[urls][LinkedIn]": { label: "LinkedIn URL", type: "url", category: "contact", required: false },
  "job_application[urls][GitHub]": { label: "GitHub URL", type: "url", category: "contact", required: false },
  "job_application[urls][Portfolio]": { label: "Portfolio URL", type: "url", category: "contact", required: false },
  "job_application[urls][Other]": { label: "Other URL", type: "url", category: "contact", required: false },
  "job_application[cover_letter]": { label: "Cover Letter", type: "textarea", category: "motivation", required: false },
};

const LEVER_FIELDS: Record<string, Partial<FormField>> = {
  name: { label: "Full Name", type: "text", category: "personal_info", required: true },
  email: { label: "Email", type: "email", category: "contact", required: true },
  phone: { label: "Phone", type: "tel", category: "contact", required: false },
  org: { label: "Current Company", type: "text", category: "experience", required: false },
  "urls[LinkedIn]": { label: "LinkedIn URL", type: "url", category: "contact", required: false },
  "urls[GitHub]": { label: "GitHub URL", type: "url", category: "contact", required: false },
  "urls[Portfolio]": { label: "Portfolio URL", type: "url", category: "contact", required: false },
  "urls[Other]": { label: "Other URL", type: "url", category: "contact", required: false },
  comments: { label: "Additional Information", type: "textarea", category: "motivation", required: false },
};

/**
 * Regex patterns to infer field category from label text.
 * Order matters — first match wins.
 */
const LABEL_CATEGORY_PATTERNS: Array<[RegExp, FieldCategory]> = [
  [/\b(first\s*name|last\s*name|full\s*name|legal\s*name)\b/i, "personal_info"],
  [/\b(email|e-mail)\b/i, "contact"],
  [/\b(phone|mobile|cell|telephone)\b/i, "contact"],
  [/\b(linkedin|github|portfolio|website|url)\b/i, "contact"],
  [/\b(address|city|state|zip|postal|country)\b/i, "personal_info"],
  [/\b(work\s*auth|visa|sponsor|legally\s*authorized|eligible\s*to\s*work|right\s*to\s*work)\b/i, "work_authorization"],
  [/\b(salary|compensation|pay|wage)\b/i, "salary"],
  [/\b(start\s*date|available|availability|notice\s*period|earliest)\b/i, "availability"],
  [/\b(education|degree|school|university|gpa|major)\b/i, "education"],
  [/\b(experience|years?\s*of|worked|previous\s*role|current\s*(role|company|position))\b/i, "experience"],
  [/\b(cover\s*letter|why\s*(do\s*you|are\s*you|would\s*you)|tell\s*us\s*about|describe|motivation|interest)\b/i, "motivation"],
  [/\b(gender|race|ethnicity|veteran|disability|pronouns|demographic)\b/i, "diversity"],
  [/\b(programming|language|framework|technology|tool|skill|proficien)\b/i, "technical"],
];

/** Infer category from label text. */
function inferCategory(label: string): FieldCategory {
  for (const [pattern, category] of LABEL_CATEGORY_PATTERNS) {
    if (pattern.test(label)) return category;
  }
  return "custom";
}

/** Map HTML input type to our FormFieldType. */
function mapInputType(htmlType: string): FormFieldType {
  const map: Record<string, FormFieldType> = {
    text: "text", email: "email", tel: "tel", url: "url",
    textarea: "textarea", select: "select", "select-one": "select",
    "select-multiple": "select", radio: "radio", checkbox: "checkbox",
    date: "date", "datetime-local": "date", number: "number",
    file: "file", hidden: "hidden", password: "text",
  };
  return map[htmlType.toLowerCase()] ?? "text";
}

/**
 * Tier 2: Parse raw HTML to extract form fields using regex-based heuristics.
 * Works on the server side without a DOM (Cloudflare Workers have no DOM API).
 * Extracts <input>, <select>, <textarea> with their labels.
 */
function parseFormFieldsFromHtml(html: string): FormField[] {
  const fields: FormField[] = [];
  const seenNames = new Set<string>();

  // Extract all <label> elements to map for→id relationships
  const labelMap = new Map<string, string>();
  const labelForRegex = /<label[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi;
  let labelMatch: RegExpExecArray | null;
  while ((labelMatch = labelForRegex.exec(html)) !== null) {
    const forId = labelMatch[1];
    const labelText = labelMatch[2].replace(/<[^>]*>/g, "").trim();
    if (forId && labelText) labelMap.set(forId, labelText);
  }

  // Extract <input> elements
  const inputRegex = /<input\b([^>]*)>/gi;
  let inputMatch: RegExpExecArray | null;
  while ((inputMatch = inputRegex.exec(html)) !== null) {
    const attrs = inputMatch[1];
    const type = extractAttr(attrs, "type") || "text";
    if (["submit", "button", "reset", "image"].includes(type.toLowerCase())) continue;

    const name = extractAttr(attrs, "name") || "";
    const id = extractAttr(attrs, "id") || "";
    const placeholder = extractAttr(attrs, "placeholder") || "";
    const ariaLabel = extractAttr(attrs, "aria-label") || "";
    const required = /\brequired\b/i.test(attrs);

    const fieldId = name || id || `field_${fields.length}`;
    if (seenNames.has(fieldId)) continue;
    seenNames.add(fieldId);

    const label = labelMap.get(id) || ariaLabel || placeholder || humanizeFieldName(name || id);
    fields.push({
      id: fieldId,
      label,
      type: mapInputType(type),
      name: name || undefined,
      required,
      placeholder: placeholder || undefined,
      selector: id ? `#${id}` : name ? `[name="${name}"]` : `input:nth-of-type(${fields.length + 1})`,
      category: inferCategory(label),
    });
  }

  // Extract <textarea> elements
  const textareaRegex = /<textarea\b([^>]*)>/gi;
  let taMatch: RegExpExecArray | null;
  while ((taMatch = textareaRegex.exec(html)) !== null) {
    const attrs = taMatch[1];
    const name = extractAttr(attrs, "name") || "";
    const id = extractAttr(attrs, "id") || "";
    const placeholder = extractAttr(attrs, "placeholder") || "";
    const ariaLabel = extractAttr(attrs, "aria-label") || "";
    const required = /\brequired\b/i.test(attrs);

    const fieldId = name || id || `field_${fields.length}`;
    if (seenNames.has(fieldId)) continue;
    seenNames.add(fieldId);

    const label = labelMap.get(id) || ariaLabel || placeholder || humanizeFieldName(name || id);
    fields.push({
      id: fieldId,
      label,
      type: "textarea",
      name: name || undefined,
      required,
      placeholder: placeholder || undefined,
      selector: id ? `#${id}` : name ? `[name="${name}"]` : `textarea:nth-of-type(${fields.length + 1})`,
      category: inferCategory(label),
    });
  }

  // Extract <select> elements with their options
  const selectRegex = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let selMatch: RegExpExecArray | null;
  while ((selMatch = selectRegex.exec(html)) !== null) {
    const attrs = selMatch[1];
    const inner = selMatch[2];
    const name = extractAttr(attrs, "name") || "";
    const id = extractAttr(attrs, "id") || "";
    const ariaLabel = extractAttr(attrs, "aria-label") || "";
    const required = /\brequired\b/i.test(attrs);

    const fieldId = name || id || `field_${fields.length}`;
    if (seenNames.has(fieldId)) continue;
    seenNames.add(fieldId);

    // Extract options
    const optionRegex = /<option[^>]*>([\s\S]*?)<\/option>/gi;
    const options: string[] = [];
    let optMatch: RegExpExecArray | null;
    while ((optMatch = optionRegex.exec(inner)) !== null) {
      const optText = optMatch[1].replace(/<[^>]*>/g, "").trim();
      if (optText && optText !== "Select..." && optText !== "-- Select --") {
        options.push(optText);
      }
    }

    const label = labelMap.get(id) || ariaLabel || humanizeFieldName(name || id);
    fields.push({
      id: fieldId,
      label,
      type: "select",
      name: name || undefined,
      required,
      options: options.length > 0 ? options : undefined,
      selector: id ? `#${id}` : name ? `[name="${name}"]` : `select:nth-of-type(${fields.length + 1})`,
      category: inferCategory(label),
    });
  }

  return fields;
}

/** Extract an HTML attribute value from an attribute string. */
function extractAttr(attrs: string, name: string): string {
  const regex = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = regex.exec(attrs);
  return match ? match[1] : "";
}

/** Convert a field name like "first_name" or "jobApplication[phone]" to "First Name" or "Phone". */
function humanizeFieldName(name: string): string {
  // Strip bracket prefixes: "job_application[first_name]" → "first_name"
  const bracketMatch = name.match(/\[([^\]]+)\]$/);
  const raw = bracketMatch ? bracketMatch[1] : name;
  return raw
    .replace(/[_\-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Unknown Field";
}

/**
 * Tier 1: Apply ATS-specific field mappings if the URL matches a known ATS.
 * Returns mapped fields or null if the URL doesn't match any known ATS.
 */
function applyAtsSpecificMapping(html: string, atsProvider: string | null): FormField[] | null {
  if (!atsProvider) return null;

  const fieldMap =
    atsProvider === "greenhouse" ? GREENHOUSE_FIELDS :
    atsProvider === "lever" ? LEVER_FIELDS :
    null;

  if (!fieldMap) return null;

  // Check if the HTML actually contains any of the known field names
  const fields: FormField[] = [];
  for (const [name, template] of Object.entries(fieldMap)) {
    if (html.includes(name)) {
      fields.push({
        id: name,
        label: template.label || humanizeFieldName(name),
        type: template.type || "text",
        name,
        required: template.required ?? false,
        selector: `[name="${name}"]`,
        category: template.category,
      });
    }
  }

  return fields.length > 0 ? fields : null;
}

// ── LLM Schema for form analysis (Tier 3) ──────────────────────────────────

const LLMFormFieldSchema = z.object({
  fields: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.string(),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    category: z.string().optional(),
  })),
  formTitle: z.string().optional(),
});

const FORM_ANALYSIS_SYSTEM_PROMPT = `You are a form field analyzer for job application forms. Given raw HTML snippets or a list of questions from a job application form, extract structured field definitions.

For each field, determine:
1. A unique ID (use the HTML name/id attribute if available, otherwise generate "q1", "q2", etc.)
2. The human-readable label (the question or field label text)
3. The field type: text, email, tel, url, textarea, select, radio, checkbox, date, number, file
4. Whether it's required (look for asterisks, "required" attributes, or "(required)" in labels)
5. The available options (for select/radio/checkbox ONLY — list all option values)

Classify each field into a category: personal_info, contact, work_authorization, education, experience, motivation, availability, salary, diversity, technical, custom

Skip hidden fields, submit buttons, CSRF tokens, and navigation elements.

Respond with JSON only:
{
  "fields": [{ "id": "...", "label": "...", "type": "...", "required": true/false, "options": ["..."], "category": "..." }],
  "formTitle": "..."
}`;

/**
 * Analyze a form — accepts HTML, raw questions, or a URL.
 * Uses 3-tier detection: ATS-specific → regex parsing → LLM fallback.
 */
export async function analyzeForm(
  apiKey: string | undefined,
  input: { html?: string; questions?: string[]; url?: string },
): Promise<{ fields: FormField[]; atsProvider?: string; formTitle?: string; usage?: LLMUsage }> {
  const { html, questions, url } = input;

  // If URL provided and no HTML, fetch the page
  let formHtml = html;
  if (!formHtml && url) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HiredVideoBot/1.0)" },
      });
      formHtml = await res.text();
    } catch {
      // Fall through to questions-only mode
    }
  }

  // Detect ATS provider from URL
  let atsProvider: string | undefined;
  if (url) {
    const { detectAtsProvider: detect } = await import("../../../shared/autofill.js");
    atsProvider = detect(url) ?? undefined;
  }

  // If questions were pasted directly (no HTML), use LLM to classify
  if (!formHtml && questions?.length) {
    if (!apiKey) {
      // Without API key, create basic text fields from questions
      return {
        fields: questions.map((q, i) => ({
          id: `q${i}`,
          label: q,
          type: "textarea" as FormFieldType,
          required: false,
          selector: `#q${i}`,
          category: inferCategory(q),
        })),
      };
    }

    const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    const result = await callLLMJsonWithUsage(apiKey, {
      systemPrompt: FORM_ANALYSIS_SYSTEM_PROMPT,
      userMessage: `Analyze these job application questions:\n\n${questionList}`,
      temperature: 0.1,
      maxTokens: 2000,
    }, LLMFormFieldSchema);

    return {
      fields: result.data.fields.map((f) => ({
        ...f,
        type: mapInputType(f.type),
        selector: `#${f.id}`,
        category: (f.category as FieldCategory) ?? "custom",
      })),
      formTitle: result.data.formTitle,
      atsProvider,
      usage: result.usage,
    };
  }

  if (!formHtml) {
    return { fields: [], atsProvider };
  }

  // Tier 1: ATS-specific extraction
  const atsFields = applyAtsSpecificMapping(formHtml, atsProvider ?? null);
  if (atsFields && atsFields.length > 0) {
    // Also parse generically to catch custom questions that ATS mappings miss
    const genericFields = parseFormFieldsFromHtml(formHtml);
    const atsFieldNames = new Set(atsFields.map((f) => f.name));
    const extraFields = genericFields.filter((f) => f.name && !atsFieldNames.has(f.name));
    return {
      fields: [...atsFields, ...extraFields],
      atsProvider,
    };
  }

  // Tier 2: Generic HTML parsing
  const parsedFields = parseFormFieldsFromHtml(formHtml);
  if (parsedFields.length > 0) {
    return { fields: parsedFields, atsProvider };
  }

  // Tier 3: LLM fallback
  if (!apiKey) return { fields: [], atsProvider };

  const trimmedHtml = formHtml.slice(0, 8000); // Limit HTML sent to LLM
  const result = await callLLMJsonWithUsage(apiKey, {
    systemPrompt: FORM_ANALYSIS_SYSTEM_PROMPT,
    userMessage: `Analyze this job application form HTML and extract all form fields:\n\n${trimmedHtml}`,
    temperature: 0.1,
    maxTokens: 2000,
  }, LLMFormFieldSchema);

  return {
    fields: result.data.fields.map((f) => ({
      ...f,
      type: mapInputType(f.type),
      selector: `#${f.id}`,
      category: (f.category as FieldCategory) ?? "custom",
    })),
    formTitle: result.data.formTitle,
    atsProvider,
    usage: result.usage,
  };
}

// ============================================================================
// ANSWER GENERATION
// ============================================================================

/** Profile data shape from the userProfiles table. */
interface UserProfileData {
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  linkedIn?: string | null;
  github?: string | null;
  twitter?: string | null;
  website?: string | null;
  headline?: string | null;
  summary?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  yearsOfExperience?: number | null;
  skills?: string[];
  salaryExpectation?: number | null;
  salaryCurrency?: string | null;
}

/** Resume content in JSON Resume format. */
interface ResumeContent {
  basics?: {
    name?: string;
    email?: string;
    phone?: string;
    url?: string;
    summary?: string;
    location?: { city?: string; region?: string; countryCode?: string; address?: string };
  };
  work?: Array<{
    name?: string;
    position?: string;
    summary?: string;
    startDate?: string;
    endDate?: string;
    highlights?: string[];
  }>;
  education?: Array<{
    institution?: string;
    area?: string;
    studyType?: string;
    startDate?: string;
    endDate?: string;
    score?: string;
  }>;
  skills?: Array<{ name?: string; keywords?: string[]; level?: string }>;
  certificates?: Array<{ name?: string; issuer?: string; date?: string }>;
  projects?: Array<{ name?: string; description?: string; url?: string }>;
  languages?: Array<{ language?: string; fluency?: string }>;
}

/**
 * Direct-mapping patterns for common profile fields.
 * Maps field category + label patterns to profile data extractors.
 */
const PROFILE_FIELD_MATCHERS: Array<{
  match: RegExp;
  extract: (profile: UserProfileData, resume: ResumeContent | null) => string | null;
}> = [
  // Name fields
  { match: /\bfull\s*name\b/i, extract: (p) => p.name },
  { match: /\bfirst\s*name\b/i, extract: (p) => p.name?.split(" ")[0] || null },
  { match: /\blast\s*name\b/i, extract: (p) => { const parts = p.name?.split(" "); return parts && parts.length > 1 ? parts.slice(1).join(" ") : null; } },
  // Contact
  { match: /\bemail\b/i, extract: (p) => p.email },
  { match: /\b(phone|mobile|cell|telephone)\b/i, extract: (p) => p.phone || null },
  { match: /\blinkedin\b/i, extract: (p) => p.linkedIn || null },
  { match: /\bgithub\b/i, extract: (p) => p.github || null },
  { match: /\b(website|portfolio)\b/i, extract: (p) => p.website || null },
  // Location
  { match: /\b(location|city|address)\b/i, extract: (p, r) => p.location || r?.basics?.location?.city || null },
  // Experience
  { match: /\b(current\s*(company|employer|organization))\b/i, extract: (p) => p.currentCompany || null },
  { match: /\b(current\s*(role|title|position)|job\s*title)\b/i, extract: (p) => p.currentRole || null },
  { match: /\byears?\s*of\s*experience\b/i, extract: (p) => p.yearsOfExperience?.toString() || null },
  // Headline/Summary
  { match: /\bheadline\b/i, extract: (p) => p.headline || null },
];

/**
 * Try to answer a field directly from profile/resume data.
 * Returns null if the field requires AI generation.
 */
function directMapField(
  field: FormField,
  profile: UserProfileData,
  resume: ResumeContent | null,
): FieldAnswer | null {
  const labelToMatch = `${field.label} ${field.name || ""} ${field.placeholder || ""}`;

  for (const matcher of PROFILE_FIELD_MATCHERS) {
    if (matcher.match.test(labelToMatch)) {
      const value = matcher.extract(profile, resume);
      if (value) {
        return {
          fieldId: field.id,
          answer: value,
          confidence: "high",
          source: "profile",
        };
      }
    }
  }

  return null;
}

// ── LLM Schema for answer generation ────────────────────────────────────────

const LLMAnswerSchema = z.object({
  answers: z.array(z.object({
    fieldId: z.string(),
    answer: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  })),
});

const ANSWER_GENERATION_SYSTEM_PROMPT = `You are an expert job application assistant. Generate authentic, truthful answers for application form fields based on the candidate's actual experience.

RULES:
1. ONLY reference experience, skills, and qualifications that appear in the resume. Never fabricate.
2. For select/radio/checkbox fields, choose ONLY from the provided options. Match the closest option.
3. For textarea/essay questions, write concise 2-4 sentence answers tailored to the specific job.
4. For personal info (name, email, phone), use exact values from the profile.
5. For salary questions, provide a realistic number based on role seniority, location, and candidate's expectation if available.
6. If you cannot determine an answer (e.g., work authorization, visa status), set confidence to "low" and provide a reasonable default or leave blank.
7. Never include markdown formatting in answers — use plain text only.
8. For date fields, use YYYY-MM-DD format.
9. For "How did you hear about us?" type questions, use "Online Job Board" unless the user specified otherwise.
10. For diversity/demographic questions, answer "Prefer not to say" or "Decline to self-identify" if available in options.

Respond with JSON only:
{
  "answers": [
    { "fieldId": "...", "answer": "...", "confidence": "high|medium|low" }
  ]
}`;

/**
 * Generate answers for form fields using the user's profile, resume, and job context.
 *
 * Strategy:
 * 1. Direct profile mapping for simple fields (name, email, phone, LinkedIn, etc.)
 * 2. Cached answers for previously-answered questions
 * 3. LLM generation for remaining fields with full resume + JD context
 */
export async function generateAnswers(
  apiKey: string | undefined,
  fields: FormField[],
  profile: UserProfileData,
  resume: ResumeContent | null,
  jobDescription: string | undefined,
  cachedAnswers: Map<string, string> | undefined,
  customInstructions: string | undefined,
): Promise<{ answers: FieldAnswer[]; usage?: LLMUsage }> {
  const answers: FieldAnswer[] = [];
  const fieldsForLLM: FormField[] = [];

  for (const field of fields) {
    // Skip file upload and hidden fields
    if (field.type === "file" || field.type === "hidden") continue;

    // Layer 1: Direct profile mapping
    const directAnswer = directMapField(field, profile, resume);
    if (directAnswer) {
      // For select fields, verify the direct answer matches an option
      if (field.type === "select" && field.options?.length) {
        const matchesOption = field.options.some(
          (opt) => opt.toLowerCase() === directAnswer.answer.toLowerCase()
        );
        if (!matchesOption) {
          fieldsForLLM.push(field);
          continue;
        }
      }
      answers.push(directAnswer);
      continue;
    }

    // Layer 2: Cached answers
    if (cachedAnswers) {
      const normalized = normalizeQuestion(field.label);
      const cached = cachedAnswers.get(normalized);
      if (cached) {
        answers.push({
          fieldId: field.id,
          answer: cached,
          confidence: "medium",
          source: "cache",
        });
        continue;
      }
    }

    // Layer 3: Queue for LLM
    fieldsForLLM.push(field);
  }

  // Generate remaining answers via LLM
  if (fieldsForLLM.length > 0 && apiKey) {
    const profileContext = [
      `Name: ${profile.name}`,
      `Email: ${profile.email}`,
      profile.phone ? `Phone: ${profile.phone}` : null,
      profile.location ? `Location: ${profile.location}` : null,
      profile.linkedIn ? `LinkedIn: ${profile.linkedIn}` : null,
      profile.github ? `GitHub: ${profile.github}` : null,
      profile.website ? `Website: ${profile.website}` : null,
      profile.headline ? `Headline: ${profile.headline}` : null,
      profile.currentRole ? `Current Role: ${profile.currentRole}` : null,
      profile.currentCompany ? `Current Company: ${profile.currentCompany}` : null,
      profile.yearsOfExperience ? `Years of Experience: ${profile.yearsOfExperience}` : null,
      profile.skills?.length ? `Skills: ${profile.skills.join(", ")}` : null,
      profile.salaryExpectation ? `Salary Expectation: ${profile.salaryCurrency || "USD"} ${profile.salaryExpectation}` : null,
    ].filter(Boolean).join("\n");

    const resumeContext = resume ? JSON.stringify(resume, null, 1).slice(0, 3000) : "No resume data available.";

    const fieldDescriptions = fieldsForLLM.map((f) => {
      let desc = `- ID: "${f.id}", Label: "${f.label}", Type: ${f.type}, Required: ${f.required}`;
      if (f.options?.length) desc += `, Options: [${f.options.map((o) => `"${o}"`).join(", ")}]`;
      return desc;
    }).join("\n");

    const userMessage = `CANDIDATE PROFILE:
${profileContext}

CANDIDATE RESUME (JSON Resume format):
${resumeContext}

${jobDescription ? `JOB DESCRIPTION:\n${jobDescription.slice(0, 2000)}\n` : ""}
FIELDS TO ANSWER:
${fieldDescriptions}

${customInstructions ? `CUSTOM INSTRUCTIONS: ${customInstructions}` : ""}`;

    try {
      const result = await callLLMJsonWithUsage(apiKey, {
        systemPrompt: ANSWER_GENERATION_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.5,
        maxTokens: 3000,
      }, LLMAnswerSchema);

      for (const llmAnswer of result.data.answers) {
        answers.push({
          fieldId: llmAnswer.fieldId,
          answer: llmAnswer.answer,
          confidence: llmAnswer.confidence,
          source: "ai",
        });
      }

      return { answers, usage: result.usage };
    } catch (err) {
      console.warn("[autofill] LLM answer generation failed:", err);
      // Return what we have from direct mapping + cache
    }
  }

  return { answers };
}

// ============================================================================
// ANSWER CACHING UTILITIES
// ============================================================================

/**
 * Normalize a question string for cache lookup.
 * Lowercases, strips punctuation, collapses whitespace.
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute SHA-256 hash of a normalized question for cache key.
 * Uses Web Crypto API (available in Cloudflare Workers).
 */
export async function hashQuestion(text: string): Promise<string> {
  const normalized = normalizeQuestion(text);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
