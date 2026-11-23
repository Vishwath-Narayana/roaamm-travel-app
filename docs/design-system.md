# ROAAMM design system

The rules every screen follows: the admin console first, the rest of the app as
it moves over. Every value below is a token in
[`apps/web/src/styles/tokens.css`](../apps/web/src/styles/tokens.css), the one
tokens file every stylesheet reads. Nothing is eyeballed: if a value is not in
this document, it is not allowed.

## Enforcement

| Check | What it fails on | Where |
|---|---|---|
| `node scripts/check-tokens.mjs` | Admin CSS: any raw hex, `rgb()`/`hsl()` or named colour; any raw `px` outside a media query; padding, margin and gap not from the spacing scale; font size, line height, weight, tracking or radius not from their scale; an undefined `var()`. Site CSS: its raw hex and raw px counts may not grow past `scripts/token-baseline.json`. | CI, `web` job |
| `node scripts/check-contrast.mjs` | Any token pair below its minimum, in either theme (table below), and a stale table in this file. | CI, `web` job |
| `node scripts/check-ui-tokens.mjs` | In headless Chrome (the same harness and API stub as the console check), on all 21 admin screens and states (demo, real admin, empty, error, drawers, palette, phone menu) at 390, 768 and 1440 px, light and dark: page-level horizontal overflow, clipped or spilling text, an icon that renders at 0 px, a tap target under 44 x 44 px on phone (counting the transparent hit area), layout shift above 0.01, and any computed font size and line height pair, weight, padding, gap, radius or border width that is off the scale. | CI, `web` job |

The marketing pages predate this system. Their stylesheets are ratcheted, not
strict: the counts in `scripts/token-baseline.json` can only go down
(`node scripts/check-tokens.mjs --update` lowers them after a clean-up).

## Colour

Every neutral is a pure grey (R = G = B). There is no blue or green tint in any
neutral, in either theme. Status colours carry hue; they are never used as large
opaque blocks.

### Neutrals

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ui-page` | `#f5f5f5` | `#000000` | Page background |
| `--ui-card` | `#ffffff` | `#000000` | Cards, sidebar, table header |
| `--ui-raised` | `#ffffff` | `#0a0a0a` | Popovers, menus, drawer, sheets, palette |
| `--ui-hover` | `#f5f5f5` | `#0f0f0f` | Row and item hover |
| `--ui-selected` | `#f0f0f0` | `#141414` | Selected row, active nav item |
| `--ui-track` | `#f5f5f5` | `#0a0a0a` | Segmented control and tab track |
| `--ui-segment` | `#ffffff` | `#141414` | The active segment or tab (the raised pill) |
| `--ui-border` | `#e5e5e5` | `#262626` | Card borders, dividers, decorative outlines |
| `--ui-border-raised` | `#e5e5e5` | `#333333` | Raised surfaces, the active segment |
| `--ui-border-control` | `#808080` | `#6b6b6b` | Form controls (inputs, search, checkboxes, textareas) |
| `--ui-text` | `#0a0a0a` | `#fafafa` | Primary text |
| `--ui-text-2` | `#525252` | `#b3b3b3` | Secondary text |
| `--ui-text-3` | `#6b6b6b` | `#8c8c8c` | Tertiary text, placeholders, meta lines |
| `--ui-primary` | `#0a0a0a` | `#fafafa` | Primary button fill, active nav notch |
| `--ui-on-primary` | `#ffffff` | `#0a0a0a` | Text on `--ui-primary` |
| `--ui-focus` | `#2563eb` | `#60a5fa` | Focus ring |
| `--ui-backdrop` | `rgb(0 0 0 / 0.32)` | `rgb(0 0 0 / 0.64)` | Behind drawers, sheets and the palette |

The site palette uses the same greys: `--bg` `#fafafa` / `#000000`, `--surface`
`#f0f0f0` / `#141414`, `--ink` `#0a0a0a` / `#fafafa`, `--muted` `#5c5c5c` /
`#b3b3b3`, `--border` `#e5e5e5` / `#262626`. Dark mode is pure black on every
page, and `<meta name="theme-color">` is `#000000` in dark (the static tag
follows the OS, and `theme.ts` updates it when someone picks a theme by hand).

### Status

Each status has one hue. Its tint is that hue at 14% alpha, the same token in
both themes, so a pill reads correctly on any surface it lands on (a hovered or
selected row included). Only the text colour changes between themes.

