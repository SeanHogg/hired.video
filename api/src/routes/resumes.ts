import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLM, getApiKey } from "../services/ai.js";

const { resumeInformation: resumes, watchedResumes } = schema;

export const resumeRoutes = new Hono<{ Variables: Variables }>();

const CreateResumeSchema = z.object({
  title: z.string().min(1),
  content: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  isMaster: z.boolean().optional().default(false),
  privacy: z.string().optional(),
  rawText: z.string().optional(),
});

const UpdateResumeSchema = CreateResumeSchema.partial();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map privacy string → stored integer
const PRIVACY_TO_LEVEL: Record<string, number> = {
  public: 0,
  recruiter_only: 1,
  connections: 2,
  private: 10,
  draft: 10,
};

function rowToLegacyResume(row: typeof resumes.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.title,
    slug: row.slug ?? row.id,
    description: "",
    isPrimaryDefault: false,
    isWatched: false,
    sentimentScore: 0,
    privacy_ShowResume: row.privacyLevel,
    resumeSerialized: JSON.stringify(row.content ?? {}),
    isMaster: row.isMaster,
    isActive: row.isActive,
    parentId: row.parentId ?? null,
    creationDateTime: new Date(row.createdAt).toISOString(),
    updateDateTime: new Date(row.updatedAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    views: 0,
    metaResume: (() => {
      const c = (row.content ?? {}) as Record<string, unknown>;
      const basics = (c.basics ?? {}) as Record<string, unknown>;
      const loc = basics.location as Record<string, unknown> | null | undefined;
      return {
        basics: {
          name: basics.name ?? row.title ?? "",
          label: basics.label ?? "",
          image: basics.image ?? "",
          email: basics.email ?? "",
          phone: basics.phone ?? "",
          url: basics.url ?? "",
          summary: basics.summary ?? "",
          location: loc ? {
            address: loc.address ?? "",
            postalCode: loc.postalCode ?? "",
            city: loc.city ?? "",
            countryCode: loc.countryCode ?? "",
            region: loc.region ?? "",
          } : null,
        },
        work: Array.isArray(c.work) ? c.work : [],
        education: Array.isArray(c.education) ? c.education : [],
        volunteer: Array.isArray(c.volunteer) ? c.volunteer : [],
        awards: Array.isArray(c.awards) ? c.awards : [],
        certificates: Array.isArray(c.certificates) ? c.certificates : [],
        publications: Array.isArray(c.publications) ? c.publications : [],
        skills: Array.isArray(c.skills) ? c.skills : [],
        languages: Array.isArray(c.languages) ? c.languages : [],
        interests: Array.isArray(c.interests) ? c.interests : [],
        references: Array.isArray(c.references) ? c.references : [],
        projects: Array.isArray(c.projects) ? c.projects : [],
      };
    })(),
  };
}

function rowToSummary(row: typeof resumes.$inferSelect) {
  return {
    Id: row.id,
    TemplateName: "Default",
    IsPublic: true,
    IsOwner: true,
    CreationDateTimeFormatted: new Date(row.createdAt).toISOString(),
    SentimentScore: 0,
    UserId: row.userId,
    Name: row.title,
    Slug: row.id,
    Description: "",
    IsPrimaryDefault: false,
    IsWatched: false,
    Latitude: null,
    Longitude: null,
    Location: "",
  };
}

async function parseBodyToContent(c: any): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return { raw: body };
    }
  }

  if (body && typeof body === "object") {
    if (typeof (body as any).content === "string") {
      try {
        return JSON.parse((body as any).content) as Record<string, unknown>;
      } catch {
        return { raw: (body as any).content };
      }
    }
    return body as Record<string, unknown>;
  }

  return {};
}

/**
 * Extract human-readable text from a PDF by decompressing FlateDecode streams
 * and parsing BT...ET text blocks. Works with Google Docs, Word-exported, and
 * most standard PDFs. Uses the Web Streams DecompressionStream API available
 * in Cloudflare Workers.
 */
