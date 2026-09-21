<div align="center">
  <img src="public/icon-128.png" alt="Jev Tab Order" width="96" height="96">

# Jev Tab Order

[English](README.md) | [日本語](README.ja.md)

</div>

A Chrome extension that uses [Jev](https://typesafe.ai/) to organize tabs and groups in the current window by meaning and your sorting rules. Pinned tabs and existing group memberships stay intact.

**Organize the entire window with a single Jev API request.** Grouping and ordering decisions are evaluated together, regardless of the number of tabs.

## Getting Started

1. Follow [Manual Installation](#manual-installation) to load the extension. It is not yet published to the Chrome Web Store.
2. Open the extension's settings and save your TypeSafe Jev API key.
3. Click the toolbar icon in the window you want to organize. No popup opens; the icon shows “…” while running and “✓” on completion, then clears the badge after three seconds. You can also use the page context menu or a configured shortcut.

See [supported languages](locales/).

### Settings

- **Jev API key**: Stored on this device only. API usage may incur charges. Each organization or preview sends at most one Jev request; undo sends none.
- **Sorting rules**: Leave blank to use the defaults. Custom text replaces the entire default rule. Example: “Put official documentation before tutorials. Order groups as Development, Research, Personal. Do not create new groups.”
- **Allow new groups**: New groups require permission from both this setting and the rules, multiple related ungrouped tabs, and available Chrome built-in AI for naming. Use the preparation button in settings if the model needs an initial download.

## How It Works

The extension collects the window's tab information, asks Jev for judgments, then turns those answers into a layout and applies it through Chrome.

1. **Collect information — extension:** Read tab titles, URLs, current positions, and group memberships. Prepare the rules and group names alongside them. Pinned tabs are excluded from Jev's input; page bodies are not read. URL credentials, query strings, and fragments are removed before sending.
2. **Judge meaning — Jev:** Evaluate all questions together in **one API request**: which existing group an ungrouped tab fits, which tabs or groups belong next to each other, how early or late each should appear under the rules, and whether the rules permit new groups. Candidates include domains or group names to make the choices clear. Jev returns choices and numeric priority scores, with probabilities and confidence.
3. **Build the layout — extension:** Use accepted choices to assign ungrouped tabs and gather related items into adjacent sets. Sort within and between those sets using Jev's scores, with lower scores placed earlier. Answers below the acceptance thresholds are ignored; ties preserve their previous order, and items without an accepted score keep their slot in that sorting step. These calculations run locally, without further Jev calls.
4. **Name new groups — Chrome's local AI, when enabled:** If both the settings and Jev's judgment allow new groups, related ungrouped tabs can form a group. Chrome's built-in AI generates its name from tab titles. If naming is unavailable, those tabs remain adjacent without a new group.
5. **Validate and apply — extension:** Check that the plan preserves every tab, pinned tabs, and existing group memberships, then move tabs and groups through Chrome APIs. Preview stops before applying; undo restores the saved layout without calling Jev.

For example, if Jev selects “GitHub” as an ungrouped tab's destination and the answer passes the acceptance thresholds, the extension adds that tab to the existing GitHub group. Jev supplies the judgment; the extension performs the browser operation.

### What the Jev Request Contains

The extension sends JSON to `POST https://api.typesafe.ai/v1/systemone` with `model: "jev-latest"`. The body contains shared context (`state`) and multiple judgments (`questions`). **One API call contains many questions**, prepared together before sending.

- **`state` — information to judge:** The active rules, web tab IDs, titles, sanitized URLs, and group memberships; existing group names and member IDs; and the current sequence of groups and ungrouped tabs. Detailed tab information is shared across questions.
- **`questions` — what to decide:** Each question contains `type` (Choice or Score), `instructions` (the judgment to make under the rules), and `criteria` (available choices or ordered scoring levels).

| Judgment                                                       | Type                  | Requested answer                                                                                                                               |
| -------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing group for each ungrouped tab                          | **Choice** (`choice`) | A group ID, with its name attached to the option, or `none` to leave the tab ungrouped                                                         |
| Adjacent tab                                                   | **Choice** (`choice`) | An earlier candidate tab ID, with its domain attached, or `self` for no match. Candidates are from the same existing group, or both ungrouped. |
| Adjacent group or ungrouped tab                                | **Choice** (`choice`) | An earlier candidate's ID, with its group name or domain attached, or `self` to keep it separate                                               |
| Position priority for each tab and each group or ungrouped tab | **Score** (`score`)   | A score on five levels: earliest, early, middle/no specified order, late, latest                                                               |
| Permission to create new groups, when enabled in settings      | **Choice** (`choice`) | `yes` or `no` according to the rules                                                                                                           |

Choice returns the selected ID in `choice`; the extension uses it to connect tabs or assign a destination group. Score returns a value from **0 to 4**, potentially fractional, rather than a final tab position. The extension uses it as a sorting priority. Both include `probabilities` and `confidence`, which the extension checks before using the answer. Score also includes `legend`, mapping level numbers to their descriptions.

### Minimal Request and Response Example

Suppose tab `1` is already in the GitHub group and tab `2` is an ungrouped documentation page. This example uses a short custom rule and shows only two questions from the single request: a destination Choice and a priority Score. The real request also contains the other applicable ordering and adjacency questions.

**Request body:**

```json
{
  "model": "jev-latest",
  "state": {
    "rules": "Add GitHub tabs to the GitHub group. Put documentation first.",
    "tabs": [
      {
        "id": "1",
        "title": "GitHub",
        "url": "https://github.com/",
        "groupId": 7
      },
      {
        "id": "2",
        "title": "GitHub Docs",
        "url": "https://docs.github.com/",
        "groupId": -1
      }
    ],
    "groups": [
      {
        "key": "group_7",
        "title": "GitHub",
        "tabIds": ["1"]
      }
    ],
    "blocks": [
      {
        "key": "group_7",
        "title": "GitHub",
        "tabIds": ["1"]
      },
      {
        "key": "topic_2",
        "title": "",
        "tabIds": ["2"]
      }
    ]
  },
  "questions": {
    "membership_2": {
      "type": "choice",
      "instructions": "According to state.rules, select an existing group for ungrouped tab 2 (Domain: docs.github.com), or none.",
      "criteria": {
        "none": "Keep ungrouped",
        "group_7": "Group name: \"GitHub\""
      }
    },
    "rank_tab_2": {
      "type": "score",
      "instructions": "Rate the position of tab 2 (Domain: docs.github.com) within its group according to state.rules; earlier is lower. Use the middle level if no order is specified.",
      "criteria": [
        "Earliest priority under the rules",
        "Early priority under the rules",
        "Middle priority or no distinguished order under the rules",
        "Late priority under the rules",
        "Latest priority under the rules"
      ]
    }
  }
}
```

**Illustrative response (only the `answers` field):** These values are made up to explain the format, not recorded model output or a guaranteed result.

```json
{
  "answers": {
    "membership_2": {
      "type": "choice",
      "choice": "group_7",
      "confidence": 1,
      "probabilities": {
        "none": 0,
        "group_7": 1
      }
    },
    "rank_tab_2": {
      "type": "score",
      "score": 0,
      "confidence": 1,
      "probabilities": {
        "0": 1,
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0
      },
      "legend": {
        "0": "Earliest priority under the rules",
        "1": "Early priority under the rules",
        "2": "Middle priority or no distinguished order under the rules",
        "3": "Late priority under the rules",
        "4": "Latest priority under the rules"
      }
    }
  }
}
```

The extension matches each answer to its question key. Here, `membership_2.choice` selects group `7`, and its probability and confidence pass the acceptance thresholds, so tab `2` is added to that group. `rank_tab_2.score: 0` gives it the earliest priority level. Its final position is calculated locally using the other tabs' answers too; this score alone does not mean “move to tab index 0.”

## Privacy

See the [Privacy Policy](PRIVACY.md).

## Development

### Setup

Use a Node.js version supported by [package.json](package.json); the [CI workflow](.github/workflows/test.yml) uses Node.js 24. Run these commands from the project directory:

```fish
npm ci
```

### Common Commands

```fish
npm run dev          # Start Chrome development mode with hot reload
npm run build        # Build the Chrome extension
npm run typecheck    # Check TypeScript types
npm run lint:check   # Check lint without changing files
npm run format:check # Check formatting without changing files
```

### Manual Installation

After completing setup:

1. Run `npm run build`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select `dist/chrome-mv3`.
4. Open the extension's settings, enter your API key, and click **Save settings**.

After rebuilding, reload the extension from `chrome://extensions` to use the updated build.

### Unit Tests

```fish
npm run test:unit
```

### E2E Tests

Install Playwright's Chromium before the first run:

```fish
npx playwright install chromium
npm run test:e2e
```

## Releases

See the [release guide](.agents/skills/jev-tab-order-release/SKILL.md) for preparation and publishing procedures, and [CHANGELOG.md](CHANGELOG.md) for release notes.
