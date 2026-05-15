# AGENTS.md

## Project

Name: react-typescript

Description: AI-agent setup for a React and TypeScript project.

## Stack

- Languages: typescript
- Frameworks: react
- Package managers: npm
- Testing: None declared

## Stack Guidance — React

Use the existing TypeScript and React conventions in the repository.

**TypeScript Discipline**

- Do not use `any` without a documented reason.
- Declare explicit types for exported functions, props, and return values.
- Reuse existing types and utilities before adding new ones.

**Component Conventions**

- Use function components with typed props.
- Co-locate components with the modules that own them.
- Keep render-only components free of side effects.

**Hook Discipline**

- Add memoization (`useMemo`, `useCallback`) only when a measured re-render or referential-identity problem exists.
- Keep state local; do not introduce a global store by default.
- Honor the rules of hooks; never call hooks conditionally.

**Styling**

- Follow the existing styling approach in the repository.
- Do not introduce a new CSS framework or component library.

**API Calls**

- Reuse existing client utilities for HTTP and data access.
- Type both request payloads and response bodies.
- Handle error and loading states explicitly.

**SDD and TDD Focus**

- Cover state transitions, API success, error, and loading paths.
- Cover accessibility-affecting behavior (focus, keyboard, ARIA).
- Add or update focused tests before changing observable behavior.

See the `## Completion Checklist` section for shared review steps.

## Enabled AI Clients

- Tabnine
- Codex
- Claude

## Development Workflow

- SDD: Required
- TDD: Required
- Final implementation review: Required

## Permissions

| Permission         | Mode  |
| ------------------ | ----- |
| filesystem read    | allow |
| filesystem write   | ask   |
| shell run          | ask   |
| dependency install | ask   |
| external network   | ask   |
| secrets access     | deny  |
| production access  | deny  |

## Safety Rules

- No source-code upload.
- No secret upload.
- No literal tokens in generated configs.
- No telemetry by default.
- No hosted execution in the MVP.

## Scope Limits

Cursor, Aider, Copilot, hosted gateways, enterprise RBAC, SIEM integrations, and custom sandbox runtimes are out of scope unless an approved spec adds them.

## Completion Checklist

- Run tests.
- Run golden tests when generated files change.
- Run doctor/check once available.
- Review the implementation against the relevant spec.
- List remaining risks or TODOs.
