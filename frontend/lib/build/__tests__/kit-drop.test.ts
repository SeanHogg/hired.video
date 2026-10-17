import { describe, expect, it } from "vitest";
import { EMPTY_KIT, kitEntryState } from "../kit-intake";
import { applyDrop, classifyDrop, firstUri, jobLinkError, jobTextFromSummary } from "../kit-drop";

const file = (name: string, type: string) => new File(["x"], name, { type });
const PHOTO = file("headshot.jpg", "image/jpeg");
const RESUME = file("Sean_Hogg.pdf", "application/pdf");
const LETTER = file("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

const JOB_POST = `Chief Information Officer — Macomb Community College
About the role: you will lead IT strategy across three campuses.
Responsibilities: own the technology roadmap, manage a team of 40.
Requirements: 10+ years of experience leading enterprise IT.
Qualifications: master's degree preferred. Benefits: pension, tuition.
Equal opportunity employer. Apply now.`;

const RESUME_TEXT = `Sean Hogg — sean@example.com
Experience: CIO, Acme Corp, Jan 2018 – present. Led a 40-person team, reduced cloud spend 30%.
Education: MBA, University of Michigan. Skills: IT strategy, vendor management, budgeting.
Managed the consolidation of 12 vendors into 3; delivered the ERP migration on time and under budget.`;

describe("classifyDrop", () => {
  it("sorts files into photo, résumé, letter by type and open slots", () => {
    expect(classifyDrop({ files: [PHOTO, RESUME, LETTER] }, EMPTY_KIT).map((i) => i.kind)).toEqual(["photo", "resume", "letter"]);
  });

  it("rejects a file with no open slot or an unsupported type", () => {
    const full = { ...EMPTY_KIT, photo: PHOTO, resume: RESUME, letter: LETTER };
    expect(classifyDrop({ files: [file("more.pdf", "application/pdf")] }, full)).toEqual([{ kind: "rejected" }]);
    expect(classifyDrop({ files: [file("song.mp3", "audio/mpeg")] }, EMPTY_KIT)).toEqual([{ kind: "rejected" }]);
  });

  it("reads a dragged link from text/uri-list (comments skipped)", () => {
    const uriList = "# from the browser\nhttps://jobs.example.com/cio-123\n";
    expect(classifyDrop({ files: [], uriList }, EMPTY_KIT)).toEqual([{ kind: "jobUrl", url: "https://jobs.example.com/cio-123" }]);
  });

  it("reads a link dropped or pasted as plain text", () => {
    expect(classifyDrop({ files: [], text: "  https://boards.greenhouse.io/acme/jobs/42  " }, EMPTY_KIT)).toEqual([
      { kind: "jobUrl", url: "https://boards.greenhouse.io/acme/jobs/42" },
    ]);
  });

  it("lets files win over the URL a dragged web image carries", () => {
    const items = classifyDrop({ files: [PHOTO], uriList: "https://cdn.example.com/headshot.jpg" }, EMPTY_KIT);
    expect(items.map((i) => i.kind)).toEqual(["photo"]);
  });

  it("takes a job post's text as the job, résumé text as 'describe yourself'", () => {
    expect(classifyDrop({ files: [], text: JOB_POST }, EMPTY_KIT)).toEqual([{ kind: "jobText", text: JOB_POST }]);
    expect(classifyDrop({ files: [], text: RESUME_TEXT }, EMPTY_KIT)).toEqual([{ kind: "about", text: RESUME_TEXT }]);
  });

  it("rejects stray text, unless it came from the job slot's own Paste", () => {
    expect(classifyDrop({ files: [], text: "hello there" }, EMPTY_KIT)).toEqual([{ kind: "rejected" }]);
    expect(classifyDrop({ files: [], text: "CIO at Macomb" }, EMPTY_KIT, { looseText: true })).toEqual([
      { kind: "jobText", text: "CIO at Macomb" },
    ]);
  });

  it("returns nothing for an empty drop", () => {
    expect(classifyDrop({ files: [], uriList: "", text: "   " }, EMPTY_KIT)).toEqual([]);
  });

  it("does not take a URL with words around it as a link", () => {
    expect(firstUri("see https://example.com")).toBeNull();
    expect(classifyDrop({ files: [], text: "see https://example.com/job" }, EMPTY_KIT)).toEqual([{ kind: "rejected" }]);
  });
});

describe("applyDrop", () => {
  it("fills the slots, counts rejections and hands back the link to read", () => {
    const { draft, rejected, jobUrl } = applyDrop(EMPTY_KIT, [
      { kind: "photo", file: PHOTO },
      { kind: "rejected" },
      { kind: "jobUrl", url: "https://jobs.example.com/1" },
    ]);
    expect(draft.photo).toBe(PHOTO);
    expect(draft.job).toBe("");
    expect(rejected).toBe(1);
    expect(jobUrl).toBe("https://jobs.example.com/1");
  });

  it("puts job text in the job slot and résumé text in 'describe yourself'", () => {
    const { draft } = applyDrop(EMPTY_KIT, [
      { kind: "jobText", text: JOB_POST },
      { kind: "about", text: RESUME_TEXT },
    ]);
    expect(draft.job).toBe(JOB_POST);
    expect(draft.prompt).toBe(RESUME_TEXT);
  });
});

describe("jobTextFromSummary", () => {
  // Shaped like a real /api/jobs/extract row (optional fields missing).
  const job = {
    title: "Chief Information Officer",
    company: "Macomb Community College",
    location: "Warren, MI",
    description: "Lead IT strategy across three campuses.\n\n\n\nReport to the president.",
    requirements: ["10+ years leading enterprise IT", "Higher-ed experience"],
    skills: ["IT strategy", "Budgeting"],
  };

  it("leads with 'title · company' so the kit's job label reads right", () => {
    const text = jobTextFromSummary(job);
    expect(text.split("\n")[0]).toBe("Chief Information Officer · Macomb Community College");
    expect(text).toContain("- Higher-ed experience");
    expect(text).toContain("IT strategy, Budgeting");
    expect(text).not.toMatch(/\n{3,}/);
  });

  it("sets the kit's target job exactly like a pasted post", () => {
    const state = kitEntryState({ ...EMPTY_KIT, prompt: "CIO, 20 years", job: jobTextFromSummary(job) }, "", "Untitled");
    expect(state.jobLabel).toBe("Chief Information Officer · Macomb Community College");
    expect(state.jobText).toContain("Lead IT strategy");
  });

  it("copes with a bare row (title only)", () => {
    expect(jobTextFromSummary({ title: "Designer" })).toBe("Designer");
  });
});

describe("jobLinkError", () => {
  it("maps the importer's codes to a friendly reason", () => {
    expect(jobLinkError("NOT_A_JOB_POSTING")).toBe("unsupported");
    expect(jobLinkError("EXTRACTION_FAILED")).toBe("unsupported");
    expect(jobLinkError("UNAUTHORIZED")).toBe("signIn");
    expect(jobLinkError("AUTHENTICATION_ERROR")).toBe("signIn");
    expect(jobLinkError("NETWORK_ERROR")).toBe("unreadable");
    expect(jobLinkError("")).toBe("unreadable");
  });
});
