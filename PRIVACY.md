# Privacy Policy for Jev Tab Order

_Last updated: September 21, 2026_

## Overview

Jev Tab Order organizes tabs and groups in the current Chrome window when you request it. Organization and previews send selected tab metadata and sorting rules to TypeSafe to make semantic decisions. Optional new group names are generated using Chrome's built-in AI on your device. The extension developer does not operate a server that receives your data.

Settings are stored locally without Chrome Sync. Temporary layout snapshots are stored within the browser session to support undo and recovery.

## Information We Handle

### Settings and API Keys

Your TypeSafe API key, custom sorting rules, and new-group permission are saved in `chrome.storage.local`. They remain in the browser profile until you change or remove them, or uninstall the extension. They are not copied to `chrome.storage.sync`.

The API key is sent to TypeSafe in the authentication header when the extension makes an API request. Sorting rules are included in organization and preview requests. Local extension storage is not an encrypted secret vault.

### Tab Organization and Previews

When you request organization or a preview, the extension reads the current window's tab identifiers, positions, titles, URLs (including pending navigation URLs when available), pinned state, and group membership. It also reads group identifiers, names, colors, and collapsed states. These values are used locally to plan changes, show the proposed layout, preserve existing memberships, and detect changes before applying a plan.

Requests to TypeSafe at `https://api.typesafe.ai/v1/systemone` contain relevant web tab titles, sanitized URLs, tab and group identifiers, group names, and the effective sorting rules. Each organization or preview sends at most one request containing all group-membership, topic-relationship, and position-priority questions. A window without eligible web tabs sends none. Failed requests are not retried automatically. Group naming and layout application do not send additional TypeSafe requests.

Web tab titles are limited to 120 characters. URLs are reduced to their origin and path, limited to 160 characters; URL credentials, query strings, and fragments are removed. This is not anonymization: titles, URL paths, group names, and freeform rules may still contain personal or sensitive information.

Pinned tab titles and URLs are not sent to TypeSafe. Non-web tab titles and URLs are replaced with a generic label and an empty URL in decision inputs, although their identifiers may be included. The extension does not read page bodies, form values, cookies, or past browsing history through Chrome's History API. Open tab URLs are nevertheless browsing information.

Previewing uses the same external service even if you never apply the proposed layout. Closing the organizer ends the page's in-memory work but does not retract requests already sent or remove an existing saved undo snapshot. The extension does not automatically organize tabs in response to ordinary browsing activity.

### Connection Tests

The connection-test button sends a fixed test input and the API key currently entered in settings to TypeSafe. It does not send tab metadata or sorting rules. Testing a key does not require saving it first.

### Local Group Naming

When creating a new group is allowed, the extension passes up to 12 relevant tab titles, each limited to 120 characters, to Chrome's local language model. The extension uses the returned name as the new group title. Naming itself does not send a separate request to a project-operated server or cloud naming service. Tab metadata has already been sent to TypeSafe for the organization decisions described above.

Chrome may need to download the model before it can be used. Model availability and downloads are managed by Chrome. If the local model is unavailable, the extension skips new group creation and continues organizing. Generated group names become normal Chrome tab group names and may be included in later organization requests.

### Session Tab State

Before applying changes, the extension stores a snapshot in `chrome.storage.session`. After successful organization, it also stores the resulting layout. These snapshots contain:

- Window and tab identifiers, tab positions, pinned state, and group membership
- Tab titles and original URLs, including URL components removed from external requests
- Group identifiers, names, colors, and collapsed states
- Identifiers of newly created groups and whether recovery is pending

Snapshots cover the target window, including pinned and non-web tabs, even though their titles and URLs are excluded from TypeSafe requests. API keys and sorting rules are not copied into undo records.

One undo record is retained per organized window. A subsequent organization replaces that window's previous record. Successful undo or successful recovery after an application failure removes the record. An interrupted operation can retain its record for recovery. Closing the target window does not explicitly delete its record; restarting Chrome clears session storage.

The extension also temporarily stores window and organizer-document identifiers in session storage to prevent concurrent operations on the same window. Locks are normally removed when an operation finishes; stale locks are checked when another operation starts.

For troubleshooting, session storage retains the latest background operation's type, start and finish times, processing stage, and predefined error message per window. These diagnostic records do not contain tab titles, URLs, sorting rules, or API keys and are cleared when Chrome restarts.

This session state is local and is not synchronized through Chrome Sync or sent as a complete snapshot to TypeSafe. It is distinct from the limited decision inputs described above.

## Data Storage and Sharing

- Settings and API keys are stored locally. Undo records and operation locks are stored in session storage. The extension does not use Chrome Sync.
- TypeSafe receives decision inputs and API authentication information over HTTPS. As the service provider, it may also receive connection information such as your IP address and service usage information under its own policy.
- TypeSafe's [Privacy Policy](https://typesafe.ai/legal/privacy-policy) governs its processing and retention. That policy states that prompts and other inputs are not used to train or fine-tune models; this does not mean inputs are never retained. The extension does not set or guarantee TypeSafe's retention period.
- The extension includes no analytics, advertising, or tracking services and does not sell your data or send it to the extension developer.
- Chrome manages its built-in AI and model downloads. Chrome's own services are separate from the extension's local storage and TypeSafe requests.

## Your Controls

You can view and edit your rules, replace or clear your API key, and enable or disable new groups in settings. Click **Save settings** to persist changes. Clearing the rules restores the default rules; clearing the saved API key prevents subsequent organization and preview requests until a key is provided. The connection-test button uses the currently entered key, including unsaved values.

Disabling new groups stops local naming during subsequent organization; it does not disable TypeSafe requests for sorting. To avoid future external decision requests, do not run organization, previews, or connection tests, or disable the extension. Cancelling a running operation does not erase data already sent to TypeSafe.

Successful undo removes the saved undo record for that window. Restarting Chrome clears session snapshots and operation locks. Closing the organizer or an individual target window does not itself clear all session data.

Uninstalling removes the extension's local data from that Chrome profile. It does not reverse tab changes already applied, revoke your TypeSafe API key, or delete information already received by TypeSafe. Manage or revoke the key through TypeSafe and use the contact and deletion options in its privacy policy for data held by that service. Chrome manages downloaded AI models separately from extension settings.

## Changes to This Policy

We will update this policy when the extension's data handling changes and revise the date above. The policy in this repository describes the corresponding source code; older installed versions may have different behavior or permissions.

## Contact

A public contact channel for the extension developer has not yet been configured. It must be added here before store submission; this policy is currently a pre-release draft.

For questions about information held by TypeSafe, use the contact details in [TypeSafe's Privacy Policy](https://typesafe.ai/legal/privacy-policy). TypeSafe's contact is not the extension developer's contact.
