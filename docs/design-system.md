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
| `node scripts/check-ui-tokens.mjs` | In headless Chrome (the same harness and API stub as the console check), on all 24 admin screens and states (demo, real admin, empty, error, drawers, palette, phone menu, a second Verification tab) at 390, 768 and 1440 px, light and dark: page-level horizontal overflow, clipped or spilling text, an icon that renders at 0 px, a tap target under 44 x 44 px on phone (counting the transparent hit area), layout shift above 0.01, any computed font size and line height pair, weight, padding, gap, radius or border width that is off the scale; not exactly one h1; a drag handle or other small pill-shaped bar outside a dialog from 768 px; KPI numbers in one row on different baselines (phone); the top-bar avatar not ending on the content edge; any Sample chip. Then, on the six table screens at 768, 1024 and 1440 px, it clicks every tab and filter option and fails if any header cell moves, and fails if an Audit Subject cell is clipped at 1024 or 1440 px. | CI, `web` job |

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
| `--ui-primary` | `#0a0a0a` | `#fafafa` | Primary button fill, tooltip fill |
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
count, date, time and id uses `font-variant-numeric: tabular-nums`.
Until Inter arrives, text is drawn in "Inter Fallback" (`styles/fonts.css`):
Arial, or Liberation Sans on Linux, scaled per weight with `size-adjust` to
Inter's measured widths, so the font swap moves nothing. Only three
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
| `--ui-kanban-card-min` | 148 px | Width of the scope chip placeholder while the session loads |
| `--ui-icon-btn` | 32 px | Icon-only buttons that stay 32 px on phones: the top bar's buttons and avatar, the ⋯ row menu (44 px tap area on phones) |
| `--ui-facts-label` | 112 px | Label column of a drawer's fact list |
| `--ui-search-min` | 240 px | Search field and the top-bar search button |
| `--ui-tip-max` | 240 px | Tooltip maximum width |
| `--ui-avatar` / `--ui-logo` | 24 / 32 px | Initials avatar / logo mark (both 1:1) |
| `--ui-dot` | 6 px | Status dot |
| `--ui-check` | 16 px | Checkbox |
| `--ui-step` | 24 px | Timeline marker |
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

Two documented exceptions: the command palette's search field holds focus the
whole time the palette is open and sits flush with its rounded edge, so the
field's divider turns `--ui-focus` instead of drawing a square ring inside a
round panel; and a kanban card's title button covers the whole card, so the
2 px ring is drawn around the card.
Opening a drawer, sheet or the palette moves focus to the dialog itself, or to
the field marked `data-autofocus` (the palette input, a reject note), so no ring
shows before anything is used.

## Aspect ratios

Avatars and the logo mark are 1:1 (`aspect-ratio: 1`, fixed width and height,
`flex: none`), so they never stretch or squash. The logo mark is the ROAAMM mark
(the compass ring and route from the favicon) at 32 x 32 px. KPI cards in one
row share one height (grid rows stretch), and every row inside a KPI card has
a fixed height whether its data has arrived or not, so nothing moves when it
does. On phones the KPI cards use short labels (one line in a half-width
card) so every number in a row sits on the same baseline.

## Components

**Pill** (status): 20 px high, 8 px side padding, full radius, caption text
(500), a 6 px dot in the status colour, tint fill. Always has text; colour is
only a hint. **Chip** (role, city, audit subject type): same, 6 px radius,
no dot. Chips are neutral grey unless their colour means something: city chips
are neutral, because blue is reserved for information and links. There is no
Sample chip in the admin console: the demo banner is the one place that says
the data is simulated. (The traveller and guide apps label sample rows with a
Sample chip, because there real and sample rows can sit side by side.) **Verified** is not a chip: a 16 px check in
`--ui-success`, or a muted dash for "not verified", each with an accessible
name.

**Count badge**: 16 px high, label text (600), neutral tint. It looks the same
on a selected tab or segment.

**Icon button**: 32 px (`--ui-icon-btn`) square, transparent, 16 px glyph. The
⋯ menu on board cards and list rows is one; for the demo admin it is disabled
with the tooltip "Demo is read-only".

**Button**: 32 px (40 on phone), 8 px radius, 12 px side padding, dense text
(500). Primary (`--ui-primary`), secondary (card fill and border), ghost, and
danger (a `--ui-danger` outline and text, tint on hover). Only the primary
action is filled. Unavailable buttons of every variant look the same: a flat
`--ui-track` fill, `--ui-border` and tertiary text.