| Status | Tint (both themes) | Text, light | Text, dark | Dot, light | Used by |
|---|---|---|---|---|---|
| success | `rgb(74 222 128 / 0.14)` | `#0b6b3a` | `#4ade80` | `#22c55e` | Verified, approved, completed, growth deltas |
| warning | `rgb(251 191 36 / 0.14)` | `#8a4100` | `#fbbf24` | `#f59e0b` | Pending, submitted, admin role |
| review | `rgb(167 139 250 / 0.14)` | `#6d28d9` | `#a78bfa` | `#8b5cf6` | In review, ongoing |
| danger | `rgb(248 113 113 / 0.14)` | `#b42318` | `#f87171` | `#ef4444` | Rejected, cancelled, errors |
| sample | `rgb(45 212 191 / 0.14)` | `#0b5e66` | `#2dd4bf` | (no dot: chips only) | Sample chip, demo scope |
| info | `rgb(96 165 250 / 0.14)` | `#1d4ed8` | `#60a5fa` | `#3b82f6` | Planned, guide role, cities |
| neutral | `rgb(0 0 0 / 0.06)` / `rgb(255 255 255 / 0.1)` | `--ui-text-2` | `--ui-text-2` | `#808080` / `#8c8c8c` | Counts, pending and open numbers, roles |

In dark mode the dot uses the text colour. Pending and open counts always use
the neutral pill, never success green: a waiting queue is not good news.

## Contrast

Computed from the tokens by `scripts/check-contrast.mjs`, never eyeballed. Each
row reports the worst surface the pair can appear on (page, card, raised, row
hover, row selected, active segment), with translucent tints composited over it first. CI fails
on any miss and on this table going stale.

