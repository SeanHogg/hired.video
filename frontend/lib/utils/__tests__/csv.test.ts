/**
 * Tests for the shared CSV utilities used by the recruiter import / export
 * surfaces.
 *
 * Regression context: the original parser in CsvImportCandidatesDialog
 * split on `\r?\n` and used a naive line-splitter that mishandled embedded
 * newlines inside quoted cells, BOM-prefixed Excel-on-Windows exports, and
 * `""` escaped quotes. The shared helper replaces it; these tests pin the
 * edge cases.
 *
 * Run: vitest run lib/utils/__tests__/csv.test.ts
 */

import { describe, it, expect } from "vitest";
import { buildCsv, csvEscape, parseCsv } from "@/lib/utils/csv";

describe("parseCsv — line endings", () => {
  it("handles LF (Unix)", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles CRLF (Windows)", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles bare CR (legacy Mac)", () => {
    const rows = parseCsv("a,b\r1,2\r3,4");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("parseCsv — quoting", () => {
  it("strips quotes from simple quoted cells", () => {
    expect(parseCsv('"hello","world"')).toEqual([["hello", "world"]]);
  });

  it("preserves commas inside quoted cells", () => {
    expect(parseCsv('"a, b",c')).toEqual([["a, b", "c"]]);
  });

  it('decodes "" as a literal double-quote', () => {
    expect(parseCsv('"she said ""hi"""')).toEqual([['she said "hi"']]);
  });

  it("preserves newlines inside quoted cells", () => {
    const rows = parseCsv('"line one\nline two",second\n3,4');
    expect(rows).toEqual([
      ["line one\nline two", "second"],
      ["3", "4"],
    ]);
  });
});

describe("parseCsv — BOM + whitespace", () => {
  it("strips a leading UTF-8 BOM", () => {
    const rows = parseCsv("﻿a,b\n1,2");
    expect(rows[0]).toEqual(["a", "b"]);
  });

  it("drops fully empty rows", () => {
    const rows = parseCsv("a,b\n\n1,2\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvEscape", () => {
  it("leaves plain values untouched", () => {
    expect(csvEscape("hello")).toBe("hello");
  });
  it("quotes values containing commas", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });
  it("quotes values containing quotes and doubles them up", () => {
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
  });
  it("quotes values containing newlines", () => {
    expect(csvEscape("a\nb")).toBe('"a\nb"');
  });
});

describe("buildCsv", () => {
  it("emits header + escaped data rows", () => {
    const csv = buildCsv(["name", "email"], [
      ["Jane, Doe", "jane@example.com"],
      ["John", null],
    ]);
    expect(csv).toBe(
      'name,email\n"Jane, Doe",jane@example.com\nJohn,',
    );
  });

  it("survives a parseCsv round-trip", () => {
    const csv = buildCsv(["a", "b"], [
      ["one", 'two "and a half"'],
      ["three", "four,five"],
    ]);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual([
      ["a", "b"],
      ["one", 'two "and a half"'],
      ["three", "four,five"],
    ]);
  });
});