async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  // Decode as latin1 so byte values map 1:1 to char codes
  const pdfStr = new TextDecoder("latin1").decode(pdfBytes);
  const texts: string[] = [];

  // Find every stream...endstream block
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;

  while ((m = streamRe.exec(pdfStr)) !== null) {
    const before = pdfStr.slice(Math.max(0, m.index - 300), m.index);
    const isFlateDecode = /\/FlateDecode/.test(before);
    let content = m[1];

    if (isFlateDecode) {
      try {
        // Convert latin1 string back to raw bytes
        const streamBytes = new Uint8Array(content.length);
        for (let i = 0; i < content.length; i++) streamBytes[i] = content.charCodeAt(i) & 0xff;

        // Decompress using zlib (PDF FlateDecode = zlib format with 2-byte header)
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(streamBytes);
        writer.close();

        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        content = new TextDecoder("latin1").decode(out);
      } catch {
        continue; // skip streams that fail to decompress
      }
    }

    // Extract text from BT...ET blocks
    const btRe = /BT([\s\S]*?)ET/g;
    let bt: RegExpExecArray | null;
    while ((bt = btRe.exec(content)) !== null) {
      // Match (string) Tj/TJ and [(string)] TJ operators
      const ops = bt[1].match(/\((?:[^\\)]|\\.)*\)\s*Tj|\[(?:[^\]])*\]\s*TJ/g) ?? [];
      for (const op of ops) {
        const parens = op.match(/\((?:[^\\)]|\\.)*\)/g) ?? [];
        for (const p of parens) {
          const text = p.slice(1, -1)
            .replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, " ")
            .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
          if (text.trim()) texts.push(text.trim());
        }
      }
    }
  }

  return texts.join(" ").replace(/\s{2,}/g, " ").trim();
}

const RESUME_PARSE_PROMPT = `You are a resume parser. Extract structured information from the resume text and return ONLY valid JSON matching this exact structure:
{
  "basics": { "name": "", "label": "", "email": "", "phone": "", "url": "", "summary": "", "location": { "address": "", "city": "", "region": "", "postalCode": "", "countryCode": "" } },
  "work": [{ "name": "", "position": "", "startDate": "", "endDate": "", "summary": "", "highlights": [], "url": "" }],
  "education": [{ "institution": "", "area": "", "studyType": "", "startDate": "", "endDate": "", "score": "", "courses": [] }],
  "skills": [{ "name": "", "level": "", "keywords": [] }],
  "volunteer": [], "awards": [], "certificates": [], "publications": [],
  "languages": [], "interests": [], "references": [], "projects": []
}
Use empty string for missing text fields and empty arrays for missing array fields. Return only the JSON object, no markdown.`;

/** Strip markdown fences and extract the first JSON object from an LLM response. */
function extractJson(raw: string): Record<string, unknown> {
  // Strip ```json ... ``` or ``` ... ``` fences
  let cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // Find the first { and last } to handle surrounding text / truncation
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error("No valid JSON found in LLM response");
}

async function parseResumeTextWithAI(c: any, resumeText: string): Promise<Record<string, unknown>> {
  // Primary: Cloudflare Workers AI
  const cfAi = (c.env as any)?.AI ?? (globalThis as any).__ENV?.AI;
  if (cfAi) {
    try {
      const aiResponse = await (cfAi as any).run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: RESUME_PARSE_PROMPT },
          { role: "user", content: resumeText.slice(0, 6000) },
        ],
      });
      const result = typeof aiResponse?.response === "string" ? aiResponse.response : JSON.stringify(aiResponse);
      return extractJson(result);
    } catch (cfErr) {
      console.error("[parse] CF AI error:", cfErr instanceof Error ? cfErr.message : String(cfErr));
    }
  }

  // Fallback: OpenRouter
  const apiKey = getApiKey(c.env as { OPENROUTER_API_KEY?: string });
  if (apiKey) {
    try {
      const result = await callLLM(apiKey, {
        systemPrompt: RESUME_PARSE_PROMPT,
        userMessage: resumeText.slice(0, 12000),
        responseFormat: "text",
      });
      return extractJson(result);
    } catch (llmErr) {
      console.error("[parse] OpenRouter error:", llmErr instanceof Error ? llmErr.message : String(llmErr));
    }
  }

  // Fallback: regex-based extraction when AI is unavailable
  console.warn("[parse] All AI providers failed. Using regex fallback for:", resumeText.slice(0, 80));
  return parseResumeWithRegex(resumeText);
}

