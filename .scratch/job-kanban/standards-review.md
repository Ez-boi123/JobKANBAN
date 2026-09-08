# Standards review

Scope: commit `0dd2da9`, compared with `449844b2ab858eaf0bf9604db238bb8ab30662bb`; frontend and backend additions. Sources: `AGENTS.md`, `docs/agents/*.md`, `CONTEXT.md`, and the confirmed React / Node 24 / SQLite local-app direction.

## Hard violations

None found. The repository defines issue-tracker conventions and domain vocabulary, but no additional coding standards. No applicable ADR files exist. Baseline code-smell heuristics are judgment calls, not repository rules.

## Judgment findings

- **[P2] Convert the waiting start to Beijing time before calculating days** — `src/time.ts:15` (new-file hunk). `statusSince` is written as UTC by `server/index.mjs`, but `waitLabel` slices its UTC calendar date while comparing against today's Beijing calendar date. Entering 待反馈 at Beijing 00:30 and viewing it one minute later already displays “等待反馈 1 天”. Reproduced against the actual transpiled module with `statusSince=2026-09-07T16:30:00.000Z` and `now=2026-09-08T00:31:00+08:00`. Normalize both timestamps through `chinaDay` before subtraction, and cover the UTC/Beijing date boundary. This affects normal UI-created records daily between midnight and 08:00; it does not require unusual API input.

Security inspection found loopback binding, Host/Origin checks, JSON-only writes, static-path containment, parameterized SQLite queries, and optimistic concurrency checks. No additional actionable security finding established in this pass. Application files were not edited.
