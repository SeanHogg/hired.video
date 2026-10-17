/**
 * Pure AI-chat helpers shared by every chat surface (the global
 * <AIChatPanel/> slide-over and embedded threads such as the Studio
 * editor's AI tab). No React state lives here — only the message shape,
 * system-prompt assembly, action → conversational prompt mapping and the
 * route contextType → AIContext factory. One implementation, so the
 * panel and the embedded thread can never drift on what the model sees.
 */
import { getPrompt } from "@shared/ai-prompts";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import { getResumeDraft } from "@/lib/tools/resume-draft-bridge";
import { getActiveForm } from "@/lib/tools/active-form-bridge";
import { JOB_CREATE_FORM_ID } from "@/lib/tools/form-ids";
import {
  createDashboardContext,
  createJobContext,
  createResumeContext,
  createProfileContext,
  createSearchContext,
  createTasksContext,
  createGeneralContext,
} from "@/lib/utils/ai-context-helpers";
import type { AIAction, AIContextType, AIContext } from "@/lib/types/ai-context";

export interface ChatThreadMessage {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  type?: "text" | "suggestion";
  /** AI tool runs surfaced as inline cards in this bubble. Each card
   *  self-gates its Apply UX based on the user's auto-apply preference. */
  toolRuns?: Array<{
    toolId: string;
    toolCallId: string;
    result: NormalizedToolRunResult;
  }>;
}

/** Resolve which resume the AI tools should run against this turn.
 *
 *  Single rule, two sources:
 *    1. URL path — `/resumes/:id`, `/resumes/edit/:id`, `/resumes/:id/edit`.
 *       Used when the user is viewing/editing a specific resume; binds the
 *       tools without making the LLM pass IDs around.
 *    2. Page context — when a non-resume page (Career 360, Profile Audit,
 *       a tool surface) opens the chat with `<ResumeContext>.resume.id`,
 *       fall through to that. Without this, tools that need resume content
 *       (resume-scorer, summarize, sentiment, …) fail with
 *       "Resume content is too short or empty".
 *    3. The résumé draft open in this tab (the studio workspace registers
 *       it on the resume-draft bridge) — its URL is `/studio/<projectId>`,
 *       which the path match above can't see. */
