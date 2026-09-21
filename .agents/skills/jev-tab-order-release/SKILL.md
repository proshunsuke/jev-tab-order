---
name: jev-tab-order-release
description: Prepare Jev Tab Order releases, update versions, changelogs and Chrome Web Store submission documents, verify distribution ZIPs, and perform requested publishing operations.
---

# Jev Tab Order Releases

Work from the project root. Read the [publishing reference](references/publish.md) as the source of truth for the process.
For store-related work, also read the bundled [chrome-extensions](../chrome-extensions/SKILL.md) skill and relevant publishing references.

## Scope

- Do not expand a changelog-only request into version changes or publication. Distinguish release preparation from upload, review submission, and publication.
- Commit, tag, push, create GitHub Releases, and modify store entries only when those operations are included in the request. Do not ask again for authorization already given.
- Discover publishing destinations and authentication from existing configuration and actual remotes. Do not reuse another project's extension IDs or secrets, or claim to have run a release workflow that does not exist.

## Preparation

1. Inspect `git status`, the relevant changes, `package.json`, `package-lock.json`, and [CHANGELOG.md](../../../CHANGELOG.md). Compare with actual tags and published versions; do not reuse a published version.
2. When a version change is needed, update `package.json` and the npm lockfile together. Pass `--no-git-tag-version` to `npm version` to avoid automatic commits and tags. Do not hand-edit generated manifests.
3. Keep changelog versions in descending order with `## X.Y.Z` headings and English bullet points. Describe user-visible changes only; do not assign publication dates to unpublished versions.
4. Reconcile [CHROMEWEBSTORE.md](../../../CHROMEWEBSTORE.md) listing copy, permission justifications, and data disclosures with the implementation and [PRIVACY.md](../../../PRIVACY.md). Do not invent publishing details or verification results. Use English for documentation, synchronize README.md and README.ja.md, and keep localized listing copy in its target language. CHROMEWEBSTORE.md field names may be Japanese.
5. Run the checks and ZIP inspection in [references/publish.md](references/publish.md). Repeat affected checks if the implementation changes afterward.

## Store Submission Document

- Follow the reference project's dashboard page order: package, store listing, privacy, distribution, and test instructions. Use Japanese field headings and English guidance. Provide listing copy for every supported locale in `locales/`. State that the extension uses Jev in the opening sentence of every description.
- Keep CHROMEWEBSTORE.md as the intended form values and copyable text for the target version, not a publication log or a general architecture document. Record actual external-operation results in the task report.
- Use separate text blocks for each API permission justification and the shared host-permission justification. Put `https://api.typesafe.ai/*` in the host scope; do not present it as a dashboard field name.
- Synchronize the full changelog at the end of all listing descriptions: English entries must match CHANGELOG.md exactly, with equivalent translations in every other locale in the same order. Describe multilingual support concisely without enumerating languages in changelog entries.
- Check description limits (16,000 characters per locale), purpose and permission limits (1,000 per field), and test instructions (500). Confirm fields against the actual dashboard after uploading the target package.
- Preserve undecided publisher details, distribution choices, missing assets, and unresolved data disclosures as explicit submission blockers. Do not copy the reference project's URLs, credentials, existing uploads, or data-use answers.

## Extension-Specific Requirements

- Distinguish passing mocked tests from live verification with Jev and Chrome built-in AI. Report missing live checks accurately.
- Jev requires the user's API key and may incur charges. Do not include keys in ZIPs, listing copy, screenshots, or logs.
- Tab metadata is sent to TypeSafe. Do not claim that all data stays on the device or that no data is transmitted.
- New group names use Chrome built-in AI on supported devices. Explain that creation is skipped when the model is unavailable.
- Bundled skills are development resources. Exclude `.agents/` and `skills-lock.json` from the distribution ZIP.

## Reporting

Report the target version, ZIP path and SHA-256, check results, and any unperformed checks.
For external operations, report the actual upload, review, or publication state and the corresponding URL.
After failures or ambiguous responses, inspect the current state before retrying; do not create duplicate releases or store entries.