<!-- contrast:start -->
| Pair | Min | Light (worst surface) | Dark (worst surface) |
|---|---:|---|---|
| Body text `--ui-text` | 7:1 | 17.37:1 pass (#0a0a0a on #f0f0f0, selected) | 17.65:1 pass (#fafafa on #141414, selected) |
| Secondary text `--ui-text-2` | 4.5:1 | 6.86:1 pass (#525252 on #f0f0f0, selected) | 8.79:1 pass (#b3b3b3 on #141414, selected) |
| Tertiary / placeholder `--ui-text-3` | 4.5:1 | 4.68:1 pass (#6b6b6b on #f0f0f0, selected) | 5.48:1 pass (#8c8c8c on #141414, selected) |
| Primary button text `--ui-on-primary` on `--ui-primary` | 7:1 | 19.80:1 pass (#ffffff on #0a0a0a, primary) | 18.97:1 pass (#0a0a0a on #fafafa, primary) |
| Site body `--ink` on `--bg` / `--surface` | 7:1 | 17.37:1 pass (#0a0a0a on #f0f0f0, surface) | 17.65:1 pass (#fafafa on #141414, surface) |
| Site muted `--muted` on `--bg` / `--surface` | 4.5:1 | 5.87:1 pass (#5c5c5c on #f0f0f0, surface) | 8.79:1 pass (#b3b3b3 on #141414, surface) |
| neutral: `--ui-text-2` on `--ui-neutral-tint` | 4.5:1 | 6.01:1 pass (#525252 on #e2e2e2, selected) | 6.71:1 pass (#b3b3b3 on #2c2c2c, selected) |
| success: `--ui-success` on `--ui-success-tint` | 4.5:1 | 5.41:1 pass (#0b6b3a on #d9ede0, selected) | 8.03:1 pass (#4ade80 on #1c3023, selected) |
| warning: `--ui-warning` on `--ui-warning-tint` | 4.5:1 | 6.13:1 pass (#8a4100 on #f2e9d3, selected) | 8.28:1 pass (#fbbf24 on #342c16, selected) |
| review: `--ui-review` on `--ui-review-tint` | 4.5:1 | 5.58:1 pass (#6d28d9 on #e6e2f1, selected) | 5.50:1 pass (#a78bfa on #292534, selected) |
| danger: `--ui-danger` on `--ui-danger-tint` | 4.5:1 | 5.09:1 pass (#b42318 on #f1dede, selected) | 5.48:1 pass (#f87171 on #342121, selected) |
| sample: `--ui-sample` on `--ui-sample-tint` | 4.5:1 | 6.06:1 pass (#0b5e66 on #d5ece9, selected) | 7.63:1 pass (#2dd4bf on #182f2c, selected) |
| info: `--ui-info` on `--ui-info-tint` | 4.5:1 | 5.29:1 pass (#1d4ed8 on #dce6f1, selected) | 5.84:1 pass (#60a5fa on #1f2834, selected) |
| success text `--ui-success` on surfaces (errors, timeline) | 4.5:1 | 5.80:1 pass (#0b6b3a on #f0f0f0, selected) | 10.57:1 pass (#4ade80 on #141414, selected) |
| warning text `--ui-warning` on surfaces (errors, timeline) | 4.5:1 | 6.50:1 pass (#8a4100 on #f0f0f0, selected) | 11.04:1 pass (#fbbf24 on #141414, selected) |
| review text `--ui-review` on surfaces (errors, timeline) | 4.5:1 | 6.23:1 pass (#6d28d9 on #f0f0f0, selected) | 6.77:1 pass (#a78bfa on #141414, selected) |
| danger text `--ui-danger` on surfaces (errors, timeline) | 4.5:1 | 5.77:1 pass (#b42318 on #f0f0f0, selected) | 6.66:1 pass (#f87171 on #141414, selected) |
| sample text `--ui-sample` on surfaces (errors, timeline) | 4.5:1 | 6.56:1 pass (#0b5e66 on #f0f0f0, selected) | 9.90:1 pass (#2dd4bf on #141414, selected) |
| info text `--ui-info` on surfaces (errors, timeline) | 4.5:1 | 5.88:1 pass (#1d4ed8 on #f0f0f0, selected) | 7.25:1 pass (#60a5fa on #141414, selected) |
| warning column title `--ui-text` on `--ui-warning-tint` | 7:1 | 18.38:1 pass (#0a0a0a on #fef6e0, card) | 16.38:1 pass (#fafafa on #231b05, card) |
| review column title `--ui-text` on `--ui-review-tint` | 7:1 | 17.49:1 pass (#0a0a0a on #f3effe, card) | 17.38:1 pass (#fafafa on #171323, card) |
| success column title `--ui-text` on `--ui-success-tint` | 7:1 | 18.20:1 pass (#0a0a0a on #e6faed, card) | 16.51:1 pass (#fafafa on #0a1f12, card) |
| danger column title `--ui-text` on `--ui-danger-tint` | 7:1 | 17.26:1 pass (#0a0a0a on #feebeb, card) | 17.48:1 pass (#fafafa on #231010, card) |
| Form control border `--ui-border-control` | 3:1 | 3.47:1 pass (#808080 on #f0f0f0, selected) | 3.46:1 pass (#6b6b6b on #141414, selected) |
| Focus ring `--ui-focus` | 3:1 | 4.54:1 pass (#2563eb on #f0f0f0, selected) | 7.25:1 pass (#60a5fa on #141414, selected) |
<!-- contrast:end -->

## Typography

The existing font stack, no new web font: Inter (`--font-sans`) for all UI text,
JetBrains Mono (`--font-mono`) for sample references and short ids. Every number,
count, date, time and id uses `font-variant-numeric: tabular-nums`. Only three
weights exist: 400, 500 and 600.

| Role | Size / line height | Weight, tracking | Elements |
|---|---|---|---|
| Label | 11 / 16 (`--text-label`) | 600, uppercase, +0.04em | Sidebar group labels, drawer section titles, count badges, milestone badges, the `⌘K` key |
| Caption | 12 / 16 (`--text-caption`) | 400 or 500 | Pills and chips, table header cells, phone row second line, KPI footnote, timestamps, tooltips, the pager |
| Dense | 13 / 20 (`--text-dense`) | 400 or 500 | Table cells, buttons, inputs, tabs and segments, breadcrumbs, the demo banner, menu items, drawer facts, KPI label |
| Body | 14 / 20 (`--text-body`) | 400 or 500 | Default text, page lead, nav items, phone row first line (500), timeline steps, palette options, card list rows |
| Section title | 16 / 24 (`--text-title`) | 600 | Card titles, drawer title, phone top bar title |
| Page title | 20 / 28 (`--text-page`) | 600, -0.01em | The page `h1` |
| KPI number | 28 / 36 (`--text-kpi`) | 600, -0.02em | KPI values |

One role per size: no other size exists in the console.

## Spacing

A 4 px grid. The scale is the only set of values allowed for padding, margin and
gap:

| Token | `--sp-1` | `--sp-2` | `--sp-3` | `--sp-4` | `--sp-5` | `--sp-6` | `--sp-8` | `--sp-10` | `--sp-12` | `--sp-16` |
|---|---|---|---|---|---|---|---|---|---|---|
| px | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 |

Layout spacing tokens are aliases of the scale: `--ui-page-pad` 32 (16 on phone),
`--ui-card-pad` 20 (16 on phone), `--ui-card-gap` 16 between cards,
`--ui-section-gap` 24 between page sections.

The marketing pages keep their own older `--space-1`...`--space-10` scale
(it has 96 and 144 for section rhythm) until they move over.

## Radius

| Token | px | Used for |
|---|---|---|
| `--radius-sm` | 6 | Chips, `kbd`, checkboxes, tooltips, segments inside a track |
| `--radius-md` | 8 | Buttons, inputs, nav items, menu items, the demo banner, kanban column headers |
| `--radius-lg` | 12 | Cards, KPI cards, kanban cards, popovers, the palette |
| `--radius-xl` | 16 | Drawer and bottom sheets (top corners on phone) |
| `--radius-full` | 999 | Pills, count badges, avatars, the drag handle |

## Layout

| Token | Value |
|---|---|
| `--ui-sidebar` | 248 px (64 px rail when collapsed, and always between 768 and 1023 px) |
| `--ui-topbar` | 56 px |
| `--ui-page-pad` | 32 px desktop, 16 px phone |
| `--ui-content-max` | 1280 px |
| `--ui-card-pad` | 20 px desktop, 16 px phone |
| `--ui-card-gap` | 16 px |
| `--ui-section-gap` | 24 px |
| `--ui-drawer` | 480 px wide on desktop and tablet |

Breakpoints: phone below 768 px (bottom sheets, list rows instead of tables, no
sidebar), tablet 768 to 1023 px (sidebar rail), desktop from 1024 px. Columns
marked low priority hide below 1280 px so tables never scroll sideways.

## Sizes and touch

| Token | Value | Used for |
|---|---|---|
| `--ui-control-h` | 32 px desktop, 40 px phone | Buttons, inputs, segmented tracks, icon buttons, nav items |
| `--ui-row-head` | 40 px | Table header row, kanban column header |
| `--ui-row` | 48 px | Table row, card list row |
| `--ui-row-phone` | 64 px minimum | Phone list row (two lines: 20 + 4 + 16, plus 12 + 12 padding) |
| `--ui-tap` | 44 px | Minimum tap target on phone; smaller visuals extend their hit area with a transparent `::before` |
| `--ui-pill-h` | 20 px | Pills and chips |
| `--ui-badge-h` | 16 px | Count badges |
| `--ui-icon-sm` / `--ui-icon-md` | 16 / 20 px | Inline icons / nav icons |
| `--ui-icon-stroke` | 1.5 px | Every icon, at every size (`vector-effect: non-scaling-stroke`) |

Every other size token, for completeness:

| Token | Value | Used for |
|---|---|---|
| `--ui-rail` | 64 px | Collapsed sidebar (and every tablet) |
| `--ui-palette` | 560 px | Command palette width |
| `--ui-menu-min` | 192 px | Popover menu minimum width |
| `--ui-kanban-col-min` | 264 px | Kanban column minimum width |
| `--ui-kanban-card-min` | 148 px | Kanban card minimum height |
| `--ui-facts-label` | 112 px | Label column of a drawer's fact list |
| `--ui-search-min` | 240 px | Search field and the top-bar search button |
| `--ui-tip-max` | 240 px | Tooltip maximum width |
| `--ui-cell-max` | 240 px | A subject cell's maximum width in a table |
| `--ui-avatar` / `--ui-logo` | 24 / 32 px | Initials avatar / logo mark (both 1:1) |
| `--ui-dot` | 6 px | Status dot |
| `--ui-check` | 16 px | Checkbox |
| `--ui-step` | 24 px | Timeline marker |
| `--ui-notch-w` / `--ui-notch-h` | 2 / 16 px | Active nav notch |
| `--ui-handle-w` / `--ui-handle-h` | 36 / 4 px | Bottom-sheet drag handle |
| `--ui-banner-phone` | 40 px | Maximum height of the phone demo banner |
| `--ui-skeleton-h` | 12 px | Loading placeholder bar |
| `--ui-border-w` | 1 px | Every border |
| `--ui-focus-w` / `--ui-focus-offset` | 2 / 2 px | Focus ring |

Icons: one set, drawn on a 24 px grid with round caps and joins
(`apps/web/src/admin/icons.tsx`, which re-exports the few shared glyphs from
`components/icons.tsx`).

## Borders and elevation

Borders are always 1 px (`--ui-border-w`). Dark mode uses borders only, never
shadows. Light mode has exactly two shadow levels: `--ui-shadow-card`
(`0 1px 2px rgb(0 0 0 / 0.05)`) for cards and the active segment, and
`--ui-shadow-pop` (`0 8px 24px rgb(0 0 0 / 0.08), 0 2px 4px rgb(0 0 0 / 0.04)`)
for popovers, menus, the palette, the bulk bar and drawers.

## Motion

`--dur-quick` 120 ms for hover and press, `--dur-sheet` 200 ms for drawers and
sheets, `--ease-ui` ease-out. With `prefers-reduced-motion: reduce` (or the
site's reduced-motion toggle) both are 0 ms: things appear in their final state.

## Focus

Every interactive element shows a 2 px ring (`--ui-focus-w`) with a 2 px offset
(`--ui-focus-offset`) on `:focus-visible`, in `--ui-focus`. The ring is at least
3:1 against every surface it can sit on (table above).

Two documented exceptions, both still a 2 px `--ui-focus` ring: the command
palette's search field sits flush with the palette's rounded edge, so its ring
is drawn inside the field (offset -2 px) instead of being clipped; and a kanban
card's title button covers the whole card, so the ring is drawn around the card.
Opening a drawer, sheet or the palette moves focus to the dialog itself, or to
the field marked `data-autofocus` (the palette input, a reject note), so no ring
shows before anything is used.

## Aspect ratios

Avatars and the logo mark are 1:1 (`aspect-ratio: 1`, fixed width and height,
`flex: none`), so they never stretch or squash. The logo mark is the ROAAMM mark
(the compass ring and route from the favicon) at 32 x 32 px. KPI cards in one
row share one height (grid rows stretch), and every row inside a KPI card has
a fixed height whether its data has arrived or not, so nothing moves when it
does. Kanban cards share a minimum height (`--ui-kanban-card-min`).

## Components

**Pill** (status): 20 px high, 8 px side padding, full radius, caption text
(500), a 6 px dot in the status colour, tint fill. Always has text; colour is
only a hint. **Chip** (role, sample, city): same, 6 px radius, no dot.

**Count badge**: 16 px high, label text (600), neutral tint.

**Button**: 32 px (40 on phone), 8 px radius, 12 px side padding, dense text
(500). Primary (`--ui-primary`), secondary (card fill and border), ghost, and
danger (danger tint and text).

**Segmented control and tabs**: a `--ui-track` well with 4 px padding; the
active segment is a soft raised pill (card fill, `--ui-border-raised`, the card
shadow in light mode). Never a solid black block.

**Table**: one component (`DataTable`) for every list, so every table follows
the same alignment rule: the first column starts at the card padding (20 px).
One column (the row header) absorbs the spare width and truncates with an
ellipsis; cells never wrap. Below 1280 px, low-priority columns step aside, a
subject cell is capped at `--ui-cell-max` (240 px) and row menu buttons show
their icon only (the label stays for screen readers).
Header row 40 px, rows 48 px, caption text in the header, dense text in cells.
Rows that open a drawer have a hover fill, a pointer cursor and a trailing
chevron. Tables with bulk actions show a checkbox column on every row; for the
demo admin those checkboxes are shown but disabled, with a tooltip.

**Phone list row**: replaces the table below 768 px. Line 1: name or title
(body, 500) with the status pill on the right. Line 2: at most two items
separated by a dot (caption, tertiary). A trailing chevron. 64 to 72 px high.

**Drawer and sheet**: one component. Desktop and tablet: a 480 px panel on the
right. Phone: a full-height bottom sheet with 16 px top corners, a drag handle
(drag down to close) and a sticky action bar that respects the safe-area
insets. The phone menu is the same sheet, with 44 px rows.

**Demo banner**: the one page-level read-only indicator. Desktop: a calm
bordered strip. Phone: one line, at most 40 px. Disabled actions keep their
normal label and explain themselves in a tooltip on hover, focus and tap
(`aria-disabled` plus `data-tip`, described for screen readers too).

**Empty and error states**: an icon in a 40 px circle, one line of text, and a
retry button for errors. Footers count what is there: "0 users", never
"No rows of 0".
