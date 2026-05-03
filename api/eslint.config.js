// Lint rules for the Hono API. Lean — the only custom rule today catches
// the historical ``sql`= ANY(${array})` `` anti-pattern that broke
// /api/workspaces (and four other routes) under the worker pg driver.
// The rule lives here so any future SQL written in this package fails
// lint at PR time instead of waiting on a 500 in production.

import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,

  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      // ─── Drizzle: ban raw `= ANY(${array})` ──────────────────────────────
      //
      // The worker pg driver does not coerce JS arrays into Postgres array
      // parameters in raw `sql\`\`` templates the way node-postgres does
      // locally. Production then throws "op ANY/ALL (array) requires array
      // on right side" while dev tests pass. Use Drizzle's `inArray(col,
      // array)` helper instead — it binds the values as a real array under
      // every supported driver.
      //
      // Selector breakdown:
      //   TaggedTemplateExpression[tag.name='sql']  — the `sql\`...\`` tag
      //   TemplateElement[value.raw=/= ?ANY ?\(/]  — any literal chunk
      //                                              containing "= ANY(" or
      //                                              "=ANY(" inside that tag
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TaggedTemplateExpression[tag.name='sql'] TemplateElement[value.raw=/=\\s*ANY\\s*\\(/]",
          message:
            "Don't use raw `sql`= ANY(${array})` — the worker pg driver fails to bind JS arrays as Postgres arrays. Use Drizzle's `inArray(column, array)` instead.",
        },
        {
          selector:
            "TaggedTemplateExpression[tag.name='sql'] TemplateElement[value.raw=/=\\s*ALL\\s*\\(/]",
          message:
            "Don't use raw `sql`= ALL(${array})` — same array-binding failure mode as ANY. Use Drizzle's `notInArray(column, array)` plus a NOT predicate, or rewrite with `notExists`.",
        },
      ],

      // Existing `error()` helper signature isn't strict — leave standard
      // TS rules untouched for now. The point of this config is the SQL
      // anti-pattern guard, not a wholesale code-quality pass.
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },

  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".wrangler/**",
      "drizzle/**",
    ],
  },
];
