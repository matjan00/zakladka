---
name: Zakładka — Czytelnia
description: A Polish reading log set in a grand university reading room — mahogany panelling, a green banker's lamp over a leather desk, brass call numbers, ex-libris bookplates and card-index cards. Day and a true night mode ("czytelnia nocą").
colors:
  wall: "#E8E2D4"
  wall-sunk: "#DDD5C4"
  leaf: "#F7F3E9"
  slip: "#F3EDE0"
  ink: "#1D1813"
  ink-2: "#4D4439"
  ink-3: "#675D4D"
  rule: "#CFC4AE"
  rule-strong: "#B3A68C"
  mahogany: "#4A2317"
  mahogany-2: "#5F2F1F"
  mahogany-deep: "#2E140C"
  on-mahogany: "#F0E2C6"
  on-mahogany-2: "#CDB497"
  desk-leather: "#23402E"
  on-desk: "#EFE5CB"
  on-desk-2: "#C2CCB1"
  brass: "#A9853F"
  brass-hi: "#DEC07A"
  brass-lo: "#7A5D26"
  on-brass: "#23170A"
  lamp-glass: "#1E6A44"
  lamplight: "#F4D58A"
  link: "#1E6A44"
  stamp-violet: "#4B3A86"
  ok: "#2F6B3A"
  warn: "#8A560C"
  bad: "#A3322A"
  night-wall: "#110B09"
  night-leaf: "#1B1310"
  night-ink: "#ECE0C8"
  night-ink-2: "#BFAF95"
  night-ink-3: "#8F806A"
  night-mahogany: "#24110B"
  night-desk: "#11241A"
  night-brass: "#C2A05A"
  night-lamp-glass: "#2B8A5A"
  night-link: "#7FC79D"
  night-stamp: "#A99BE0"
typography:
  display:
    fontFamily: "Marcellus, Alegreya, Georgia, serif"
    fontSize: "2.125rem"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "0.005em"
  headline:
    fontFamily: "Marcellus, Alegreya, Georgia, serif"
    fontSize: "1.3125rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.01em"
  title:
    fontFamily: "Alegreya, Georgia, serif"
    fontSize: "1.3125rem"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Alegreya, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.42
  reading:
    fontFamily: "Alegreya, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Marcellus, Alegreya, Georgia, serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.14em"
rounded:
  book: "1px 3px 3px 1px"
  control: "4px"
  card: "6px"
  sheet: "12px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  gutter: "18px"
components:
  button-primary:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.on-brass}"
    rounded: "{rounded.control}"
    height: "46px"
  button-secondary:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "46px"
  chip-on:
    backgroundColor: "{colors.mahogany}"
    textColor: "{colors.on-mahogany}"
    rounded: "2px"
  seg-on:
    backgroundColor: "{colors.slip}"
    textColor: "{colors.ink}"
    rounded: "2px"
  input:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "46px"
  desk:
    backgroundColor: "{colors.desk-leather}"
    textColor: "{colors.on-desk}"
    rounded: "5px"
    padding: "16px"
  tab-bar:
    backgroundColor: "{colors.mahogany-2}"
    textColor: "{colors.on-mahogany-2}"
    height: "64px"
---

# Zakładka — design system: Czytelnia

Read this before touching any screen. Tokens live in `docs/css/base.css`; never hard-code a colour, font or radius that has a token. The approved reference is direction 4 in `classic-directions.html` (Start and Półka, day and night).

## Overview

**The grand reading room.** The app is an old university reading room in the evening: mahogany panelling round the top of every screen, a green-glass banker's lamp over a green leather desk where the book in hand lies, brass name plates and call numbers, ex-libris bookplates, cloakroom-style brass tokens and the ruled catalogue card. The rest of the room is plain plaster-coloured paper, so long reading and daily logging stay calm: the wood and leather carry the identity in the frame, never in the content.