export function resolveActiveResumeId(
  pathname: string,
  pageContext: AIContext | undefined,
): string | undefined {
  const m =
    pathname.match(/^\/resumes\/edit\/([^/?#]+)/) ??
    pathname.match(/^\/resumes\/([^/?#]+)/);
  if (m) {
    const id = m[1];
    if (id !== "new" && id !== "create") return id;
  }
  if (pageContext && pageContext.contextType.startsWith("resume")) {
    const ctx = pageContext as Extract<AIContext, { contextType: `resume-${string}` }>;
    return ctx.resume?.id;
  }
  return getResumeDraft()?.resumeId;
}

// ============================================================================
// HELPER FUNCTIONS - System Prompt Creation
// ============================================================================

/** Render the live job-posting form snapshot for the system prompt.
 *  Empty / unset values are surfaced explicitly so the LLM knows what's
 *  missing and doesn't ask the user to repeat fields they've already
 *  filled in. */
function formatJobFormSnapshot(job: Record<string, unknown> | undefined): string {
  const fields: Array<{ key: string; label: string }> = [
    { key: "title", label: "Title" },
    { key: "company", label: "Company" },
    { key: "location", label: "Location" },
    { key: "workSetting", label: "Work setting" },
    { key: "employmentType", label: "Employment type" },
    { key: "seniority", label: "Seniority" },
    { key: "description", label: "Description" },
    { key: "responsibilities", label: "Responsibilities" },
    { key: "requirements", label: "Requirements" },
    { key: "salaryMin", label: "Salary min" },
    { key: "salaryMax", label: "Salary max" },
    { key: "currency", label: "Currency" },
  ];
  const lines: string[] = [];
  for (const { key, label } of fields) {
    const value = job?.[key];
    if (value === undefined || value === null || value === "") {
      lines.push(`- ${label}: (empty)`);
    } else if (Array.isArray(value)) {
      lines.push(`- ${label}: ${value.length === 0 ? "(empty)" : value.join(", ")}`);
    } else if (typeof value === "string" && value.length > 240) {
      lines.push(`- ${label}: ${value.slice(0, 240)}…`);
    } else {
      lines.push(`- ${label}: ${String(value)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Create an enhanced system prompt with context, action, and user awareness
 */
/** The job-draft guidance — shared by the job pages' contexts and a job
 *  posting open in the studio (#1915), so the coach writes into the posting
 *  with `apply_job_draft` wherever it is authored. */
function jobDraftInstructions(where: string, snapshot: AIContext["formSnapshot"]): string {
  return `

CURRENT CONTEXT: ${where}

The user is authoring a job posting. Its current values are below — fields shown as "(empty)" still need to be filled.

CURRENT FORM VALUES:
${formatJobFormSnapshot(snapshot)}

WHEN THE USER ASKS YOU TO DRAFT, FILL, IMPROVE, OR REWRITE THE POSTING:
1. Do NOT dump a markdown template into chat. The posting is right there — write into it.
2. Call the \`apply_job_draft\` tool with the fields you want to set. Pass only the fields you're changing; omitted fields keep their current value.
3. Use the user's existing values as anchors — if the title is "Senior AI Engineer", do not invent a different title in the description.
4. For multi-field drafts, one \`apply_job_draft\` call is enough — pass every field at once. Do not call the tool repeatedly for each field.
5. Each call stages a preview the user can Apply or Discard. Briefly tell them what's queued and offer next-step refinements (e.g. "Want me to tighten the requirements list?").`;
}

export function createEnhancedSystemPrompt(
  context: AIContext,
  action?: AIAction,
  userInfo?: { name?: string; role?: string; plan?: string },
): string {
  // Career-coach persona — shared with /api/ai/chat via the registry
  // under `shared/ai-prompts/`. The panel layers tool-use guidance on
  // top because the panel exposes the editing-tool catalog; the bare
  // /api/ai/chat surface does not.
  const basePrompt = `${getPrompt("career-coach").render(userInfo ?? {})}

TOOL USE:
You have access to a catalog of tools — analysis tools (resume scoring, sentiment, job match, skill extraction, etc.) and editing tools (apply_resume_rewrite, update_resume_summary, add_resume_skill, apply_job_draft). Prefer calling a tool over describing what it would do. For mutation tools, call them only after the user has agreed to the specific change you've proposed; the platform shows the user a preview + Apply button per tool call. **Do not paste a markdown template back to the user when an editing tool exists — call the tool.**`;

  // Add context-specific instructions
  let contextInstructions = "";

  if (context.contextType === "tasks") {
    contextInstructions = `

CURRENT CONTEXT: Task Management Page
The user is on the task management page where they can create and manage tasks.

Available APIs:
${context.availableAPIs.map((api) => `- ${api.id}: ${api.description} (${api.endpoint})`).join("\n")}

When helping with tasks:
- For "create-task": Ask for task name/title (REQUIRED), description, start date (REQUIRED), deadline, and priority
- For "prioritize-tasks": Analyze their current tasks and suggest a priority order with reasoning
- For "organize-tasks": Suggest categorization and grouping strategies
- For "break-down-task": Help break complex tasks into smaller, manageable subtasks
- For "suggest-schedule": Create a realistic schedule based on their tasks and deadlines

TASK API REQUIREMENTS:
To create a task via /api/task/save, you MUST have:
- text (string, REQUIRED): The task title/name
- start (date, REQUIRED): When the task starts
- description (string, optional): Detailed description
- end (date, optional): Deadline/due date
- progress (number 0-100, optional): Current progress
- type (string, optional): Task category/type
- priority (string, optional): Priority level (high/medium/low)

NEVER attempt to create a task without gathering the required fields first!`;
  } else if (context.contextType.startsWith("resume")) {
    contextInstructions = `

CURRENT CONTEXT: Resume ${context.contextType.includes("create") ? "Creation" : context.contextType.includes("edit") ? "Editing" : "Viewing"}
Help the user create a compelling, ATS-optimized resume. Ask about their experience, skills, and target roles before making suggestions.`;
  } else if (context.contextType.startsWith("job")) {
    const isAuthoring =
      context.contextType === "job-create" || context.contextType === "job-edit";
    if (isAuthoring) {
      contextInstructions = jobDraftInstructions(
        `Job ${context.contextType === "job-create" ? "Creation" : "Editing"}`,
        context.formSnapshot,
      );
    } else {
      contextInstructions = `

CURRENT CONTEXT: Job ${context.contextType === "job-view" ? "Viewing" : "List"}
Help the user with job-related tasks. Provide insights on job fit, application strategies, and optimization.`;
    }
  } else if (context.contextType === "dashboard") {
    contextInstructions = `

CURRENT CONTEXT: Dashboard
Provide an overview of their account status, suggest next steps, and help them navigate the platform effectively.`;
  } else if (context.contextType === "studio") {
    contextInstructions = `

CURRENT CONTEXT: Studio video editor
The user has a video open in the Studio editor. You can DRIVE the editor directly through your studio_* tools — don't tell the user to hunt for a button in the side panel.

- "screen record" / "record my screen" / "record a demo" / "record a webcam clip" → call \`studio_start_recording\` (mode: screen | webcam | screen-pip). The browser needs a click to begin capture, so this opens the armed recorder; the finished clip becomes its OWN full-bleed scene, and save & publish stitches the scenes in order (slide → recording → slide).
- "add a [text / image / video / shape / chart / CTA / …]" → call \`studio_insert_widget\`.
- Managing scenes (duplicate / delete / reorder / recolor / switch) → call \`studio_list_scenes\` FIRST to get scene ids, then the matching scene tool.
- "make an image of X and put it in" → call \`generate_image\`, then pass its returned URL to \`studio_add_image\`.
- Screenshot something on screen → \`studio_capture_screenshot\`.

Prefer calling the tool over describing the steps.`;
    // A job posting open in the studio is the job form now (#1915): the
    // coach drafts into it with apply_job_draft, exactly as on the retired
    // create page.
    if (getActiveForm(JOB_CREATE_FORM_ID)) {
      contextInstructions += jobDraftInstructions("Job posting in the Studio", context.formSnapshot);
    }
  }

  // Add action-specific instructions
  let actionInstructions = "";

  if (action) {
    const actionDescriptions: Record<string, string> = {
      "create-task": `

USER INTENT: The user wants to create a new task.

YOUR RESPONSE SHOULD:
1. Acknowledge their request warmly
2. Explain what information you need (task name and start date are required)
3. Ask them to describe the task they want to create
4. Once they provide details, ask for any missing required fields
5. Summarize the task details and ask for confirmation
6. Only after confirmation, call the create-task tool if it is available. If no task tool is exposed in this turn, tell the user the task isn't wired into this surface yet.

Example response:
"I'd be happy to help you create a new task! To get started, I need a few details:

📝 **Required:**
- Task name/title
- Start date

✨ **Optional (but helpful):**
- Description
- Deadline
- Priority level (high/medium/low)

What task would you like to create?"`,

      "prioritize-tasks": `

USER INTENT: The user wants help prioritizing their tasks.

YOUR RESPONSE SHOULD:
1. Ask about their current tasks or goals
2. Inquire about deadlines and importance
3. Provide a prioritization framework (e.g., Eisenhower Matrix)
4. Suggest a specific priority order with reasoning`,

      "break-down-task": `

USER INTENT: The user wants to break down a complex task into smaller steps.

YOUR RESPONSE SHOULD:
1. Ask them to describe the complex task
2. Help identify logical subtasks
3. Suggest a sequence or order
4. Offer to help them create these as separate tasks if they'd like`,
    };

    actionInstructions = actionDescriptions[action] || `

USER INTENT: The user wants help with: ${action.replace(/-/g, " ")}

Engage conversationally to understand their needs and provide helpful guidance.`;
  }

  // #971 — Pin durable hand-off priming (target role / seniority / style /
  // source) into the system prompt so it survives server-side history
  // compaction. Launched-from-a-tool sessions put it here instead of (or in
  // addition to) the first user message, which gets sliced off after a few
  // turns.
  const primingInstructions = context.coachPriming
    ? `

SESSION CONTEXT (persists for the whole conversation — do NOT ask the user to repeat any of this):
${context.coachPriming.trim()}`
    : "";

  return (basePrompt + contextInstructions + primingInstructions + actionInstructions).trim();
}

/** Convert a quick-action id into a natural conversation starter. */
export function getConversationalPrompt(action: AIAction): string {
  const prompts: Record<string, string> = {
    // Task actions
    "create-task": "I'd like to create a new task",
    "prioritize-tasks": "Can you help me prioritize my tasks?",
    "suggest-deadlines": "I need help setting realistic deadlines for my tasks",
    "break-down-task": "I have a complex task that I need to break down into smaller steps",
    "estimate-time": "Can you help me estimate how long my tasks will take?",
    "organize-tasks": "I need help organizing my tasks better",
    "suggest-schedule": "Can you create a schedule for my tasks?",
    "productivity-tips": "What are some productivity tips for managing my tasks?",

    // Resume actions
    "optimize-content": "I'd like to optimize my resume",
    "improve-summary": "Can you help me improve my resume summary?",
    "enhance-experience": "I want to enhance my work experience section",
    "suggest-skills": "What skills should I add to my resume?",
    "ats-score": "Can you check my resume's ATS score?",
    "keyword-suggestions": "What keywords should I include in my resume?",

    // Job actions
    "analyze-fit": "How well does this job match my profile?",
    "application-tips": "Can you give me tips for applying to this job?",
    "match-candidates": "Find candidates that match this job",
    "optimize-posting": "Help me optimize this job posting",

    // Profile actions
    "optimize-headline": "Help me create a better profile headline",
    "enhance-profile": "I want to improve my profile",

    // General actions
    "career-advice": "I need some career advice",
    "interview-prep": "Help me prepare for an interview",
    "get-help": "I need help with something",

    // Learning actions
    "recommend-courses": "Recommend courses to help me reach my learning goal",
    "create-study-plan": "Build me a study plan to learn this",
    "explain-concept": "Explain this concept in simple terms",
    "quiz-me": "Quiz me on what I'm learning to check my understanding",
    "outline-course": "Help me outline a course on this topic",
    "write-lesson": "Help me draft a lesson for this course",

    // Studio editor actions (#1910) — phrased so the studio context's
    // system prompt maps them onto the matching studio_* tool.
    "record-demo": "Record a demo of my screen",
    "add-scene": "Add a new scene to my video",
    "insert-cta": "Insert a call-to-action button into the current scene",
    "generate-scene-image": "Generate an image and add it to the current scene",
  };

  return prompts[action] || `Help me with ${action.replace(/-/g, " ")}`;
}

/**
 * Create appropriate context object for a given context type and user role
 */
export function createContextForType(contextType: AIContextType, userRole?: string) {
  switch (contextType) {
    case "dashboard":
      return createDashboardContext(undefined, undefined, userRole);

    case "resume-list":
    case "resume-create":
    case "resume-edit":
    case "resume-view":
      return createResumeContext(contextType, undefined, userRole);

    case "job-list":
    case "job-create":
    case "job-edit":
    case "job-view":
      return createJobContext(contextType, undefined, userRole);

    case "profile-view":
    case "profile-edit":
      return createProfileContext(contextType, undefined, userRole);

    case "search":
      return createSearchContext(undefined, undefined, undefined, undefined, userRole);

    case "tasks":
      return createTasksContext(undefined, userRole);

    // Studio + content surfaces — general-shaped payload, but pass the
    // resolved contextType through so the page keeps its label in the
    // system prompt + suggestions instead of flattening to "general".
    case "studio":
    case "article-view":
    case "article-edit":
    case "company-view":
    case "company-edit":
    case "course-learn":
    case "course-author":
    case "learning":
    case "interview-practice":
      return createGeneralContext(userRole, contextType);

    // outreach / messaging carry the general payload today (no bespoke
    // wiring in this panel); general is the fallback for everything else.
    case "outreach":
    case "messaging":
    case "general":
    default:
      return createGeneralContext(userRole);
  }
}
