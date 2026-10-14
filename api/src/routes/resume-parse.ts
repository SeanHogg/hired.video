/**
 * POST /api/resumes/parse — résumé file or text → JSON Resume content.
 *
 * Two response shapes over one pipeline:
 *   - `Accept: text/event-stream` → SSE progress (stages, per-page OCR,
 *     previews, heartbeat) ending in a `result` or `error` event. The web
 *     client uses this, so a slow parse can never hit a fixed deadline.
 *   - otherwise → the classic `{ success, data: { result } }` JSON envelope
 *     (Chrome extension, older clients).
 *
 * Also the composition root for the parse ports (gateway text caller,
 * skill extractor, vision OCR) that the other résumé routes reuse through
 * `parseResumeTextWithAI` / `ocrResumeImage`.
 */
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import {
  RESUME_PARSE_HEARTBEAT_MS,
  encodeResumeParseEvent,
  type ResumeParseEvent,
} from "../../../shared/resume-parse-stream.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { createAiTextCaller } from "../services/adapters/ai-text-caller.js";
import { runResumeParse, type ResumeParsePorts } from "../services/resume/parsePipeline.js";
import { extractSkills } from "../services/resume/skills.js";
import {
  RESUME_BINARY_TEXT_MESSAGE,
  classifyResumeText,
  extractUploadedResumeFiles,
  isResumeImageFile,
} from "../services/resume/uploadIntake.js";
import { normalizeJsonResume } from "../services/resume/parse.js";
import { ocrBillingOpts } from "../services/resume/ocrBilling.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { tokenBudgetFor } from "../services/adapters/ai-stream-response.js";
import { isAbortError } from "../utils/abort.js";
import { eventStreamResponse } from "../utils/event-stream.js";
import { fail, ok } from "../utils/response.js";

type Ctx = Context<AppEnv>;

/** What the client sent, read before any response starts. */
type ParseInput =
  | { kind: "files"; files: File[] }
  | { kind: "text"; text: string }
  | { kind: "structured"; content: Record<string, unknown> };

type ParseOutcome = { content: Record<string, unknown> } | { message: string };

const NOTHING_TO_READ =
  "Could not extract text from the uploaded file. Try a text-based PDF, DOCX, or paste the text directly.";

export async function resumeParseHandler(c: Ctx): Promise<Response> {
  // Closes gap-register #765 — Free-tier 5 PDF parses / month.
  const blocked = await servicesProcessor.enforce(c, "resume_parse");
  if (blocked) return blocked;

  const input = await readParseInput(c);
  if (!input) return c.json(fail("PARSE_FAILED", NOTHING_TO_READ), 422);

  if (!(c.req.header("Accept") ?? "").includes("text/event-stream")) {
    const outcome = await executeResumeParse(c, input);
    if ("message" in outcome) return c.json(fail("PARSE_FAILED", outcome.message), 422);
    return c.json(ok({ result: JSON.stringify(outcome.content) }), 200);
  }

  return eventStreamResponse<ResumeParseEvent>(
    async (emit) => {
      try {
        const outcome = await executeResumeParse(c, input, emit);
        if ("message" in outcome) {
          emit({ type: "error", code: "PARSE_FAILED", message: outcome.message });
          return;
        }
        emit({ type: "result", content: outcome.content, tokenBudget: await tokenBudgetFor(c) });
      } catch (err) {
        // Client gone — drop the stream quietly. Do not emit PARSE_FAILED
        // (nothing is listening) and do not treat abort as a parse error.
        if (isAbortError(err) || c.req.raw.signal.aborted) return;
        console.error("[parse] stream failed:", err instanceof Error ? err.message : err);
        emit({ type: "error", code: "PARSE_FAILED", message: NOTHING_TO_READ });
      }
    },
    { encode: encodeResumeParseEvent, heartbeat: { type: "ping" }, heartbeatMs: RESUME_PARSE_HEARTBEAT_MS },
  );
}

/** Multipart file(s), a JSON Resume envelope, or raw text. Null when there is nothing to parse. */
async function readParseInput(c: Ctx): Promise<ParseInput | null> {
  if ((c.req.header("Content-Type") ?? "").includes("multipart/form-data")) {
    // `getAll("file")` — a scanned PDF has no text layer, so the browser
    // rasterises its pages and uploads them as an image sequence; the shared
    // intake joins those transcripts back into one document.
    const form = await c.req.formData().catch(() => null);
    const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
    return files.length > 0 ? { kind: "files", files } : null;
  }
  const body = (await c.req.json().catch(() => ({}))) as { parsedContent?: unknown; content?: unknown; text?: unknown };
  // An already-parsed JSON Resume (e.g. Chrome extension paste of exported JSON).
  if (body?.parsedContent && typeof body.parsedContent === "object") {
    return { kind: "structured", content: normalizeJsonResume(body.parsedContent) };
  }
  const text = typeof body?.content === "string" ? body.content : typeof body?.text === "string" ? body.text : "";
  return text ? { kind: "text", text } : null;
}

