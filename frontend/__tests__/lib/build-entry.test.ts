/**
 * Unit tests for the kit entry contract (landing hero → builder hand-off).
 */

import { describe, it, expect } from "vitest";
import { isAcceptedResumeFile } from "@/lib/build-entry";

describe("isAcceptedResumeFile", () => {
  it.each([
    ["Sean_Hogg_Resume.pdf", "application/pdf"],
    ["resume.DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["old-resume.doc", "application/msword"],
    ["resume.txt", "text/plain"],
    ["README.md", ""],
    ["IMG_4021.HEIC", "image/heic"],
    ["scan", "image/jpeg"],
  ])("accepts %s (%s)", (name, type) => {
    expect(isAcceptedResumeFile({ name, type })).toBe(true);
  });

  it.each([
    ["portfolio.zip", "application/zip"],
    ["intro.mp4", "video/mp4"],
    ["resume.pdf.exe", "application/octet-stream"],
    ["", ""],
  ])("rejects %s (%s)", (name, type) => {
    expect(isAcceptedResumeFile({ name, type })).toBe(false);
  });
});
