> **PRD** — drafted by Validator · task #871
> _Each agent that updates this PRD signs its change below._

# PRD: Fix `npm run typecheck` Execution in API Package

## Problem & Goal
The command `cd api && npm run typecheck` fails with `sh: 1: tsc: not found`, blocking PRD acceptance criteria. The `typecheck` script (`tsc --noEmit`) cannot execute because TypeScript is not available in the runtime environment despite being declared in `package.json`. Goal: Restore a working `tsc` invocation so the command succeeds with zero TypeScript errors.

## Target Users / ICP Roles
- Backend engineers running local type checks
- CI pipelines executing PRD-mandated verification steps

## Scope
- Ensure `api/package.json` devDependencies and scripts produce a functional `tsc` binary
- Validate execution in both local and CI environments
- Confirm no new TypeScript errors are introduced by the fix

## Functional Requirements
- `typescript` must be listed as a devDependency with a compatible version
- `npm install` must place `tsc` in the local `node_modules/.bin` path
- `npm run typecheck` must invoke `tsc --noEmit` without shell errors
- Execution must succeed in clean checkout environments

## Acceptance Criteria
- `cd api && npm run typecheck` completes successfully
- Exit code is 0 with no TypeScript errors reported
- No new errors introduced in `api/src`

## Out of Scope
- Changes to source files beyond dependency or script configuration
- Resolution of pre-existing TypeScript errors unrelated to the missing `tsc` binary
- Updates to non-API packages or unrelated build tooling

## Requirements

_Owned by the business-analyst — to be authored._

## Design

_Owned by the architect — to be authored._

## Implementation Notes

_Owned by the developer — to be authored._

## Review

_Owned by the code-reviewer — to be authored._

## Test Evidence

_Owned by the qa-tester — to be authored._