# Release Guide

[Release Extension](../../../../.github/workflows/release.yml) is the source of truth for automated releases. It follows the reference project's process: manual dispatch, build and ZIP, Chrome Web Store draft upload through Workload Identity Federation, then GitHub Release creation with the ZIP attached. It does not submit the draft for review or publish it to the store.

The workflow is implemented and the public GitHub repository has been created. On 2026-09-22, the dedicated Workload Identity provider and repository-scoped service-account access were configured. All four repository Actions secrets (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `CHROME_PUBLISHER_ID`, and `CHROME_EXTENSION_ID`) are registered. The separate [Jev Tab Order store item](https://chrome.google.com/webstore/devconsole/8009c97a-122b-4cb9-abdd-a961267915fc/afbcjklgfmfokamphkgclkocfhgablka/edit) was created by uploading the local ZIP and is a draft, not submitted for review. Its extension ID is `afbcjklgfmfokamphkgclkocfhgablka`. The [initial release workflow](https://github.com/proshunsuke/jev-tab-order/actions/runs/35669794357) completed successfully, including Google authentication and draft upload. Keep this status accurate as setup progresses.

The destination is the public [proshunsuke/jev-tab-order](https://github.com/proshunsuke/jev-tab-order) repository, configured as the local `origin` remote. Jev Tab Order has its own store item under the reference extension's Chrome Web Store publisher. Reuse the existing Google Cloud project and publisher-linked service account. Federation access for both repositories is configured separately, preserving the reference repository's access.

Verified in the Google Cloud console and publisher dashboard on 2026-09-21:

| Existing resource                   | Value                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Chrome Web Store publisher ID       | `8009c97a-122b-4cb9-abdd-a961267915fc`                                         |
| Google Cloud project name           | `tpo-fork-release`                                                             |
| Google Cloud project ID             | `psh-tpo-rel-bimiahgc-260315`                                                  |
| Google Cloud project number         | `675377080739`                                                                 |
| Publisher-linked service account    | `chrome-web-store-release@psh-tpo-rel-bimiahgc-260315.iam.gserviceaccount.com` |
| Existing Workload Identity pool     | `github`                                                                       |
| Existing Workload Identity provider | `tab-position-options-fork`                                                    |

Jev Tab Order uses provider `projects/675377080739/locations/global/workloadIdentityPools/github/providers/jev-tab-order`, with issuer `https://token.actions.githubusercontent.com`, default audience, and condition `assertion.repository=='proshunsuke/jev-tab-order'`. Attribute mappings are `google.subject=assertion.sub` and `attribute.repository=assertion.repository`. The shared service account grants Workload Identity access to `attribute.repository="proshunsuke/jev-tab-order"`; the existing `proshunsuke/tab-position-options-fork` binding remains present. Both bindings were verified in the pool's connected service accounts view.

Chrome Web Store currently permits only one linked service account per publisher, with access to all its items. A separate Google Cloud project alone does not isolate store publishing permissions. Do not replace the linked account during setup, as the existing extension relies on it. A separate federation project could still impersonate the shared publisher-linked account, but would require a cross-project IAM binding.

## Initial Setup

1. Establish the destination GitHub repository and its `origin` remote. Commit and push only when requested; the workflow must exist on the default branch before manual dispatch is available.
2. Create a separate Jev Tab Order item in the Chrome Web Store Developer Dashboard using a locally verified ZIP. Record its extension ID and the owning publisher ID. Never reuse the reference extension's item ID.
3. Use a Google Cloud project with the Chrome Web Store API enabled. Link the publishing service account to the publisher in the Developer Dashboard. When reusing the existing publisher's linked service account, verify that linkage instead of replacing it.
4. Configure the Google Workload Identity provider and service-account IAM binding to accept this GitHub repository. Inspect both the provider attribute condition and the service account's `roles/iam.workloadIdentityUser` binding. Existing access restricted to `tab-position-options-fork` does not automatically authorize `jev-tab-order`. Preserve the reference repository's access; do not broaden trust to arbitrary repositories.
5. Register the following repository Actions secrets. These are identifiers, not service-account private keys; no JSON key or OAuth refresh token is needed by this workflow.

| Actions secret                   | Value                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` |
| `GCP_SERVICE_ACCOUNT_EMAIL`      | The publisher-linked service account email                                                                            |
| `CHROME_PUBLISHER_ID`            | The publisher ID from the Chrome Web Store dashboard                                                                  |
| `CHROME_EXTENSION_ID`            | The new Jev Tab Order item ID                                                                                         |

GitHub supplies `GITHUB_TOKEN`; do not create a personal token for the workflow. The release job requests `contents: write` and `id-token: write`. Repository or organization policies must allow the referenced actions and these permissions. GitHub cannot return existing secret values; retrieve identifiers from the source configuration rather than attempting to extract secret values from workflow logs.

Resolve the listing assets, contact details, public privacy policy URL, and review access in CHROMEWEBSTORE.md before store submission. A configured upload workflow alone does not make the listing ready for review.

## Workflow Execution

1. Identify the requested ref and version. Confirm successful lint, formatting, type checks, unit tests, E2E tests, and packaging for that exact revision. The release workflow does not run tests; [Test](../../../../.github/workflows/test.yml) runs checks and three E2E shards, matching the reference project.
2. Dispatch `Release Extension` for that ref only when release execution is requested. Preparation does not authorize publication. Do not create the version tag manually: the workflow creates it with the GitHub Release after the draft upload succeeds.
3. Follow the run and verify both the Chrome Web Store upload and the GitHub Release, including its ZIP attachment and tag target. Record the run URL, release URL, and uploaded version.
4. Complete dashboard changes and submit for review separately when requested. For the initial release, the store installation link may remain unavailable until approval and publication.

If a run fails, inspect the store item and GitHub tag/release state before retrying. An upload may have succeeded even if release creation failed. Never blindly repeat a partially successful release.

References: [Chrome Web Store service accounts](https://developer.chrome.com/docs/webstore/service-accounts), [Workload Identity Federation for deployment pipelines](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).

## Versioning and Documents

- `package.json` is the source of truth for `version`. Keep `package-lock.json` in sync; do not hand-edit the generated manifest.
- Use a numeric `X.Y.Z` version greater than the published version. Do not use suffixes such as `-beta` in the manifest version.
- If using `npm version`, pass `--no-git-tag-version` to avoid automatic commits and tags. The initial version is `0.1.0` and has not been published.
- [CHANGELOG.md](../../../../CHANGELOG.md) records user-visible changes, [CHROMEWEBSTORE.md](../../../../CHROMEWEBSTORE.md) holds listing and submission content, and [PRIVACY.md](../../../../PRIVACY.md) describes data handling.
- Keep project documentation in English and synchronize [README.md](../../../../README.md) with [README.ja.md](../../../../README.ja.md). Field names in CHROMEWEBSTORE.md may remain Japanese; localized listing copy should use its target language.

## Automated Checks and Packaging

Run from the project root. Resolve failures before proceeding to the next step.

```fish
npm ci
npm run typecheck
npm run lint:check
npm run format:check
npm run test:unit
npm run test:e2e
npm run zip
```

If Chromium is not installed, run `npx playwright install chromium` before E2E tests.
`test:e2e` includes a Chrome build, and `zip` also builds the extension. An additional `npm run build` is unnecessary.

The ZIP is generated at `dist/jev-tab-order-<version>-chrome.zip`. Inspect its contents and checksum:

```fish
set release_version (node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")
set release_zip "dist/jev-tab-order-$release_version-chrome.zip"
unzip -l "$release_zip"
unzip -p "$release_zip" manifest.json
shasum -a 256 "$release_zip"
```

Confirm the manifest is at the archive root and its name, version, and permissions match the intended release.
Exclude secrets, source maps, and development files such as `.agents/`, `skills-lock.json`, tests, `node_modules/`, and `.env`.

## Live Verification

Mocked tests do not verify Jev's judgment quality or Chrome built-in AI availability.
Extract the generated ZIP and load that directory in a test Chrome profile. Check:

- A real Jev connection and organization with default and custom rules.
- Execution from the toolbar icon, context menu, and configured shortcuts.
- Preservation of pinned tabs and existing group memberships; assignment of ungrouped tabs; sorting within and between groups.
- New groups enabled and disabled, rules that prohibit creation, and local model availability and unavailability.
- No movement before applying a preview, undo behavior, and cancellation of application when tabs change during planning.
- All supported interfaces in `locales/`, authentication failures, network failures, and cancellation messages.

Use real keys only when a working key and authorization for paid API usage are available. Report live checks that were not performed.

## Chrome Web Store

Uploading, submitting for review, and publishing are separate states. Perform only the operations included in the request.

1. Resolve the outstanding items in [CHROMEWEBSTORE.md](../../../../CHROMEWEBSTORE.md), including a publicly accessible privacy policy URL and contact information.
2. For the first release, create an item in the Developer Dashboard and upload the verified ZIP. For updates, verify the existing extension ID before proceeding.
3. Apply the listing, images, single purpose, permission justifications, data disclosures, distribution settings, and review instructions. Supply review credentials through the dedicated private field if needed; never save them in the repository.
4. Choose automatic publication after approval or deferred publication according to the requested release timing.
5. Verify and record the actual status. Creating a GitHub Release does not mean the extension is published in the store.

Use CHROMEWEBSTORE.md as the transfer source in dashboard page order. If a field needs new wording, update the repository document before pasting it. After saving, read back the dashboard fields to verify the package version, permission reasons, localized copy, data disclosures, images, and privacy policy URL. Report the saved or submitted state separately; do not append publication history to the form-value document.

Fix post-release issues with a higher version. Do not replace old tags or reuse a version as a recovery procedure.

References: [Chrome publishing guide](https://developer.chrome.com/docs/webstore/publish), [manifest version constraints](https://developer.chrome.com/docs/extensions/reference/manifest/version), and [WXT publishing guide](https://wxt.dev/guide/essentials/publishing.html).
