// Catalog: mutation tools (AI coach edits to the active résumé and the open job draft).

import { Briefcase, CalendarClock, Layers, Pencil, Plus, Scissors, Wand2 } from "lucide-react";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";
import { JOB_CREATE_FORM_ID, runApplyJobDraft } from "./job-draft";
import {
  runAddResumeSkill,
  runApplyResumeRewrite,
  runConsolidateSectionHighlights,
  runShortenBullet,
  runStandardizeResumeDates,
  runUpdateResumeSummary,
} from "./runners-resume-edits";
import type { ToolDefinition } from "../types";

export const resumeEditTools: ToolDefinition[] = [
  // ── Mutation tools (AI coach edits) ──────────────────────────────────────
  // These all target the user's *active* resume. The chat panel binds
  // `resumeId` into ToolRunContext from the route — the LLM does not pass it.

  {
    id: "apply_resume_rewrite",
    label: "Apply rewrite",
    description: "Replace ONE specific bullet, work summary, or basics summary on the active resume with an improved version. `original` must quote (verbatim or near-verbatim) text that already appears on the resume — the matcher will find the right slot. Use this after the user agrees to a specific rewrite you've proposed.",
    icon: Wand2,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        original: {
          type: "string",
          description: "The bullet/summary text as it currently appears on the resume. Quote verbatim if possible.",
        },
        improved: {
          type: "string",
          description: "The replacement text. One bullet/summary at a time — do not concatenate multiple bullets.",
        },
      },
      required: ["original", "improved"],
      additionalProperties: false,
    },
    run: runApplyResumeRewrite,
  },
  {
    id: "update_resume_summary",
    label: "Update resume summary",
    description: "Replace the resume's `basics.summary` (the headline paragraph at the top) with a new version. Use after the user approves the new summary text.",
    icon: Pencil,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/tools/summarize-resume",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "The new summary paragraph. Plain prose, no bullet glyphs.",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
    run: runUpdateResumeSummary,
  },
  {
    id: "add_resume_skill",
    label: "Add skill",
    description: "Append a skill to the active resume's skills list. Idempotent — duplicate skills (case-insensitive name match) are skipped. Use one call per skill.",
    icon: Plus,
    accentClassName: "bg-brand-primary/10 text-brand-primary",
    route: "/tools/skill-extractor",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name (e.g. \"TypeScript\", \"Stakeholder management\")." },
        level: {
          type: "string",
          enum: ["", "Beginner", "Intermediate", "Advanced", "Expert"],
          description: "Optional proficiency. Leave empty if the user hasn't told you.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    run: runAddResumeSkill,
  },
  {
    id: "consolidate_section_highlights",
    label: "Consolidate bullets",
    description: "Collapse near-duplicate / overlapping bullets in ONE resume section (a Work, Volunteer, or Project entry) into a tighter action-verb-led list. The matcher locates the section by content — pass any one bullet that already appears under that entry as `matchHighlight`. Use this when the user (or the optimizer) flags duplicate or overlapping highlights.",
    icon: Layers,
    accentClassName: "bg-blue-100 text-blue-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        matchHighlight: {
          type: "string",
          description: "Verbatim or near-verbatim text of any one bullet that appears under the section to consolidate. The matcher walks the resume to find which Work / Volunteer / Project entry contains it, then operates on that entry's full highlights list.",
        },
      },
      required: ["matchHighlight"],
      additionalProperties: false,
    },
    run: runConsolidateSectionHighlights,
  },
  {
    id: "standardize_resume_dates",
    label: "Standardize dates",
    description: "Walk every Work / Volunteer / Project / Education entry on the active resume and normalize its dates to YYYY-MM (preserving day precision when given). Open-ended end dates collapse to 'Present'. Use when the user (or the optimizer) flags inconsistent date formatting that an ATS could mis-parse.",
    icon: CalendarClock,
    accentClassName: "bg-teal-100 text-teal-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run: runStandardizeResumeDates,
  },
  {
    id: "apply_job_draft",
    label: "Apply to job draft",
    description:
      "Write one or more fields into the job posting open in the Studio. Use this whenever the user asks you to draft, fill in, rewrite, or improve a job posting — instead of dumping a markdown template into chat. Pass only the fields you want to set; omitted fields keep their current value. Each call stages a preview that the user can Apply or Discard.",
    icon: Briefcase,
    accentClassName: "bg-brand-primary/10 text-brand-primary",
    // Job posts are authored in the studio (#1915) — a new one starts there.
    route: studioNewEntityHref("job"),
    inputs: ["job"],
    mutates: true,
    // Only while a job posting is open for a viewer who may post jobs.
    requiresActiveForm: JOB_CREATE_FORM_ID,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Job title (e.g. 'Senior AI Engineer')." },
        description: {
          type: "string",
          description: "Full job description, plain text or markdown. Replaces the existing description verbatim — write it the way it should appear on the posting.",
        },
        company: { type: "string", description: "Hiring company name." },
        location: { type: "string", description: "Primary location (city, state/country). Use 'Remote' if remote-only." },
        responsibilities: {
          type: "string",
          description: "One responsibility per line, no bullet glyphs. Will be split into a list on save.",
        },
        requirements: {
          type: "string",
          description: "One requirement per line, no bullet glyphs. Will be split into a list on save.",
        },
        employmentType: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "FullTime",
              "PartTime",
              "Freelance",
              "Contractor",
              "ContractToHire",
              "Temporary",
              "Internship",
              // Exec opportunity types (#1674) — the job document keeps them (#1915).
              "Fractional",
              "Advisor",
              "Interim",
              "BoardSeat",
            ],
          },
          description: "One or more employment types — most postings are ['FullTime'].",
        },
        seniority: {
          type: "array",
          items: {
            type: "string",
            enum: ["Entry", "Junior", "Mid", "Senior", "LeadExecutive", "None"],
          },
          description: "One or more seniority levels accepted for this role.",
        },
        workSetting: {
          type: "string",
          enum: ["Onsite", "Remote", "Hybrid"],
          description: "Where the work happens day-to-day.",
        },
        salaryMin: { type: "number", description: "Minimum annual salary in the posting's currency." },
        salaryMax: { type: "number", description: "Maximum annual salary in the posting's currency." },
        currency: { type: "string", description: "Currency code (e.g. 'USD', 'EUR'). Default 'USD'." },
      },
      additionalProperties: false,
    },
    run: runApplyJobDraft,
  },
  {
    id: "shorten_bullet",
    label: "Shorten bullet",
    description: "Tighten ONE verbose resume bullet to fit within a character cap, keeping every metric and proper noun verbatim. Pass the original bullet as `original`; the result is staged through the same Apply pipeline as apply_resume_rewrite. Use when the user flags a bullet that runs >2 lines or the optimizer recommends shortening.",
    icon: Scissors,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        original: {
          type: "string",
          description: "The bullet text as it currently appears on the resume. Quote verbatim — the matcher uses this to locate the slot.",
        },
        maxChars: {
          type: "number",
          description: "Optional character cap (40-500). Defaults to 180 if omitted.",
        },
      },
      required: ["original"],
      additionalProperties: false,
    },
    run: runShortenBullet,
  },
];