Signature moves — use them, don't dilute them:
1. **Panelling.** Every screen head (`.screen-head`, the sub-page `.topbar`, Start's `.home-head`, the shelf/year tabs that follow a head, the tab bar) is mahogany with horizontal grain (`--grain`) and a brass rail (`--rail`) along its foot. On wide screens the wood runs to the window edges (`box-shadow` spread + `clip-path`).
2. **The lamp and the desk.** Start hangs the green banker's lamp (`ui.LAMP`) in the panel. The book in hand (`.now-card.desk`), the progress card on the book page and the session timer lie on `.desk`: green leather, a 5 px mahogany frame and a blind-tooled brass line inside. Inside a desk the ink tokens are redefined to the on-desk pair, so any component placed there adapts.
3. **Brass ruler + green bead.** Progress is `ui.thread(p)`: a brass ruler with ticks every 10 %, a polished brass fill and a green glass bead at your page. Set `--k` on `.thread` to move it.
4. **Brass tokens.** The yearly goal is `ui.tokens(done, goal)`: numbered cloakroom tokens, polished brass for each finished book, each with a punched hanging hole.
5. **Library bookcase.** Półka is a mahogany case with side posts and a cornice. Spines are buckram (`ui.BUCKRAM`) with a double band, the title in Alegreya bold and a white call-number label (`ui.callNo(b)`: three letters of the surname + the page count). The book being read has a call slip sticking out of its top. Each shelf board carries a brass label holder with the shelf marks of its first and last book ("LEM – PAR").
6. **Ex-libris bookplate.** A book with no cover gets a bookplate (`ui.jacketHTML`): slip paper in one of six tints, a double ruled frame, "EX LIBRIS", one of four engraved emblems (open book, lamp, laurel, compass star), title and author. Below 50 px it shows only the initial.
7. **Library stamp.** A finished book gets a round violet-ink library stamp (`ui.exlibris(year)`) with the lamp in the centre, pressed on slightly rotated.
8. **Karta katalogowa.** Factual fields are a ruled catalogue card (`.card-fields`); on the book page it is a real card with a red head rule and the rod hole at its foot, and "Sygnatura" is its first row.

## Colors

Strategy: **committed frame, restrained content.** Mahogany owns the top of every screen and the tab bar; green leather owns the one object you are working with; brass marks value (primary action, progress, polished tokens, plates); the lamp's green glass marks *where you are* (active tab, reading bead, focus ring). Paper owns everything you read.

| token | day | night ("czytelnia nocą") | job |
|---|---|---|---|
| `--wall` | `#E8E2D4` | `#110B09` | page ground |
| `--wall-2` | `#DDD5C4` | `#0B0706` | sunk: pills track, empty heat-map cells |
| `--leaf` | `#F7F3E9` | `#1B1310` | raised paper: cards, sheets, inputs |
| `--slip` | `#F3EDE0` | `#D9CFB8` | call slips, active index tab |
| `--ink` / `--ink-2` / `--ink-3` | `#1D1813` / `#4D4439` / `#675D4D` | `#ECE0C8` / `#BFAF95` / `#8F806A` | text (ink-3 ≥ 4.5:1 on wall) |
| `--rule` / `--rule-strong` | `#CFC4AE` / `#B3A68C` | `#37281F` / `#4E3B2E` | hairlines, control borders |
| `--mah` / `--mah-2` / `--mah-d` | `#4A2317` / `#5F2F1F` / `#2E140C` | `#24110B` / `#33190F` / `#170A06` | panelling, bookcase, toasts |
| `--on-mah` / `--on-mah-2` | `#F0E2C6` / `#CDB497` | `#E9D9BA` / `#B9A085` | text on wood |
| `--desk` / `--on-desk` / `--on-desk-2` | `#23402E` / `#EFE5CB` / `#C2CCB1` | `#11241A` / `#E7DBBE` / `#A9B699` | leather desk |
| `--brass` / `--brass-hi` / `--brass-lo` | `#A9853F` / `#DEC07A` / `#7A5D26` | `#C2A05A` / `#E4C680` / `#7E6128` | metal: buttons, rails, plates, tokens |
| `--brass-ink` | `#7A5D26` | `#C9A55A` | brass as text or icon on paper (AA) |
| `--glass` | `#1E6A44` | `#2B8A5A` | lamp glass: active tab, bead, focus, heat map |
| `--link` | `#1E6A44` | `#7FC79D` | links and text buttons |
| `--stamp` | `#4B3A86` | `#A99BE0` | library stamp ink (ex libris; audiobook in stats) |
| `--ok` / `--warn` / `--bad` | `#2F6B3A` / `#8A560C` / `#A3322A` | `#8CC08A` / `#E0A64A` / `#EE8A7E` | states (lighter variants on the desk) |

Night is the natural state of the room, not an inversion: a near-black walnut ground, parchment ink (never white), darker wood, and the lamplight a little stronger (`--glow-a` 30 % against 24 % by day). Covers are dimmed (`--cover-filter: brightness(.86) saturate(.9)`); spines are darkened with `color-mix`, not filters, which stays cheap with 200+ books.

Buckram for spines (`ui.BUCKRAM`): `#2C4A36 #5C2224 #24324F #7E5A33 #231D19 #47525A #3D2A44 #6A3A22`, lettering `#EAD9AC`. Bookplate paper/ink pairs (`PLATES` in `ui.js`): `#F3EDE0/#2A2620`, `#EADFC8/#5C2224`, `#E3E6DA/#2C4A36`, `#ECDCD3/#3D2A44`, `#DCE2E4/#24324F`, `#EFE3C4/#6A3A22`.

App icon (`node scripts/make-icons.cjs` → `docs/icons/*`, `docs/favicon.ico`): a green-glass banker's lamp with a brass rim and column on mahogany, its light falling on a green desk. `theme-color` is mahogany (`#4A2317` by day, `#24110B` at night, set by `theme.js`); the manifest background is `#E8E2D4`.

## Typography

Google Fonts (latin-ext, so every Polish glyph: ą ć ę ł ń ó ś ź ż), kept offline by the service worker's font cache:
- **Marcellus** — engraved brass-plate capitals: screen titles, section headings, labels, plates, call numbers, numerals on tokens and the timer. One weight (400); never fake-bold it.
- **Alegreya** — a literary text face for everything you read or press: body, book titles (700), buttons (700), inputs, quotes, tab labels. Figures are lining (`body { font-variant-numeric: lining-nums }`); counts and tables use `.num` (tabular).

| role | class | spec |
|---|---|---|
| Display (screen title) | `.t-display` | Marcellus 2.125rem/1.08, +0.005em |
| Heading | `h2` | Marcellus 1.3125rem/1.2 |
| Book or card title | `.t-title` | Alegreya 700 1.3125rem/1.15 |
| Book in lists | `.t-book` | Alegreya 700 1.0625rem/1.22 |
| Reading | `.t-read` | Alegreya 1.0625rem/1.55, max 65ch |
| UI body | body | Alegreya 1rem/1.42 |
| Label | `.t-label` | Marcellus 0.75rem uppercase, 0.14em, `--ink-3` |
| Call number | `.sig` | Marcellus 0.6875rem uppercase, 0.12em, 1 px frame |

Placeholders are italic. Headings use `text-wrap: balance`.

## Layout

- One column, max 560 px, gutter 18 px; the panelling and the tab bar run to the window edges.
- Spacing scale on a 4 px base: `--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 24 · `--s6` 32 · `--s7` 48. More space above a heading than below it.
- Every screen starts with the panel: tab screens with `.screen-head` (title + optional icon button), sub-pages with a back `.topbar` that runs into their `.screen-head`, the book page with a `.topbar` only. Shelf and year tabs placed directly after a head sit inside the panel.
- Tab bar 64 px + safe area; targets ≥ 44 px everywhere (chips get an invisible 44 px hit area).
- Półka lays spines out in rows for the screen width (`spinesHTML` in `books.js`: usable width = screen − 54 px); rows use `content-visibility: auto`.

## Elevation & Depth

Physical and lamp-lit. Books carry `--shadow-book`, sheets `--shadow-sheet`, toasts and the update banner `--shadow-lift`. The desk sits in a mahogany frame made of two box-shadow rings plus a soft drop. Panels have side shading and a radial lamp glow; shelf compartments darken at the top under the board above. A card uses a 1 px rule **or** a shadow, never both. The only coloured glow is the lamp's green glass (active tab, reading bead): it is the light source of the room.

## Shapes

Library furniture is square-edged: controls 4 px, cards 6 px, the desk 5 px, sheets 12 px at the top, index tabs, chips and plates 2 px, books 1/3 px (the spine side tighter). Brass tokens and the stamp are the only circles, apart from round icon buttons. Wood and leather are CSS only (`--grain` is three uneven repeating gradients; radial vignettes): no images, no noise filters.

## Components (all in `docs/js/ui.js` + `docs/css/base.css`)

- **Tab bar** `#nav`: mahogany gradient with grain and a brass rail on top; the active tab gets a `--brass-hi` label and the lamp-glass strip glowing under the rail.
- **Buttons**: `.btn` (leaf, 1 px rule-strong), `.btn.primary` (polished brass, dark text), `.btn.ghost`, `.btn.danger`; on a desk the secondary button is transparent with an on-desk border. `.icon-btn` is 44 px round; in a panel it gets a thin brass ring. `.link-btn` is green.
- **Inputs**: `.field` with a `.t-label` above; leaf fill, 1 px rule-strong, italic placeholder; focus = glass border + a soft glass ring.
- **Index tabs** `.seg`: brass-edged tabs; active = slip paper with a 2 px brass inset. In the panel the inactive ones are brass outlines on wood. `.status-seg` on the book page is a 4-column grid.
- **Pills** `.pills` (sunk track, active leaf); **chips** `.chip` (2 px corners; on = mahogany).
- **Desk** `.desk`, **plate** `.plate`, **call number** `.sig`, **ruler** `ui.thread`, **tokens** `ui.tokens`, **lamp** `ui.LAMP`.
- **Cover** `ui.coverHTML(book, size, { ribbon })`: own photo → Open Library → the bookplate underneath; `ribbon: true` adds the call slip (`.cover-slip`).
- **Spine** `ui.spineHTML`; **bookcase** `.bookcase` / `.shelf-row` / `.ledge` + `.holder`.
- **Stamp** `ui.exlibris(year)`, pressed in with `stamp-in` when a book is finished.
- **Sheet**: leaf, 12 px top corners, a 1 px brass top edge, grab handle; swipe-down, Back and Esc close it. **Toast**: mahogany with a brass top line, its action in brass-hi. **Update banner**: a mahogany plate with a brass button. **Confirm**: a small sheet with two buttons.
- **Empty state** `ui.empty()`: an open book with a green bookmark, Marcellus heading, warm Polish copy.
- **Quote share card** (`quoteCanvas` in `quotes.js`): wall paper, a mahogany band with a brass rail, a brass "ZAKŁADKA" plate and the green bead; the quote in Alegreya italic.

## Motion

Restrained. `--ease: cubic-bezier(.2,.8,.2,1)`, 180–260 ms. Authored moments: the lamplight flickers on once when Start opens (`lamp-on`, 900 ms); a spine lifts out of the shelf on press; the bead slides along the ruler; the stamp is pressed onto a finished book. Screen changes cross-fade in 160 ms. `prefers-reduced-motion: reduce` sets transitions and animations to ~0.

## Do's and Don'ts

- Do keep wood, leather and brass in the frame (heads, tab bar, desk, bookcase); content sits on plain paper.
- Do use brass for value (primary action, progress, polished tokens) and the green glass only for location (active tab, bead, focus).
- Do write warm, natural Polish; use `pl(n, 'książka','książki','książek')` for every count.
- Do keep Marcellus for plates, headings, labels and numerals; never for paragraphs or buttons.
- Don't use `--brass` as text on paper; use `--brass-ink`.
- Don't add photographic textures, noise filters, glass/blur, gradient text, emoji icons or another accent colour.
- Don't put a plate above any heading other than Start's single "Czytelnia" room plate (it is the room's name sign from the approved mockup, not a kicker).
- Don't invent data: empty states invite, never fake books. Call numbers are derived from the book itself.

Not canonized: the bookcase's 9 px side posts read to the design detector as "side stripes". They are the case's furniture, kept deliberately and limited to `.bookcase`; never use thick one-sided borders on cards or rows.

## For later builders

- Routes: `docs/js/routes.js` (its header explains `render(container, ctx)`, `onChange`, cleanup). Use `el.onclick = …` (property handlers) on the screen container — the shell resets them on every render.
- Start-screen slots: `docs/js/slots.js` (`cytat-dnia`, `co-dalej`).
- Data: `docs/js/store.js` header. Shared UI: `docs/js/ui.js`. Put feature CSS in its own `docs/css/<feature>.css` and link it in `index.html`; run `node scripts/sync-sw.cjs` (or `release.cjs` when publishing) so the service worker caches it.
- Covers: Open Library `-M.jpg` without `?default=false` — a missing cover comes back as a 1×1 GIF that `ui.js` removes (no console 404s).
- Titles: spines, bookplates, cards and captions show `shortTitle(b.title)`; the book page shows `splitTitle()` (the main title as the display line, the rest as `.book-sub`). Keep the full title in `aria-label`.
- Start header: plate, greeting, then the date under it; the settings button sits top-right beside the lamp. The install offer is a paper label right under the panel (`.install-top`), hidden once installed.
- Icons: `docs/js/icons.js`, one 24 px stroke set (1.75); Start's tab icon is the banker's lamp.