async function executeResumeParse(
  c: Ctx,
  input: ParseInput,
  onEvent?: (event: ResumeParseEvent) => void,
): Promise<ParseOutcome> {
  if (input.kind === "structured") return succeed(c, input.content);

  let text = input.kind === "text" ? input.text : "";
  if (input.kind === "files") {
    const stage = input.files.some(isResumeImageFile) ? "ocr" : "read";
    onEvent?.({ type: "stage", stage, page: 0, pages: input.files.length });
    const intake = await extractUploadedResumeFiles(input.files, {
      ocrImage: (image) => ocrResumeImage(c, image),
      onFileRead: (page, pages) => onEvent?.({ type: "stage", stage, page, pages }),
    });
    if (intake.kind === "error") return { message: intake.message };
    if (intake.kind === "structured") return succeed(c, intake.content);
    text = intake.text;
  } else {
    onEvent?.({ type: "stage", stage: "read" });
  }

  // Shared binary guard + cleanup + JSON Resume short-circuit.
  const source = classifyResumeText(text);
  if (source.kind === "binary") return { message: RESUME_BINARY_TEXT_MESSAGE };
  if (source.kind === "structured") return succeed(c, source.content);

  return succeed(c, await runResumeParse(source.text, buildResumeParsePorts(c), { onEvent }));
}

function succeed(c: Ctx, content: Record<string, unknown>): ParseOutcome {
  servicesProcessor.meterEvent(c, "resume_parse");
  return { content };
}

/**
 * Model ports for one request: gateway first with a Workers AI fallback for
 * text (the shared caller, also used by /revise), and the gateway-only
 * skill extractor.
 */
export function buildResumeParsePorts(c: Ctx): ResumeParsePorts {
  const llm = hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null;
  // Fires when the client disconnects (wrangler.toml `enable_request_signal`),
  // so a closed tab stops spending tokens on the remaining parse calls.
  const signal = c.req.raw.signal;
  return {
    callAI: createAiTextCaller(c.env, c.var.user, { label: "resume_parse_ai", useCase: "resume_optimize", signal }),
    extractSkills: llm
      ? async (content) => {
          signal.throwIfAborted();
          return (await extractSkills(llm, { kind: "resume-json", content })).skills;
        }
      : null,
  };
}

/** Résumé text → JSON Resume content, without progress reporting. */
export function parseResumeTextWithAI(c: Ctx, resumeText: string): Promise<Record<string, unknown>> {
  return runResumeParse(resumeText, buildResumeParsePorts(c));
}

/** Base64-encode bytes in fixed chunks. `btoa(String.fromCharCode(...bytes))`
 *  blows the call-stack on multi-MB phone photos, so build the binary string
 *  in 32KB slices first. Worker runtime provides `btoa`. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Vision OCR for resume images (phone photos / scans). Sends the image to a
 * vision-capable model (see the `resume_ocr` profile) and returns the
 * transcribed plain text, which then flows through the SAME parse pipeline
 * as PDFs/DOCX — so dates, skills, and section grouping all reuse the
 * existing extraction + regex-fallback logic.
 *
 * Throws when no LLM provider is configured; the caller turns a thrown error
 * or an empty transcription into a clear 422 rather than storing junk.
 */
export async function ocrResumeImage(c: Ctx, file: File): Promise<string> {
  if (!hasAnyLLMProviderKey(c.env)) {
    throw new Error("No AI provider available for image OCR");
  }
  const llm = createLLMClient(c.env, c.var.user);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime =
    typeof file.type === "string" && file.type.startsWith("image/")
      ? file.type
      : "image/jpeg";
  const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;

  const signal = c.req.raw.signal;
  signal.throwIfAborted();
  const { content } = await llm.callMessages("resume_image_ocr", {
    useCase: "resume_ocr",
    responseFormat: "text",
    messages: [
      {
        role: "system",
        content:
          "You are a precise OCR engine for resumes. Transcribe ALL text from " +
          "the image verbatim. Preserve section headers, job titles, company " +
          "names, dates, and bullet points, each on its own line. Do not " +
          "summarise, reorder, infer, or add commentary — output only the " +
          "transcribed text exactly as it appears.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe every word of this resume image to plain text, " +
              "keeping the original line/section structure.",
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
  }, { signal, ...ocrBillingOpts(c.var.user?.sub, c.env.HOUSE_USER_ID) });
  return (content ?? "").trim();
}
