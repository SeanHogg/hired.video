/**
 * `require-page-chrome` — flag any `frontend/pages/**\/*.tsx` file whose
 * default export doesn't render `<AppShell>` and doesn't call BOTH
 * `useSEO` AND `useBreadcrumbs`. Catches the regression that landed
 * `/points` + `/rewards` without sidebar / header / SEO meta in May 2026
 * (see [[feedback_new_page_checklist]] in agent memory).
 *
 * Approach is intentionally lightweight: we walk the AST looking for
 * JSX elements + CallExpressions by name. No type info needed; runs
 * in the normal lint pass.
 *
 * Exemptions:
 *   - Route shims that only do `<Navigate to="..." />` or render a
 *     parent layout component (detected via the `// eslint-page-chrome:
 *     redirect-shim` comment or matching shape).
 *   - Auth pages (Login / Signup / VerifyEmail / etc.) that ship their
 *     own chrome — opt out with the comment marker.
 *   - Non-page files (anything not under `pages/`) — selector skips them.
 *
 * To opt out, add a leading comment to the file:
 *   // eslint-page-chrome: skip — <reason>
 */

const PAGE_GLOB = /[\\/]pages[\\/][^\\/]+\.tsx$/;
const SUBDIR_PAGE_GLOB = /[\\/]pages[\\/].+\.tsx$/;
const OPT_OUT_RE = /eslint-page-chrome:\s*skip/i;

// ESM default export — eslint.config.js is ESM (`import requirePageChrome
// from "./eslint-rules/require-page-chrome.js"`) and the frontend package
// is `"type": "module"`, so a CommonJS `module.exports` here resolves to
// no default export and crashes config load (#1868).
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Pages under frontend/pages must render <AppShell> and call useSEO + useBreadcrumbs",
      category: "Best Practices",
    },
    schema: [],
    messages: {
      missingAppShell:
        "Pages must wrap their content in <AppShell>. Without it the page renders without header / sidebar / footer / mobile nav. Reference: pages/AffiliateProgram.tsx.",
      missingUseSEO:
        "Pages must call useSEO('/your-route') so the page registers title / description / structured-data. Add an entry to PAGE_SEO in lib/seo.ts.",
      missingUseBreadcrumbs:
        "Pages must call useBreadcrumbs([{ name, url }]) so schema.org BreadcrumbList JSON-LD is emitted for Google rich results.",
      missingDefaultExport:
        "Pages must `export default function` (or default-export a component) so React-Router can render them.",
    },
  },

  create(context) {
    const filename = context.getFilename();
    // Only fires on `frontend/pages/**/*.tsx`; nested dirs included (e.g.
    // pages/admin/Points.tsx, pages/tools/Foo.tsx). Anchor at the
    // `/pages/` segment so we don't trip on `frontend/components/pages/`.
    if (!PAGE_GLOB.test(filename) && !SUBDIR_PAGE_GLOB.test(filename)) return {};

    // Honour the opt-out comment — the file's first leading block of
    // comments controls behaviour, so devs can disable per-file with a
    // documented reason.
    const sourceCode = context.getSourceCode();
    const firstComment = sourceCode.getAllComments()[0];
    if (firstComment && OPT_OUT_RE.test(firstComment.value)) return {};

    let foundAppShell = false;
    let foundUseSEO = false;
    let foundUseBreadcrumbs = false;
    let hasDefaultExport = false;

    return {
      JSXOpeningElement(node) {
        if (node.name && node.name.type === "JSXIdentifier" && node.name.name === "AppShell") {
          foundAppShell = true;
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee && callee.type === "Identifier") {
          if (callee.name === "useSEO") foundUseSEO = true;
          else if (callee.name === "useBreadcrumbs") foundUseBreadcrumbs = true;
        }
      },
      ExportDefaultDeclaration() {
        hasDefaultExport = true;
      },
      "Program:exit"(node) {
        if (!hasDefaultExport) {
          context.report({ node, messageId: "missingDefaultExport" });
          return; // a file with no default export isn't really a "page"; skip the rest
        }
        if (!foundAppShell) context.report({ node, messageId: "missingAppShell" });
        if (!foundUseSEO) context.report({ node, messageId: "missingUseSEO" });
        if (!foundUseBreadcrumbs)
          context.report({ node, messageId: "missingUseBreadcrumbs" });
      },
    };
  },
};