/** Regex-based resume parser — extracts basic fields when AI is unavailable. */
function parseResumeWithRegex(text: string): Record<string, unknown> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Name: usually the first non-empty line
  const name = lines[0]?.replace(/[▪•|].*$/, "").trim() ?? "";

  // Email
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  const email = emailMatch?.[0] ?? "";

  // Phone
  const phoneMatch = text.match(/(\+?\d[\d\s\-().]{7,}\d)/);
  const phone = phoneMatch?.[1]?.trim() ?? "";

  // URL
  const urlMatch = text.match(/https?:\/\/[^\s,)]+/);
  const url = urlMatch?.[0] ?? "";

  // Summary: look for "Profile", "Summary", "Objective" section
  let summary = "";
  const summaryIdx = lines.findIndex((l) => /^(profile|summary|objective)\b/i.test(l));
  if (summaryIdx !== -1) {
    const nextSectionIdx = lines.findIndex((l, i) => i > summaryIdx && /^(work|experience|education|skills|volunteer)\b/i.test(l));
    summary = lines.slice(summaryIdx + 1, nextSectionIdx !== -1 ? nextSectionIdx : summaryIdx + 5).join(" ").trim();
  }

  // Work: look for company + position patterns
  const work: Array<Record<string, unknown>> = [];
  const workIdx = lines.findIndex((l) => /^(work\s+experience|experience|employment)\b/i.test(l));
  if (workIdx !== -1) {
    // Find lines with dates (MM/YYYY or YYYY patterns)
    const datePattern = /(\d{1,2}\/\d{4}|\d{4})\s*[-–—]\s*(\d{1,2}\/\d{4}|\d{4}|present)/i;
    for (let i = workIdx + 1; i < lines.length; i++) {
      const dateMatch = lines[i].match(datePattern);
      if (dateMatch) {
        // Previous line is likely company/position
        const titleLine = lines[i - 1] ?? lines[i];
        const parts = titleLine.split(/[|▪•,]/);
        work.push({
          name: parts[0]?.trim() ?? "",
          position: parts[1]?.trim() ?? parts[0]?.trim() ?? "",
          startDate: dateMatch[1],
          endDate: dateMatch[2],
          highlights: [],
        });
      }
      // Bullet points
      if (/^[⦁•▪\-*]/.test(lines[i]) && work.length > 0) {
        const hl = (work[work.length - 1].highlights as string[]) ?? [];
        hl.push(lines[i].replace(/^[⦁•▪\-*]\s*/, ""));
        work[work.length - 1].highlights = hl;
      }
    }
  }

  // Skills: look for "Skills" section
  const skills: Array<Record<string, string>> = [];
  const skillsIdx = lines.findIndex((l) => /^skills\b/i.test(l));
  if (skillsIdx !== -1) {
    const nextSection = lines.findIndex((l, i) => i > skillsIdx && /^(education|volunteer|awards|certif|publicat|languages|interests|references|projects)\b/i.test(l));
    const skillLines = lines.slice(skillsIdx + 1, nextSection !== -1 ? nextSection : skillsIdx + 20);
    for (const sl of skillLines) {
      if (sl.length > 2) skills.push({ name: sl.replace(/^[⦁•▪\-*]\s*/, ""), level: "" });
    }
  }

  // Education
  const education: Array<Record<string, string>> = [];
  const eduIdx = lines.findIndex((l) => /^education\b/i.test(l));
  if (eduIdx !== -1) {
    for (let i = eduIdx + 1; i < Math.min(eduIdx + 10, lines.length); i++) {
      if (/university|college|institute|school/i.test(lines[i])) {
        const parts = lines[i].split(",");
        education.push({ institution: parts[0]?.trim() ?? "", area: parts[1]?.trim() ?? "", studyType: "" });
      }
    }
  }

  return {
    basics: { name, label: "", email, phone, url, summary, location: null },
    work,
    education,
    skills,
    volunteer: [],
    awards: [],
    certificates: [],
    publications: [],
    languages: [],
    interests: [],
    references: [],
    projects: [],
  };
}

