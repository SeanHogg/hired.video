/**
 * XML-validity guard for the course SVG renderers (register gap #1942).
 *
 * Both the seeded lesson diagrams ([shared/course-diagrams.ts] →
 * `COURSE_DIAGRAMS[k].svg`) and the deterministic course covers
 * ([shared/course-cover.ts] → `renderCourseCoverSvg`) are authored as raw
 * template-literal SVG strings and rendered through an `<img>`. A single
 * unescaped `&` / `<` / `>` / quote in a title or box label produces invalid
 * XML that the browser silently renders as a broken image — no error, just a
 * blank tile. This test fails loudly the moment a renderer (or a new seed
 * label) emits malformed XML.
 *
 * Dependency-light by design: the `shared` package ships zero-dep and must
 * build in both the Vite browser bundle and the Cloudflare Worker, and
 * `DOMParser` is not available under node:test. So we hand-roll a strict
 * well-formedness validator (balanced tags + properly-escaped text nodes)
 * rather than pull in an XML parser. Matches the other `shared/__tests__/*`
 * files: Node's built-in `node:test` runner, no vitest.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COURSE_DIAGRAMS } from "../course-diagrams.js";
import { renderCourseCoverSvg, escapeXmlText } from "../course-cover.js";

/**
 * Strict, dependency-free XML well-formedness check. Returns null when the
 * string is well-formed, otherwise a human-readable reason. Validates:
 *  - the document is wrapped by a single `<svg …>…</svg>` root,
 *  - every tag is balanced and properly nested (no crossed/orphan tags),
 *  - no raw unescaped `&` in text/attribute content (must be an entity),
 *  - no raw `<` or `>` inside text nodes (only via tag syntax),
 *  - all attribute values are quoted.
 *
 * Self-closing tags (`<tag … />`), void-style `<stop … />`, comments and
 * the XML/doctype/processing-instruction prologue are handled.
 */
function checkWellFormed(xml: string): string | null {
  // 1. Ampersands must always begin a valid entity reference.
  //    Named (&amp;), decimal (&#39;) or hex (&#x27;).
  const entityRe = /&(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);/y;
  for (let i = 0; i < xml.length; i++) {
    if (xml[i] === "&") {
      entityRe.lastIndex = i;
      if (!entityRe.test(xml)) {
        return `raw unescaped '&' at index ${i}: …${xml.slice(i, i + 20)}…`;
      }
    }
  }

  // 2. Tokenize into tags + text nodes and verify nesting.
  const stack: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      // trailing text — must contain no raw '<' or '>'
      const tail = xml.slice(i);
      if (tail.includes(">")) return `raw '>' in trailing text node`;
      break;
    }
    // text between i and lt is a text node — must not contain raw '>'
    const text = xml.slice(i, lt);
    if (text.includes(">")) return `raw '>' in text node before index ${lt}`;

    const gt = xml.indexOf(">", lt);
    if (gt === -1) return `unterminated tag at index ${lt}`;

    let tag = xml.slice(lt, gt + 1);

    // Comments / CDATA / processing instructions / doctype — skip wholesale.
    if (tag.startsWith("<!--")) {
      const end = xml.indexOf("-->", lt);
      if (end === -1) return `unterminated comment at index ${lt}`;
      i = end + 3;
      continue;
    }
    if (tag.startsWith("<?") || tag.startsWith("<!")) {
      i = gt + 1;
      continue;
    }

    const inner = tag.slice(1, -1).trim();
    const isClose = inner.startsWith("/");
    const isSelf = inner.endsWith("/");
    const name = (isClose ? inner.slice(1) : inner).trim().split(/[\s/]/)[0];

    if (!name) return `empty tag name at index ${lt}`;

    // Verify every attribute value is quoted (no bare attr=value).
    const attrPart = inner
      .replace(/^\/?/, "")
      .replace(/\/?$/, "")
      .slice(name.length);
    const bareAttr = /\s[\w:-]+\s*=\s*(?!["'])[^\s>]/.exec(attrPart);
    if (bareAttr) return `unquoted attribute in <${name}…>: ${attrPart.trim()}`;

    if (isClose) {
      const top = stack.pop();
      if (top !== name) {
        return `mismatched closing tag </${name}> (expected </${top ?? "∅"}>)`;
      }
    } else if (!isSelf) {
      stack.push(name);
    }
    i = gt + 1;
  }

  if (stack.length) return `unclosed tag(s): ${stack.join(", ")}`;
  return null;
}

describe("course SVG renderers emit well-formed XML (#1942)", () => {
  it("validator rejects known-bad XML (sanity)", () => {
    assert.notEqual(checkWellFormed("<svg>Tom & Jerry</svg>"), null); // raw &
    assert.notEqual(checkWellFormed("<svg><text></svg>"), null); // unbalanced
    assert.notEqual(checkWellFormed("<svg><a></b></svg>"), null); // mismatched
    assert.notEqual(checkWellFormed("<svg attr=bad></svg>"), null); // unquoted
    // …and accepts well-formed input with entities + self-closing tags.
    assert.equal(
      checkWellFormed('<svg><rect x="1"/><text>Tom &amp; Jerry</text></svg>'),
      null,
    );
  });

  it("every COURSE_DIAGRAMS[k].svg is well-formed XML", () => {
    const keys = Object.keys(COURSE_DIAGRAMS);
    assert.ok(keys.length > 0, "expected at least one diagram");
    for (const key of keys) {
      const svg = COURSE_DIAGRAMS[key]!.svg;
      assert.ok(
        svg.startsWith("<svg"),
        `${key}: svg should start with <svg, got: ${svg.slice(0, 16)}`,
      );
      assert.ok(svg.trimEnd().endsWith("</svg>"), `${key}: svg should end with </svg>`);
      const err = checkWellFormed(svg);
      assert.equal(err, null, `${key}: malformed SVG — ${err}`);
    }
  });

  it("renderCourseCoverSvg output is well-formed for a plain title", () => {
    const svg = renderCourseCoverSvg({
      title: "Intro to Prompt Engineering",
      category: "AI",
      difficulty: "Beginner",
    });
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.trimEnd().endsWith("</svg>"));
    assert.equal(checkWellFormed(svg), null);
  });

  it("renderCourseCoverSvg escapes &, <, > and \" in dynamic labels", () => {
    const svg = renderCourseCoverSvg({
      title: 'Tokens & the "context" <window>',
      category: 'R&D "core"',
      difficulty: '<Pro>',
    });
    // Public render helper must produce well-formed XML despite hostile input.
    assert.equal(checkWellFormed(svg), null, "hostile label produced malformed XML");
    // And the special chars must appear as escaped entities, never raw.
    assert.ok(svg.includes("&amp;"), "expected &amp;");
    assert.ok(svg.includes("&lt;"), "expected &lt;");
    assert.ok(svg.includes("&gt;"), "expected &gt;");
    assert.ok(svg.includes("&quot;"), "expected &quot;");
    // No raw special chars survived inside the rendered label region. The
    // title is the only place hostile text lands; assert the raw forms of the
    // injected chars are gone from the aria-label/title (they only survive as
    // entities). We check the substring around the title isn't holding a raw
    // unescaped quote/angle that came from input.
    assert.ok(!svg.includes('"context"'), "raw quoted text leaked unescaped");
    assert.ok(!svg.includes("<window>"), "raw angle-bracket text leaked unescaped");
  });

  it("escapeXmlText maps the full special-char set", () => {
    assert.equal(escapeXmlText(`& < > " '`), "&amp; &lt; &gt; &quot; &#39;");
  });
});
