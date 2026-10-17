// Catalog: Studio creation tools — video from a template / the current page, and image generation.

import { Film, Image as ImageIcon } from "lucide-react";
import { runGenerateImage } from "./image";
import { TEMPLATE_ID_VALUES, runGenerateVideoFromPage, runGenerateVideoFromTemplate } from "./runners-video";
import type { ToolDefinition } from "../types";

export const studioCreateTools: ToolDefinition[] = [
  // ── Studio: generate a video from a template + user content ─────────────

  {
    id: "generate_video_from_template",
    label: "Generate video",
    description:
      "Create a new Studio video draft from a template, pre-filled with the user's content. Use whenever the user asks you to 'make a video', 'build a video resume', 'generate a personal-brand video', 'make a job ad for my Senior PM role', etc. The Apply step persists the draft and opens the Studio editor. Pick the closest template by intent: 'profile' (intro / promote yourself), 'resume' (work history pitch), 'personal_brand' (career story), 'skills_demo' (showcase specific skills), 'basic' (single-scene from scratch), 'code_walkthrough' / 'design_portfolio' / 'data_analysis' (one résumé project — pass projectName), 'job_ad' (one of the user's job postings — pass jobId), 'company_promo' (one of their companies — pass companyId), 'sizzle_reel' (their studio clips — pass clipIds), 'tool_promo' (a catalog tool — pass toolId). Without a pick, the newest owned item is used.",
    icon: Film,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/studio",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        templateId: {
          type: "string",
          enum: TEMPLATE_ID_VALUES,
          description: "Which template the new draft starts from. Map the user's intent to the closest id — don't invent values.",
        },
        name: {
          type: "string",
          description: "Optional project name shown in the user's Studio library. Omit to use the template's default name (e.g. 'Video Resume', 'Personal Brand Video').",
        },
        prompt: {
          type: "string",
          description: "Optional user-supplied description / direction (e.g. 'punchy 30s for a Senior PM role'). Captured on the draft so the wizard's regenerate step has context; not used for slot substitution.",
        },
        jobId: { type: "string", description: "job_ad: id of the user's own job posting to feature." },
        companyId: { type: "string", description: "company_promo: id of the user's company to feature." },
        projectName: {
          type: "string",
          description: "code_walkthrough / design_portfolio / data_analysis: name of the résumé project to feature (exact name from the résumé's Projects).",
        },
        clipIds: {
          type: "array",
          items: { type: "string" },
          description: "sizzle_reel: up to three of the user's studio project ids to cut together.",
        },
        toolId: { type: "string", description: "tool_promo: id of the catalog tool to promote (e.g. 'resume-roast')." },
      },
      required: ["templateId"],
      additionalProperties: false,
    },
    run: runGenerateVideoFromTemplate,
  },

  // ── Studio: turn the CURRENT PAGE into a video (SuperAdmin only) ─────────

  {
    id: "generate_video_from_page",
    label: "Video from this page",
    description:
      "Turn the marketing page the user is currently viewing into a short, social-ready Studio video. Reads the live page's headings, copy, images, and call-to-action, then drafts a hook → value points → CTA video. Use when a SuperAdmin asks to 'make a video from this page', 'turn this page into a video', or 'create a promo video for what's on screen'. Takes NO arguments — it always reads the current page automatically. The Apply step persists the draft and opens the Studio editor for review; from there the operator publishes and embeds it back on the page.",
    icon: Film,
    accentClassName: "bg-brand-primary/10 text-brand-primary",
    route: "/studio",
    inputs: [],
    mutates: true,
    requiresSuperAdmin: true,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Optional project name for the Studio library. Omit to use the AI-generated title.",
        },
      },
      additionalProperties: false,
    },
    run: runGenerateVideoFromPage,
  },

  // ── Studio: generate an image (text→img OR img→img) ─────────────────────

  {
    id: "generate_image",
    label: "Generate image",
    description:
      "Generate an image and save it to the user's media library. Use whenever the user asks you to make, draw, create, render, or design any image — headshots, logos, backgrounds, sprites, scene art, social-post graphics. Pass `prompt` (required) describing what to make. Pass `sourceImageUrl` ONLY when the user wants to REWRITE an existing image they've shared a URL for (the model rewrites it under the new prompt, keeping coarse shape). The image is auto-persisted to the user's R2 library; the returned URL is durable and shows up in the Studio MediaPicker's Library tab. Token cost: ~10K.",
    icon: ImageIcon,
    accentClassName: "bg-brand-primary/10 text-brand-primary",
    route: "/studio",
    inputs: [],
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "What to generate. Write a vivid description — subject, style, lighting, framing. Caps at 500 chars server-side. Example: 'A professional headshot, soft natural light, neutral grey backdrop, business-casual attire.'",
        },
        sourceImageUrl: {
          type: "string",
          description:
            "OPTIONAL. Public CDN URL of an existing image to rewrite under `prompt` (img→img mode). Use ONLY when the user has explicitly shared an image URL they want updated. Omit for fresh generation.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    run: runGenerateImage,
  },
];