// Modern plural endpoints — also exported so app.ts can register them at the mount root
// (Hono sub-router root "/" never matches when mounted with app.route(prefix, router))
export const listResumesHandler = async (c: any) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db.select().from(resumes).where(eq(resumes.userId, user.sub)).orderBy(resumes.updatedAt);
  return c.json(ok(rows.map(rowToLegacyResume)), 200);
};

export const createResumeHandler = async (c: any) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateResumeSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  // If rawText is provided, parse it with AI to get structured content
  let content = parsed.data.content;
  if (parsed.data.rawText) {
    content = await parseResumeTextWithAI(c, parsed.data.rawText);
  }

  const privacyLevel = PRIVACY_TO_LEVEL[parsed.data.privacy ?? "private"] ?? 10;
  const db = getDb();
  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: parsed.data.title,
      content,
      status: parsed.data.status,
      isMaster: parsed.data.isMaster ?? false,
      privacyLevel,
    } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(created)), 201);
};

// Register at both "" and "/" — Hono sub-router path stripping can vary
resumeRoutes.get("", listResumesHandler);
resumeRoutes.get("/", listResumesHandler);
resumeRoutes.post("", createResumeHandler);
resumeRoutes.post("/", createResumeHandler);

// Legacy resume endpoints used by frontend services
resumeRoutes.get("/public", async (c) => {
  const page = Number(c.req.query("page") ?? 1) || 1;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
  const db = getDb();
  // Only return resumes with privacyLevel = 0 (public)
  const rows = await db
    .select()
    .from(resumes)
    .where(eq(resumes.privacyLevel, 0))
    .orderBy(resumes.updatedAt)
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json(
    ok({
      items: rows.map(rowToSummary),
      total: rows.length,
      page,
      limit,
      hasNext: rows.length === limit,
      hasPrev: page > 1,
    }),
    200,
  );
});

resumeRoutes.get("/public/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();

  const condition = UUID_RE.test(slug)
    ? and(eq(resumes.id, slug), eq(resumes.privacyLevel, 0))
    : and(eq(resumes.slug, slug), eq(resumes.privacyLevel, 0));

  const [row] = await db.select().from(resumes).where(condition).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(row)), 200);
});

resumeRoutes.get("/getresumesownedbyauthuser", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db.select().from(resumes).where(eq(resumes.userId, user.sub));
  return c.json(ok(rows.map(rowToSummary)), 200);
});

resumeRoutes.get("/withownership", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const rows = await db.select().from(resumes).where(eq(resumes.userId, user.sub));
  const result = rows.map((r) => ({ ...rowToLegacyResume(r), ownership: "owned" }));
  return c.json(ok(result), 200);
});

resumeRoutes.get("/mastergroups", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const all = await db.select().from(resumes).where(eq(resumes.userId, user.sub));
  const masters = all.filter((r) => r.isMaster && !r.parentId);
  const variations = all.filter((r) => !!r.parentId);
  // Ungrouped non-master root resumes stand alone as single-item groups
  const ungrouped = all.filter((r) => !r.isMaster && !r.parentId);
  const masterGroups = [
    ...masters.map((m) => ({
      masterResume: rowToLegacyResume(m),
      variations: variations.filter((v) => v.parentId === m.id).map(rowToLegacyResume),
    })),
    ...ungrouped.map((r) => ({ masterResume: rowToLegacyResume(r), variations: [] })),
  ];
  return c.json(ok(masterGroups), 200);
});

