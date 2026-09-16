# Curated Exchange — Design Spec (Step 1 source of truth)

Locked visual source for the frontend rebuild. Pages keep current
Industrial Premium rendering until later stages recompose them; all new
work consumes the `--ce-*` tokens and `ce-*` classes defined here.

## Palette / material

Warm-paper light system. Surfaces: `--ce-paper #f6f4ee` (page),
`--ce-card #fffdf9`, `--ce-well #efebe1` (media wells),
`--ce-soft #faf7f0`. Ink: `--ce-ink #1a1e1c`, `--ce-text #232a27`,
`--ce-muted #5d6a64` (body text on paper must stay ≥ 4.5:1).
Borders: `--ce-border #e3dcc9`, `--ce-hairline #ece5d3`.
Brand: `--ce-brand #0b3b39` (CTA fill, paper text), `--ce-brand-ink #072825`.
Highlight (rare): `--ce-highlight #ffce32` — reserved for single accents,
never primary CTA fill.
Semantics: success `#0c6b3f` / bg `#e6f2ea`, warning/amber `#b45309` /
bg `#fdf3e3` (time-only signal), danger `#b3261e` / bg `#fdecea`,
auction `#5a2ea6` / bg `#f4effe`, info `#0b3b39` / bg `#e9f0ee`,
neutral bg `#efe9da`.
Elevation: `--ce-shadow-card 0 1px 2px rgb(26 30 28 / .06)`,
`--ce-shadow-float 0 16px 40px rgb(26 30 28 / .14)`. Borders over shadows.

## Typography

Display serif stack:
`Fraunces, "Iowan Old Style", Georgia, "Times New Roman", serif`
(sophisticated grotesque fallback chain — no webfont dependency; system
serif renders until a licensed display face is procured).
UI sans: `Inter, ui-sans-serif, system-ui, sans-serif` (unchanged).
Scale: `--ce-display: clamp(2.5rem, 1.6rem + 4vw, 3.5rem)` (page/hero only),
`--ce-h1: 2rem`, `--ce-h2: 1.375rem`, `--ce-h3: 1.0625rem`,
`--ce-body: 0.9375rem/1.5`, `--ce-small: 0.8125rem`,
`--ce-micro: 0.6875rem` (uppercase, 0.06em tracking for eyebrow/meta).
Prices, bids, countdowns, table numerals: `tabular-nums` always
(`.ce-tnum`). Headlines sentence-case, leading 1.05–1.15.

## Spacing / layout

Scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 / 96
(`--ce-1 … --ce-24`). Containers: storefront `--ce-container: 76rem`,
reading `--ce-narrow: 44rem`, admin `--ce-wide: 88rem`, gutter `1rem`,
section gap `2rem` (`--ce-section`). Grid: 12-col editorial;
lists use `.ce-grid` (auto-fill, min 15rem) until page recompositions.
Breakpoints (plain-CSS, kept in sync by comment): `1024px / 640px`
(new); legacy `1150/700/420` remain for old classes.

## Radii

`--ce-r-control: .5rem`, `--ce-r-card: .75rem`,
`--ce-r-panel: 1rem`, `--ce-r-pill: 999px`, media well `.5rem` inner.

## Buttons

Pine filled primary (paper text), quiet outline secondary, ghost tertiary,
danger outline→fill on hover, sell/accent uses pine (highlight never fills
large targets). `min-height 2.75rem` (44px), padding `.625rem 1.25rem`,
radius control, weight 650. `sm` variant 2.25rem. Disabled: reduced opacity
+ `not-allowed`. Focus ring shared (§ a11y). Bid/pay CTA maps to primary.

## Inputs / forms

Label (13px, 600) + control + hint/error slots (`.ce-field`).
Controls: paper-card bg, 1px border, radius control, `min-height 2.75rem`,
padding `.625rem .875rem`; focus = 2px brand ring + border-brand.
Error: danger text + `aria-describedby`; ok: success text. Numeric/money
inputs default `tabular-nums`. Validation logic unchanged
(`rupeesToMinor`, sell/shared.js, backend ceilings).

## Cards / surfaces

`.ce-card`: card bg, hairline border, radius card, padding 20–24px,
`shadow-card`. Variants: `.ce-card--soft`, `.ce-card--warm`,
`.ce-card--flat` (borderless well). Media wells (`.ce-media`) use
`--ce-well`, 4:3, inner radius. Current `.card/.listing-card/.co-card`
etc. migrate in later stages; untouched in Step 1.

## Pills

One registry (`pillFor`), always label + color. Mapping (frozen values):
success/active/paid/delivered/completed/resolved → green;
warning/pending/ending/awaiting → amber; info/sold/shipped/reserved/
in-progress/under-review → pine/teal; danger/cancelled/failed/expired/
rejected/removed → red; auction → purple; neutral default.
Legacy `.status-pill/.status-*` (offer tables) deprecated; keep rendering
until migration.

## Modal / sheet

Centered dialog ≤32rem, card bg, radius panel, float shadow; overlay
`rgb(26 30 28 / .5)`. ≤640px becomes bottom sheet (full-width, top radius).
Shell owns focus-trap + autofocus + Escape + focus-return + `aria-modal`.
Per-modal `busy` + copy + payloads unchanged.

## Tabs / tables / states

Tabs: underline indicator, roving tabindex, arrow keys, `aria-selected`.
Tables: sticky header, 13px data, right-aligned tabular numerals,
row hover, scroll wrapper ≤640px, empty/error row slots. States: skeleton
shimmer (geometry-matched, motion-gated), loading `role=status`, errors
`role=alert` + retry, empty (title + action), notice bar dismissible.

## Price / countdown

`Price`: wraps `formatPrice` (₹ + en-IN, major units in, display only;
minor→major conversion documented at call site, never inside formatter).
`Countdown`: thresholds neutral >24h / amber <24h / "ending soon" <2h
(existing `ENDING_SOON/URGENT_MS` kept), tabular timer, `aria-live`
polite, tick without layout shift, frozen at zero ("Auction ended").

## Focus / motion

Focus: `:focus-visible` 2px `--ce-brand` ring + 2px offset, on all
interactives (never removed). Motion: `--ce-d1 150ms / --ce-d2 250ms /
--ce-d3 300ms`, `ease-out`; `prefers-reduced-motion: reduce` disables
shimmer/zoom/smooth-scroll globally (extend existing kill-switch).

## Industrial Premium → Curated Exchange

Keeps: deep-teal brand anchor, status-semantic idea, spacing/radii scales,
focus-visible + reduced-motion practice, validation + error-copy patterns.
Drops: cool-grey canvas, yellow-filled CTAs, letter-art media, floating-pill
header treatment, generic dense grid, per-file pill maps, dual admin theme.
