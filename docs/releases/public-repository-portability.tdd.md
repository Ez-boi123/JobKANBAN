# Public repository portability — TDD evidence

## Source and user journey

This small hardening task was derived during the public-release review; no plan file was provided.

As a contributor, I want the design validation scripts to resolve Playwright from the repository, so that a clone works without exposing or depending on the original developer's machine path.

## RED / GREEN report

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `node --test tests/design-tools.test.mjs` | Expected failure | `Cannot find module '../../design/playwright.cjs'` |
| GREEN | `node --test tests/design-tools.test.mjs` | Passed | 1 test passed; the loader exposes `chromium.launch` and all five scripts use the relative loader without a user-home path |
| Regression | `npm test` | Passed | 28 tests passed, including API, launcher, and design-tool portability tests |

The RED checkpoint is commit `fd33e1b`; the GREEN checkpoint is commit `06afe70`.

## Test specification

| What is guaranteed | Test | Type | Result |
| --- | --- | --- | --- |
| The shared design loader resolves the repository's Playwright installation | `app/tests/design-tools.test.mjs` | Integration | PASS |
| Five design scripts use the shared relative loader | `app/tests/design-tools.test.mjs` | Integration | PASS |
| Those scripts do not contain a quoted drive path, `/Users/`, or `/home/` path | `app/tests/design-tools.test.mjs` | Safety regression | PASS |

## Coverage and known gaps

The project does not currently define a coverage command, so no numeric coverage percentage was produced. The new loader has one behavior and is executed directly by the targeted test. Browser execution of every design export script remains outside this portability test; the existing project browser checks cover the application flows separately.