resumeRoutes.get("/validateslug", async (c) => {
  const user = c.var.user;
  const slug = c.req.query("slug") ?? "";
  const resumeId = c.req.query("resumeId");
  if (!slug) return c.json(ok({ slug, available: false }), 200);
  const db = getDb();
  const conditions = resumeId
    ? and(eq(resumes.userId, user.sub), eq(resumes.slug, slug), ne(resumes.id, resumeId))
    : and(eq(resumes.userId, user.sub), eq(resumes.slug, slug));
  const [existing] = await db.select({ id: resumes.id }).from(resumes).where(conditions).limit(1);
  return c.json(ok({ slug, available: !existing }), 200);
});

resumeRoutes.get("/embedded/:identifier", async (c) => {
  const identifier = c.req.param("identifier");
  const user = c.var.user;
  const db = getDb();

  const condition = UUID_RE.test(identifier)
    ? and(eq(resumes.id, identifier), eq(resumes.userId, user.sub))
    : and(eq(resumes.slug, identifier), eq(resumes.userId, user.sub));

  const [row] = await db.select().from(resumes).where(condition).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(row)), 200);
});

resumeRoutes.post("/save", async (c) => {
  const user = c.var.user;
  const content = await parseBodyToContent(c);
  const title = typeof (content as any).name === "string" ? (content as any).name : "Untitled Resume";

  const db = getDb();
  const [created] = await db
    .insert(resumes)
    .values({ userId: user.sub, title, content, status: "draft" } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(created)), 201);
});

resumeRoutes.post("/parse", async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";

  let resumeText = "";

  // Multipart path — file upload
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file") as File | null;
    if (file) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const bytes = await file.arrayBuffer().catch(() => null);
        if (bytes) {
          resumeText = await extractPdfText(new Uint8Array(bytes));
        }
      } else {
        resumeText = await file.text().catch(() => "");
      }
    }
  } else {
    // JSON path
    const body = await c.req.json().catch(() => ({}));
    if (typeof body?.content === "string") {
      resumeText = body.content;
    } else if (typeof body?.text === "string") {
      resumeText = body.text;
    }
  }

  if (!resumeText) {
    return c.json(ok({ result: "{}" }), 200);
  }

  const parsed = await parseResumeTextWithAI(c, resumeText);
  return c.json(ok({ result: JSON.stringify(parsed) }), 200);
});

resumeRoutes.post("/createfromfile", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  const text = file ? await file.text().catch(() => "") : "";

  const db = getDb();
  const [created] = await db
    .insert(resumes)
    .values({ userId: user.sub, title: file?.name || "Uploaded Resume", content: { raw: text }, status: "draft" } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(created)), 201);
});

resumeRoutes.post("/summarize", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const resumeText = typeof body?.resumeText === "string" ? body.resumeText : "";
  const result = resumeText
    ? `Summary: ${resumeText.slice(0, 240)}${resumeText.length > 240 ? "..." : ""}`
    : "Summary generated for the selected resume.";
  return c.json(ok({ result }), 200);
});

resumeRoutes.post("/sentimentprediction", async (c) => {
  const body = await c.req.json().catch(() => null);
  const value = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const score = value.length > 300 ? 78 : value.length > 80 ? 64 : 52;
  return c.json(ok(score), 200);
});

resumeRoutes.post("/watch/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [existing] = await db
    .select({ id: watchedResumes.id })
    .from(watchedResumes)
    .where(and(eq(watchedResumes.viewerId, user.sub), eq(watchedResumes.resumeId, id)))
    .limit(1);
  if (!existing) {
    await db.insert(watchedResumes).values({ viewerId: user.sub, resumeId: id } as any);
  }
  return c.json(ok({ success: true }), 200);
});

