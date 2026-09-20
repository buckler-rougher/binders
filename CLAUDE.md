# binders.evanhollander.org

## Typography

This site uses the EMH type system, shared across every evanhollander.org site.
Full reference: `cdn.evanhollander.org/TYPOGRAPHY.md`.

- **EMH Grotesk** (Inter) — body and UI, `wght` 100–900
- **EMH Mono** (Fira Code) — numerals that change in place, technical strings,
  version numbers; pair with `font-variant-numeric: tabular-nums`
- **EMH Serif** (EB Garamond) — display headings and small caps, static 400

Three families, not one. Never `font-family: 'EMH'`.

- **No italic exists in any of them.** The browser synthesises an oblique by
  shearing the roman and it looks wrong, especially on Inter. Use
  `font-weight: 500` for emphasis.
- **Small caps come from EMH Serif only.** Inter ships no `smcp` (checked against
  v4.1), so `font-variant-caps` on Grotesk silently synthesises them. For a sans
  small-caps look, letterspace `text-transform: uppercase` instead.
- Declare the real weight range and keep both `format()` entries; `font-display: swap`
  always; `crossorigin` on any preload, even though the file is ours.
