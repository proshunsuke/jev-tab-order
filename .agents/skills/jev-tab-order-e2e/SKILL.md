---
name: jev-tab-order-e2e
description: Add, run, and diagnose Jev Tab Order Playwright E2E tests using the shared Chrome extension fixture and mocked Jev responses.
---

# Extension E2E Tests

Run from the project root. Use [playwright.config.ts](../../../playwright.config.ts)
and [test.yml](../../../.github/workflows/test.yml) as the execution references.

## Setup and Execution

Install dependencies with `npm ci` and Chromium with `npx playwright install chromium`.
Use the same Node.js major version as CI.

```fish
npm run test:e2e -- e2e/specs/organize.spec.ts
npm run test:e2e:ui
npm run test:e2e:debug
npm run test:e2e:sharded
```

Sequential and CI runs are headed. On Linux without a display, use the Xvfb command
in CI. Sharded local runs build once, use three headless Chromium processes, and
merge reports into `playwright-report/sharded`. Check both test results and report
merging. Do not run sequential and sharded commands concurrently in one checkout,
because they clean overlapping output directories.

## Fixtures and Assertions

- Import `test` and `expect` from [e2e/fixtures.ts](../../../e2e/fixtures.ts).
  Use its `context`, `serviceWorker`, and `extensionId` fixtures.
- Each test receives a separate profile and extension copy. Only English locale
  files remain in the copy because macOS ignores `--lang` for extension messages.
  Do not alter the production locale files. Cleanup closes the context before
  removing the profile, even after a failure.
- This extension does not open settings automatically on installation; do not copy
  the reference extension's install-page waiting logic.
- Mock Jev requests and Chrome's LanguageModel in browser tests. Never use real API
  keys or infer live model quality from mocked tests.
- Assert Chrome tab/group state as well as UI feedback. Preview must not move tabs;
  apply must preserve pinned tabs and existing memberships; undo restores the
  snapshot; a changed source snapshot must prevent applying an outdated plan.
- Use observable state and Playwright assertions instead of fixed sleeps. Service
  worker availability alone does not guarantee application initialization.
- Inspect failed test artifacts before retrying. Headless tests do not establish
  desktop focus behavior or real Chrome built-in AI availability.