resumeRoutes.post("/unwatch/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  await db.delete(watchedResumes).where(and(eq(watchedResumes.viewerId, user.sub), eq(watchedResumes.resumeId, id)));
  return c.json(ok({ success: true }), 200);
});

// Dynamic routes below static routes
resumeRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();

  const condition = UUID_RE.test(id)
    ? and(eq(resumes.id, id), eq(resumes.userId, user.sub))
    : and(eq(resumes.slug, id), eq(resumes.userId, user.sub));

  const [row] = await db.select().from(resumes).where(condition).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(row)), 200);
});

resumeRoutes.put("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateResumeSchema.safeParse(body);

  if (parsed.success) {
    const db = getDb();
    const [updated] = await db
      .update(resumes)
      .set({ ...parsed.data, updatedAt: new Date() } as any)
      .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
      .returning();
    if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
    return c.json(ok(rowToLegacyResume(updated)), 200);
  }

  // Legacy update path where body is serialized resume content string literal
  const content = await parseBodyToContent(c);
  const db = getDb();
  const [updated] = await db
    .update(resumes)
    .set({ content, updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(updated)), 200);
});

resumeRoutes.delete("/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [existing] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  // Defense-in-depth: include userId in the DELETE WHERE clause so that a
  // future refactor that drops the existence check above can't silently
  // become an authorization bypass.
  await db.delete(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(undefined), 200);
});

resumeRoutes.post("/:id/clone", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [original] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!original) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const [cloned] = await db
    .insert(resumes)
    .values({ userId: user.sub, title: `${original.title} (copy)`, content: original.content ?? {}, status: "draft" } as any)
    .returning();

  return c.json(ok(rowToLegacyResume(cloned)), 201);
});

resumeRoutes.post("/:id/publish", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [updated] = await db
    .update(resumes)
    .set({ status: "published", updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .returning();
  if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(updated)), 200);
});

resumeRoutes.get("/:id/export", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const format = (c.req.query("format") ?? "json").toLowerCase();
  const db = getDb();

  const [row] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const content = row.content as Record<string, unknown> | null;

  if (format === "md" || format === "markdown") {
    // Return markdown if stored, otherwise serialise the JSON
    const md = typeof content?.markdown === "string"
      ? content.markdown
      : `# ${row.title}\n\n${JSON.stringify(content, null, 2)}`;
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${row.title.replace(/[^a-z0-9]/gi, "_")}.md"`,
      },
    });
  }

  if (format === "pdf" || format === "docx") {
    // PDF/DOCX generation requires an external rendering service (e.g. Puppeteer,
    // Gotenberg, or a managed PDF API). Until one is configured, return the
    // markdown/JSON so the Chrome extension can still download something useful.
    const md = typeof content?.markdown === "string"
      ? content.markdown
      : `# ${row.title}\n\n${JSON.stringify(content, null, 2)}`;
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${row.title.replace(/[^a-z0-9]/gi, "_")}.txt"`,
        "X-Export-Note": "PDF/DOCX rendering not yet available; content returned as plain text",
      },
    });
  }

  // Default: JSON export
  const exportPayload = JSON.stringify({ id: row.id, title: row.title, content, exportedAt: new Date().toISOString() }, null, 2);
  return new Response(exportPayload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${row.title.replace(/[^a-z0-9]/gi, "_")}.json"`,
    },
  });
});

resumeRoutes.get("/:id/metadata", (c) => c.json(ok([]), 200));
resumeRoutes.put("/:id/metadata", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const db = getDb();
  const [row] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(rowToLegacyResume(row)), 200);
});

