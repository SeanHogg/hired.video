import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  // Base JavaScript configuration
  js.configs.recommended,

  // TypeScript and React files
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        React: "readonly",
        JSX: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      react: react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      // TypeScript-specific rules (strict on types, relaxed on style)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error", // Keep strict - we want types!
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      // '@typescript-eslint/prefer-nullish-coalescing': 'error', // Disabled - requires strictNullChecks
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/consistent-type-imports": "off", // Too strict for existing code
      "@typescript-eslint/consistent-type-definitions": "off", // Allow both type and interface
      "@typescript-eslint/array-type": "off", // Allow both T[] and Array<T>
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": "allow-with-description",
          "ts-check": false,
        },
      ],

      // React-specific rules (relaxed)
      "react/react-in-jsx-scope": "off", // Not needed with new JSX transform
      "react/prop-types": "off", // Using TypeScript for prop validation
      "react/display-name": "warn",
      "react/jsx-key": "error",
      "react/jsx-no-duplicate-props": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-uses-react": "off", // Not needed with new JSX transform
      "react/jsx-uses-vars": "error",
      "react/no-children-prop": "error",
      "react/no-danger-with-children": "error",
      "react/no-deprecated": "warn",
      "react/no-direct-mutation-state": "error",
      "react/no-find-dom-node": "warn",
      "react/no-is-mounted": "error",
      "react/no-render-return-value": "error",
      "react/no-string-refs": "warn",
      "react/no-unescaped-entities": "warn", // Warn instead of error
      "react/no-unknown-property": "error",
      "react/require-render-return": "error",
      "react/self-closing-comp": "warn", // Warn instead of error
      "react/jsx-boolean-value": "off", // Allow both true and omitted
      "react/jsx-closing-bracket-location": "off", // Too strict
      "react/jsx-closing-tag-location": "off", // Too strict
      "react/jsx-curly-spacing": "off", // Let prettier handle
      "react/jsx-equals-spacing": "off", // Let prettier handle
      "react/jsx-first-prop-new-line": "off", // Too strict
      "react/jsx-indent": "off", // Let prettier handle
      "react/jsx-indent-props": "off", // Let prettier handle
      "react/jsx-max-props-per-line": "off", // Too strict
      "react/jsx-no-bind": "off", // Allow inline functions
      "react/jsx-no-comment-textnodes": "error",
      "react/jsx-no-target-blank": "error",
      "react/jsx-pascal-case": "error",
      "react/jsx-tag-spacing": "off", // Let prettier handle
      "react/jsx-wrap-multilines": "off", // Let prettier handle

      // React Hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React Refresh rules
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // Import rules (relaxed)
      "import/order": "off", // Too strict and annoying
      "import/no-unresolved": "off", // TypeScript handles this
      "import/no-duplicates": "warn", // Warn instead of error
      // 'import/no-unused-modules': 'error', // Can be performance intensive
      "import/first": "warn",
      "import/newline-after-import": "off", // Let prettier handle
      "import/no-absolute-path": "error",

      // Accessibility rules (relaxed)
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-has-content": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/aria-activedescendant-has-tabindex": "warn",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "warn", // Warn instead of error
      "jsx-a11y/heading-has-content": "warn",
      "jsx-a11y/html-has-lang": "warn",
      "jsx-a11y/img-redundant-alt": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/mouse-events-have-key-events": "warn",
      "jsx-a11y/no-access-key": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-distracting-elements": "warn",
      "jsx-a11y/no-redundant-roles": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "warn",
      "jsx-a11y/tabindex-no-positive": "warn",

      // General code quality rules (relaxed)
      "no-console": "warn",
      "no-debugger": "warn", // Warn in development
      "no-alert": "warn",
      "no-var": "error",
      "prefer-const": "warn",
      "prefer-arrow-callback": "off", // Allow both
      "prefer-template": "off", // Allow both
      "object-shorthand": "off", // Allow both
      "quote-props": "off", // Let prettier handle
      "no-duplicate-imports": "warn",
      "no-useless-rename": "warn",
      "no-useless-computed-key": "warn",
      "no-useless-constructor": "warn",
      "no-useless-return": "warn",
      "no-unreachable": "error",
      "no-unused-expressions": "warn",
      "no-unused-labels": "warn",
      "no-unused-vars": "off", // Disable in favor of @typescript-eslint/no-unused-vars
      "no-undef": "off", // TypeScript handles this
      "no-redeclare": "off", // TypeScript handles this
      "no-dupe-class-members": "off", // TypeScript handles this
    },
    settings: {
      react: {
        version: "detect",
      },
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
  },

  // JavaScript files (if any)
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        React: "readonly",
        JSX: "readonly",
      },
    },
    plugins: {
      react: react,
      "react-hooks": reactHooks,
      import: importPlugin,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      // Basic JavaScript rules (keep strict on unused vars)
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-console": "warn",
      "no-debugger": "error",
      "prefer-const": "error",

      // React rules for JS files
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "error", // Enable prop-types for JS files
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Configuration files
  {
    files: [
      "*.config.{js,ts}",
      "*.config.*.{js,ts}",
      "vite.config.*",
      "tailwind.config.*",
    ],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        // Don't require project for config files
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-var-requires": "off",
      "import/no-default-export": "off",
      "@typescript-eslint/no-unused-vars": "warn", // More lenient for config files
    },
  },

  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".next/**",
      "coverage/**",
      "*.min.js",
      "public/**",
      "netlify/**",
    ],
  },
];
