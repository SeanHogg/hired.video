/**
 * Tests for `writeId3v2Chapters` (#907) — pin the ID3v2.4 byte-stream
 * structure so a future encoder swap can't silently break podcast-app
 * chapter parsing.
 */

import { describe, expect, it } from "vitest";
import { writeId3v2Chapters, type Id3Chapter } from "../id3-chapters";

describe("writeId3v2Chapters", () => {
  it("returns empty bytes when no chapters are provided", () => {
    const out = writeId3v2Chapters([]);
    expect(out.length).toBe(0);
  });

  it("emits a valid ID3v2.4 tag header", () => {
    const out = writeId3v2Chapters([
      { elementId: "chp1", startTimeMs: 0, endTimeMs: 30_000, title: "Intro" },
    ]);
    // "ID3" magic + version 4 + revision 0
    expect(out[0]).toBe(0x49); // I
    expect(out[1]).toBe(0x44); // D
    expect(out[2]).toBe(0x33); // 3
    expect(out[3]).toBe(0x04); // major version
    expect(out[4]).toBe(0x00); // revision
    expect(out[5]).toBe(0x00); // flags
  });

  it("size field is synchsafe (each byte has high bit cleared)", () => {
    const out = writeId3v2Chapters([
      { elementId: "chp1", startTimeMs: 0, endTimeMs: 1000, title: "X" },
    ]);
    expect(out[6] & 0x80).toBe(0);
    expect(out[7] & 0x80).toBe(0);
    expect(out[8] & 0x80).toBe(0);
    expect(out[9] & 0x80).toBe(0);
  });

  it("emits CTOC frame referencing every chapter", () => {
    const chapters: Id3Chapter[] = [
      { elementId: "chp1", startTimeMs: 0, endTimeMs: 30_000, title: "Intro" },
      { elementId: "chp2", startTimeMs: 30_000, endTimeMs: 60_000, title: "Body" },
    ];
    const out = writeId3v2Chapters(chapters);
    const ascii = Array.from(out).map((b) => String.fromCharCode(b)).join("");
    expect(ascii.indexOf("CTOC")).toBeGreaterThan(-1);
    expect(ascii.indexOf("chp1")).toBeGreaterThan(-1);
    expect(ascii.indexOf("chp2")).toBeGreaterThan(-1);
  });

  it("emits one CHAP frame per chapter", () => {
    const chapters: Id3Chapter[] = [
      { elementId: "chp1", startTimeMs: 0, endTimeMs: 30_000, title: "Intro" },
      { elementId: "chp2", startTimeMs: 30_000, endTimeMs: 60_000, title: "Body" },
      { elementId: "chp3", startTimeMs: 60_000, endTimeMs: 90_000, title: "Outro" },
    ];
    const out = writeId3v2Chapters(chapters);
    // Count "CHAP" occurrences in the byte stream — each frame header
    // starts with the 4-byte frame id.
    let count = 0;
    for (let i = 0; i < out.length - 3; i++) {
      if (out[i] === 0x43 && out[i + 1] === 0x48 && out[i + 2] === 0x41 && out[i + 3] === 0x50) {
        count++;
      }
    }
    expect(count).toBe(3);
  });

  it("embeds TIT2 sub-frame for each chapter title", () => {
    const out = writeId3v2Chapters([
      { elementId: "chp1", startTimeMs: 0, endTimeMs: 30_000, title: "My Chapter" },
    ]);
    let count = 0;
    for (let i = 0; i < out.length - 3; i++) {
      if (out[i] === 0x54 && out[i + 1] === 0x49 && out[i + 2] === 0x54 && out[i + 3] === 0x32) {
        count++;
      }
    }
    expect(count).toBe(1);
  });

  it("encodes chapter timestamps as big-endian uint32 milliseconds", () => {
    // 30000ms = 0x00007530 → bytes 0x00 0x00 0x75 0x30 must appear in
    // the byte stream as the chapter's start time.
    const out = writeId3v2Chapters([
      { elementId: "chp1", startTimeMs: 30_000, endTimeMs: 60_000, title: "x" },
    ]);
    let found = false;
    for (let i = 0; i < out.length - 3; i++) {
      if (out[i] === 0x00 && out[i + 1] === 0x00 && out[i + 2] === 0x75 && out[i + 3] === 0x30) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
