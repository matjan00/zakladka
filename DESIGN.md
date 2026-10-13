# Zakładka — design system

Read this before touching any screen. Tokens live in `docs/css/base.css`; never hard-code a colour, font or radius that has a token.

## The world in one line

**A Polish publisher's series, bound in cloth.** The app is a clothbound book from a 1960s–70s PIW / Czytelnik series: a deep green bookcloth case (the shell and the tab bar), warm uncoated paper inside (the screens), a vermilion silk ribbon that marks *where you are*, and jackets designed in the Polish school of book graphics — flat ink fields, one bold geometric figure, big confident lettering. Not "cream + serif + terracotta": the cloth green and the jacket inks do real work at page scale.

Signature moves (use them, don't dilute them):
1. **Wstążka (the ribbon).** Vermilion is reserved for location and progress only: the active tab's ribbon hanging from the top edge of the tab bar, reading-progress threads, the current page, the goal ring. Never use `--ribbon` for decoration, errors or generic buttons.
2. **Okładka serii (generated jacket).** A book with no cover gets a designed jacket: colour pair + geometric figure picked by a hash of the title (`ui.coverHTML(book)`), title in Bricolage Grotesque, author in small caps. It must look like a real series jacket.
3. **Grzbiety (spines on the shelf).** Półka shows books as spines standing on a cloth ledge; height/width follow page count; the book being read has the ribbon hanging out of its top.
4. **Ex libris.** Finished books get a round rubber-stamp ex-libris (`ui.exlibris(year)`), slightly rotated, in `--stamp`.
5. **Karta katalogowa.** Factual fields (ISBN, pages, year, format, dates) are set like a library catalogue card: small-caps labels, tabular figures, 1px ruled rows (`.card-fields`).

## Colour

Strategy: **Committed** — cloth green owns the shell (tab bar, Start header band, primary buttons), paper owns the reading surface, jacket inks own the covers, ribbon marks location.

| token | light | dark ("czytanie nocą") | job |
|---|---|---|---|
| `--paper` | `#F3EEE4` | `#14120E` | page ground |
| `--paper-2` | `#E9E2D4` | `#0E0C0A` | sunk areas, inputs, shelf back |
| `--leaf` | `#FBF8F1` | `#1D1A15` | raised surfaces: sheets, cards |
| `--ink` | `#1C1A16` | `#EAE0CB` | primary text |
| `--ink-2` | `#4B453B` | `#BCB19C` | secondary text |
| `--ink-3` | `#6E6759` | `#8E8471` | tertiary, placeholders (≥4.5:1) |
| `--rule` | `#D5CBB9` | `#332D25` | 1px hairlines |
| `--cloth` | `#1F4A40` | `#0F2A24` | bookcloth: tab bar, primary button, header band |
| `--cloth-2` | `#2B5E52` | `#1A3D35` | cloth hover / pressed |
| `--on-cloth` | `#EFE6D2` | `#D8CDB4` | text/icons on cloth |
| `--ribbon` | `#C23E28` | `#E0714F` | location + progress ONLY |
| `--gilt` | `#A9843A` | `#C9A55A` | gold-foil details (spine bands, stars) |
| `--stamp` | `#2C4A8C` | `#8FA8E0` | ex-libris stamp ink, links |
| `--ok` / `--warn` / `--bad` | `#3C6A39` / `#9A6110` / `#A3322A` | `#8CC08A` / `#E0A64A` / `#EE8A7E` | states (library availability etc.) |

Dark mode is a lamp-lit room, not an inversion: warm near-black paper, parchment ink (not white), a deeper cloth, a warmer ribbon. Covers are dimmed (`filter: brightness(.86) saturate(.9)`) so they don't glare.

Jacket inks (covers & spines only, `ui.js` → `JACKETS`): ochre `#C8922A`, vermilion `#C3402A`, cobalt `#2C4A8C`, bottle `#1F4A40`, plum `#5E2B47`, olive `#6B7135`, rose `#D98C78`, slate `#3E4A52`, oxblood `#6E1F22`, sky `#8FB3C4` — each paired with its own lettering colour.

## Type

Fonts (Google Fonts, latin-ext → Polish diacritics; cached by the service worker for offline):
- **Literata** — reading voice: screen titles, book titles, reviews, quotes, big numbers. Variable `opsz` — use high opsz for display.
- **Bricolage Grotesque** — UI voice: nav, buttons, labels, chips, jacket lettering.

| role | class/token | spec |
|---|---|---|
| Display (screen title) | `.t-display` | Literata 600, 2.125rem/1.1, opsz 72, -0.02em |
| Title | `.t-title` / `h2` | Literata 600, 1.375rem/1.2 |
| Book title in lists | `.t-book` | Literata 600, 1.0625rem/1.25 |
| Body / reading | `.t-read` | Literata 400, 1.0625rem/1.6, max 65ch |
| UI | body default | Bricolage 400, 0.9375rem/1.4 |
| Label (apparatus) | `.t-label` | Bricolage 600, 0.6875rem, uppercase small caps, 0.09em tracking, `--ink-3` |
| Numbers | `.num` | tabular lining figures (`font-variant-numeric: tabular-nums lining-nums`) |

Tracking never below -0.03em. Headings `text-wrap: balance`.

## Space, shape, depth

- Spacing scale (4px base): `--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 24 · `--s6` 32 · `--s7` 48. Screen gutter 18px. More space above a heading than below.
- Radii: books `--r-book` 2px 4px 4px 2px (spine side tighter); cards `--r-card` 14px; sheets 22px top; chips/pills only for small controls.
- Elevation: books carry `--shadow-book`; sheets `--shadow-sheet`. Cards use a 1px `--rule` border OR a shadow, never both.
- Tap targets ≥ 44px. Bottom nav 64px + safe area.

## Components (all in `docs/js/ui.js` + `docs/css/base.css`)

- **Tab bar**: cloth, 5 tabs (Start, Półka, Sesja, Cytaty, Statystyki), 1.75px stroke icons; active tab = ribbon hanging from the top edge + full-strength label.
- **Buttons**: `.btn` (leaf, 1px rule), `.btn.primary` (cloth), `.btn.ghost`, `.btn.danger`; `.icon-btn` 44px round.
- **Inputs**: `.field` with `.t-label` label above; sunk `--paper-2` fill, 1px rule bottom-heavy, focus ring `--stamp`.
- **Segmented / tabs**: `.seg` — shelf tabs on Półka use the ribbon under the active segment.
- **Chips**: `.chip` (tags), `.chip.on`.
- **Sheet**: bottom sheet with grab handle, swipe-down + Back closes. **Toast**: ink pill above the tab bar. **Confirm**: small sheet with two buttons.
- **Stars**: `ui.stars(value, {input})` half-star steps, gilt fill.
- **Cover**: `ui.coverHTML(book, size)` → real image (OL/photo) with generated jacket fallback.
- **Empty state**: `ui.empty({title, text, action})` — an open-book line figure + warm Polish copy.
- **Progress**: `.thread` — a 3px ribbon thread on a `--rule` track.

## Motion

Restrained. `--ease: cubic-bezier(.2,.8,.2,1)`, 180–260ms. One authored moment: a spine lifts out of the shelf on press and the sheet rises. Screen changes cross-fade 140ms. `prefers-reduced-motion: reduce` → all transitions ~0, no transforms.

## Do / don't

- Do write warm, natural Polish; use `pl(n, 'książka','książki','książek')` for every count.
- Do let jackets be loud and the paper quiet.
- Don't use the ribbon colour for anything but location/progress.
- Don't add gradients, glass, emoji icons, grain filters, coloured side-borders, or card grids of icon+heading+text.
- Don't put an eyebrow/kicker above headings.
- Don't invent data: empty states invite, never fake books.

## For later builders

- Routes: `docs/js/routes.js` (header explains `render(container, ctx)`, `onChange`, cleanup). Use `el.onclick = …` (property handlers) on the screen container — the shell resets them on every render.
- Start-screen slots: `docs/js/slots.js` (`cytat-dnia`, `co-dalej`).
- Data: `docs/js/store.js` header. Shared UI: `docs/js/ui.js`. Put feature CSS in its own `docs/css/<feature>.css` and link it in `index.html`; run `node scripts/sync-sw.cjs` (or `release.cjs` when publishing) so the service worker caches it.
- Covers: Open Library `-M.jpg` without `?default=false` — a missing cover comes back as a 1×1 GIF that `ui.js` removes (no console 404s).
