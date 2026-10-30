# @filspay/ui

FilsPay's shared design system for `apps/web` (merchant dashboard + hosted
checkout) and `apps/admin`. Presentation only: no API calls, no money
arithmetic, no authorization decisions — the apps keep all of that.

Each app imports the styles once (`import "@filspay/ui/styles.css"`) and the
components from `@filspay/ui`.

## Tokens (`src/styles/tokens.css`)

Near-black plum base with soft violet/lavender light, plum-charcoal panels and
soft-white type. Yellow stays FilsPay's brand colour and the colour of primary
actions only; violet, lavender, pink and cyan are decorative (backdrop, charts,
selected states) and never stand in for error/warning/success.

| Role | Token | Value |
|---|---|---|
| Page background | `--fp-bg` | `#0B0A0F` |
| Surface / raised / hover | `--fp-surface` / `--fp-surface-raised` / `--fp-surface-hover` | `#16141C` / `#1E1B26` / `#282433` |
| Text | `--fp-text` / `--fp-text-secondary` / `--fp-text-muted` / `--fp-text-highlight` | `#F2EFF8` / `#BFB9CF` / `#8F899F` / `#F6D7F3` |
| Primary actions, brand | `--fp-accent` / `--fp-accent-hover` | `#F0B90B` / `#F8D12F`, dark text on top |
| Decorative | `--fp-violet` / `--fp-lavender` / `--fp-pink` / `--fp-cyan` | `#8B5CF6` / `#C4B5FD` / `#F0A3D8` / `#3CC8F0` |
| Success / danger / warning / info | `--fp-success` / `--fp-danger(-text)` / `--fp-warning` / `--fp-info` | `#0ECB81` / `#F6465D` (`#FF707F` as text) / `#FFA940` / `#6EA8FF` |

Contrast ratios for each pairing are listed at the top of `tokens.css`.
Radii: 12px controls, 16px nested panels and tiles, 24px cards and dialogs.
Motion is 120–200ms and switched off under `prefers-reduced-motion`.

## Backdrop

`<Backdrop>` (rendered by `AppShell`; `quiet` on sign-in and checkout) is a
fixed, `aria-hidden`, pointer-events-none layer: four soft radial glows and two
sparse dot fields that drift one tile per loop. Compositor-only animation,
paused while the tab is hidden (`html[data-fp-hidden]`), static under reduced
motion, and dimmer and still in the quiet variant.

## Components

`AppShell` (sidebar with grouped nav panels, top bar, mobile drawer, skip link,
banner slot, route fade) · `Backdrop` · `SegmentedControl` (pill time ranges) ·
`Tile`/`Tiles` ·
`NavGroup`/`NavSection` · `AccountMenu` · `PageHeader` · `Card` (`glow` for a
summary card; `tone="caution" | "danger"` + `tag` for money-moving or
destructive sections) ·
`Metric` · `Button`/`buttonClass` · `Field` · `ChipGroup` · `Badge` · `Tabs`/`TabPanel` ·
`Dialog`/`ConfirmDialog`/`Drawer` (focus trapped and restored, Escape closes,
not while busy) · `Alert` · `ToastProvider`/`useToast` · `EmptyState` ·
`Loading`/`Skeleton`/`SkeletonRows` · `CopyButton`/`IdText` · `DetailList` ·
`Icon` (one 24px / 1.75-stroke set drawn for this project) · `Logo`.

Tables use plain `<table class="fp-table">` markup inside `.fp-table-wrap`;
add `fp-table--stack` and `data-label` on cells to turn rows into labelled
cards below 720px. Amount columns use `fp-num` (right-aligned, tabular
numerals).

## Money

Amounts are always integer fils formatted by `@filspay/money` in the app
(`bhd()` → `12.750 BHD`). `splitAmount` only splits that text to style the
unit; it never parses or re-formats the number.
