# PR screenshots: M4b.1 admin console polish

Screenshots for the M4b.1 pull request. Simulated sample data only (the stub in
`scripts/admin-stub.mjs`). Not part of the app; never merged into `main`.

- `after/`: this branch, every screen and state, light and dark, at 1440, 768
  and 390 px. Made with `pnpm build && node scripts/shoot-admin.mjs after --widths 1440,768,390`.
- `before/`: the same tool on `main` at `d40c675` (M4b), for comparison.

File names: `<screen>-<width>-<theme>.png`. Screens: overview, verification,
guides-board, guides-list, users, trips, audit, the drawers (`drawer-*`, with
the timeline), the palette, the phone menu sheet (390 only), the real-admin
console (`real-*`), empty states (`empty-*`) and error states (`error-*`).
390 px shots are at 2x; drawers, sheets and the palette are viewport shots,
everything else is the full page.