resumeRoutes.post("/:id/setmaster", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [found] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!found) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  await db.update(resumes).set({ isMaster: false } as any).where(eq(resumes.userId, user.sub));
  await db.update(resumes).set({ isMaster: true } as any).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/setactive", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [found] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!found) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  await db.update(resumes).set({ isActive: false } as any).where(eq(resumes.userId, user.sub));
  await db.update(resumes).set({ isActive: true } as any).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/setprivacy", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const privacy = typeof body?.privacy === "string" ? body.privacy : "private";
  const privacyLevel = PRIVACY_TO_LEVEL[privacy] ?? 10;
  const db = getDb();
  const [updated] = await db
    .update(resumes)
    .set({ privacyLevel, updatedAt: new Date() } as any)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .returning({ id: resumes.id });
  if (!updated) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/promote", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const db = getDb();
  const [found] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!found) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  await db.update(resumes).set({ isMaster: false } as any).where(eq(resumes.userId, user.sub));
  await db.update(resumes).set({ isMaster: true, parentId: null } as any).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)));
  return c.json(ok(true), 200);
});

resumeRoutes.post("/:id/createvariation", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  const db = getDb();
  const [parent] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, user.sub))).limit(1);
  if (!parent) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  // When resumeData (markdown string) is supplied by the Chrome extension or other
  // clients, store it alongside the structured content so it can be rendered/exported.
  const baseContent: Record<string, unknown> = typeof parent.content === "object" && parent.content !== null
    ? { ...(parent.content as Record<string, unknown>) }
    : {};

  if (typeof body?.resumeData === "string" && body.resumeData.trim()) {
    baseContent.markdown = body.resumeData.trim();
  }
  if (typeof body?.description === "string") {
    baseContent.variationDescription = body.description;
  }

  const [created] = await db
    .insert(resumes)
    .values({
      userId: user.sub,
      title: name ?? `${parent.title} Variation`,
      content: baseContent,
      status: "draft",
      parentId: parent.id,
      isMaster: false,
      isActive: false,
      privacyLevel: parent.privacyLevel,
    } as any)
    .returning();
  return c.json(ok(rowToLegacyResume(created)), 201);
});

// GET /:id/diff — compare this resume against its parent or another variation
// Returns a field-level diff of the two content objects.
resumeRoutes.get("/:id/diff", async (c) => {
  const id = c.req.param("id");
  const user = c.var.user;
  const db = getDb();

  const [resume] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!resume) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  // Compare against parentId if provided, otherwise compare against the master
  const compareId = c.req.query("compareId") ?? (resume as any).parentId;
  if (!compareId) {
    return c.json(ok({ message: "No parent or compareId to diff against", changes: [] }), 200);
  }

  const [other] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, compareId), eq(resumes.userId, user.sub)))
    .limit(1);

  if (!other) return c.json(fail("NOT_FOUND", "Comparison resume not found"), 404);

  // Simple field-level diff on content objects
  const aContent = (resume.content ?? {}) as Record<string, unknown>;
  const bContent = (other.content ?? {}) as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(aContent), ...Object.keys(bContent)]);

  const changes: Array<{ field: string; type: "added" | "removed" | "changed"; before: unknown; after: unknown }> = [];
  for (const key of allKeys) {
    const before = bContent[key];
    const after = aContent[key];
    const beforeStr = JSON.stringify(before);
    const afterStr = JSON.stringify(after);
    if (beforeStr === afterStr) continue;
    if (before === undefined) changes.push({ field: key, type: "added", before: null, after });
    else if (after === undefined) changes.push({ field: key, type: "removed", before, after: null });
    else changes.push({ field: key, type: "changed", before, after });
  }

  return c.json(ok({
    resumeId: resume.id,
    compareId: other.id,
    resumeTitle: resume.title,
    compareTitle: other.title,
    changes,
    summary: { total: changes.length, added: changes.filter((c) => c.type === "added").length, removed: changes.filter((c) => c.type === "removed").length, changed: changes.filter((c) => c.type === "changed").length },
  }), 200);
});

resumeRoutes.all("*", (c) => c.json(fail("NOT_IMPLEMENTED", "Resume route not implemented"), 501));
