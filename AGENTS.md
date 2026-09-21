# Jev Tab Order

## Code Conventions

- Follow existing structure and conventions. Use arrow functions, type aliases,
  inferred return types, and `@/` imports within the application. Preserve relative
  imports in configuration files when required by their runtime.
- Order constants, types, and internal data structures before main exports, followed
  by helpers.
- Use default Oxfmt formatting and default Oxlint rules with the built-in React
  plugin. Do not add stylistic rules or speculative abstractions.

## UI Text and Translation

- `locales/en.json` is the source of truth. Use WXT's `#i18n` in extension code.
- When adding, removing, or changing the meaning of text, update all supported
  locales in the same change. Avoid unrelated translation edits.
- Check keys, non-empty messages, placeholders, and consistency of meaning across
  languages.

## Documentation

- Write project-owned documentation and skills in English by default.
- Keep `README.md` and `README.ja.md` aligned in structure and meaning, with
  reciprocal language links.
- `CHROMEWEBSTORE.md` field names may be Japanese; localized store copy uses its
  target language.
- Do not modify downloaded official skills to enforce these language conventions.