**Action bar** (drawer footer): the primary action last, at the right end;
then danger (Reject), then secondary (Move to review); Cancel replaces them
during a confirm step and sits left of the confirm button. Right-aligned from
768 px; on phones an equal-width row. For the demo admin a one-line "Demo is
read-only" note sits above the buttons, which keep their tooltip.

**KPI delta**: one rule. The chip is green (`--ui-success`) only for a good
change: a growth number (users, trips) with more new items in the last 30
days than in the prior 30 days. Everything else is neutral grey: queues
(pending verifications, open applications, where more is not good news), no
change, fewer, and none. The footnote compares with the prior period in words:
"vs 2 in the previous 30 days" (desktop), "vs 2 prior 30 days" (phone).

**Segmented control and tabs**: a `--ui-track` well with 4 px padding; the
active segment is a soft raised pill (card fill, `--ui-border-raised`, the card
shadow in light mode). Never a solid black block. Below 1024 px every tab row
and segmented control fills the row with equal segments (as wide as the search
field below it); if the widest label does not fit, the row scrolls sideways,
fades only the edge that has more (a 16 px fade, so the last label is never
covered), and keeps the selected option in view.

**Table**: one component (`DataTable`) for every list, so every table follows
the same alignment rule: the first column starts at the card padding (20 px).
Each screen has one fixed column template (`table-layout: fixed` and a
`<colgroup>`): every column has a share of the width, and the checkbox, ⋯ and
chevron columns are fixed. The data never sizes a column, so no header moves
when a tab, filter or page changes. A screen with bulk actions reserves its
checkbox column on every tab, even where the checkboxes are not shown. Cells
never wrap; text that really does not fit ends in an ellipsis. Below 1280 px,
low-priority columns are not rendered.
Header row 40 px, rows 48 px, caption text in the header, dense text in cells.
Rows that open a drawer have a hover fill, a pointer cursor and a trailing
chevron. Tables with bulk actions show a checkbox column on every row; for the
demo admin those checkboxes are shown but disabled, with a tooltip.

**Phone list row**: replaces the table below 768 px. Line 1: the name or title
(body, 500) on the whole line (a time may sit at its end). Line 2: the status
pill, then at most two items separated by a dot (caption, tertiary). A
trailing chevron. 64 to 72 px high.

**Kanban**: column headers are a neutral card surface with a coloured status
dot, the title and a count. Cards hold the title with the ⋯ menu, "applicant ·
date" and the city chips (no status pill: the column says it); about 112 px
with a one-line title.

**Drawer and sheet**: one component. Desktop and tablet: a 480 px panel on the
right. Phone: a bottom sheet with 16 px top corners and a drag handle (drag
down to close). The handle is rendered only below 768 px: from 768 px it is
not in the DOM at all, and check-ui-tokens fails if anything fixed sits at
the bottom centre of the viewport with no dialog open. A sheet with a footer
is full height with a sticky action bar that respects the safe-area insets; a
sheet without one hugs its content, at most 85% of the screen. The phone menu
is the same sheet, with 44 px rows. A detail drawer opens with a summary: a
40 px avatar or icon, the name (the dialog's heading), an optional subtitle
(who it belongs to, so a long name never widens a fact), the status pill and
two or three key facts; a long fact (a date range) takes its own full-width
row. Details and the timeline follow, without repeating the summary.

**Page title**: exactly one h1 per page. From 768 px it heads the page; below
768 px the top bar's title is the h1. Below 640 px the page lead is kept for
screen readers only.

**Sidebar**: hover is always subtler than active. Hover: the `--ui-hover`
fill only (text colour and weight unchanged). Active: the `--ui-selected`
fill, full-strength text and weight 500.

**Search field**: one focus ring, on the field (`:focus-within`); the input
inside never draws its own. On phones its border is `--ui-border`, the same
as the segmented controls above it. This is the one form control below the
3:1 border rule: it stays identifiable by its search icon and placeholder,
and its focus ring is 3:1. The command palette shows its "↑ ↓ to move" key
hint only on devices with a keyboard and pointer (not below 768 px or on
touch).

**Demo banner**: the one page-level read-only indicator. Desktop: a calm
bordered strip. Below 1024 px: the short form on one line that never wraps (a
wrap that depends on which font has loaded would shift the page); on phone at
most 40 px high. Disabled actions keep their
normal label and explain themselves in a tooltip on hover, focus and tap
(`aria-disabled` plus `data-tip`, described for screen readers too).

**Empty and error states**: an icon in a 40 px circle, one line of text, and a
retry button for errors. Footers count what is there: "0 users", never
"No rows of 0".
