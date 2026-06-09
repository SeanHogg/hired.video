> **PRD** — drafted by Coder Agent V2 (Container) · task #57
> _Each agent that updates this PRD signs its change below._

# PRD: Fix API Build Errors

## Problem & Goal

The `npm run typecheck` command in the `api` directory is failing due to TypeScript errors related to module resolution and undefined names. This prevents successful type checking, which is crucial for maintaining code quality and preventing runtime errors. The goal is to resolve these TypeScript errors to ensure the build process passes.

## Target Users

*   Backend Engineers
*   DevOps Engineers

## Scope

This PRD covers the resolution of the specific TypeScript errors reported by the `tsc --noEmit` command within the `api` directory. This includes:

*   Fixing relative import path issues in `src/db/schema/localizations.ts`.
*   Resolving the undefined `unique` name errors in `src/db/schema/localizations.ts`.

## Functional Requirements

1.  **Module Resolution Fix:** Update relative import paths in `src/db/schema/localizations.ts` to include explicit file extensions (e.g., `.ts`).
2.  **Undefined Name Fix:** Identify and correct the usage of the `unique` identifier in `src/db/schema/localizations.ts`. This may involve importing necessary types or functions, or correcting the syntax if it's a typo.

## Acceptance Criteria

*   The command `cd api && npm run typecheck` successfully completes without any TypeScript errors.
*   The `tsc --noEmit` command within the `api` directory passes.
*   No new TypeScript errors are introduced in the `api` directory.

## Out of Scope

*   Addressing any other build or runtime errors not explicitly mentioned in the provided `npm run typecheck` output.
*   Changes to dependencies or the `tsconfig.json` configuration, unless directly required to fix the specified errors.
*   Refactoring of code unrelated to the identified TypeScript errors.