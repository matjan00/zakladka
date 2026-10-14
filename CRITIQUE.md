# Zakładka — design critique & audit (impeccable)

DEGRADED: single-context (the critique ran inside a delegated agent; Assessment A and B were done sequentially, A first, without separate sub-agents)

Date: 2026-10-13 · Target: whole app (`docs/`), preview http://localhost:5210 at 375 px, light and dark ("czytanie nocą").
Seed data used for the review: 13 Polish books on all four shelves, 10 reads over the last year, 10 sessions, 8 quotes, goal 20 — all deleted afterwards (database left empty).

## Verdict on design specificity

The app is authored, not generic. The clothbound-series world from DESIGN.md is really there: the cloth header band on Start, the cloth tab bar with the vermilion ribbon, the spines on a cloth ledge, the generated series jackets, the ex libris stamp, the catalogue-card fields, and the library checkout card. Nothing here would fit an unrelated product without changes. The weak spots were **consistency between screens built by different people** and **small typographic and layout defects**, not the concept.

Deterministic scan (`impeccable detect docs`): 4 warnings.
- cream-palette: deliberate; DESIGN.md pins the paper ground. The brief wins. No change.
- side-tab (`.ocr-line.on`, 3 px gilt stripe on the left): breaks the DESIGN.md "no coloured side-borders" rule. **Fixed** (it is now a full hairline outline).
- pulsing-dot (`.dots` while searching): it is tied to a real network request. Kept.
- dark-glow: a false positive. These are the warm neutral book shadows, and dark mode uses black shadows.

## Heuristic scores (before fixes)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Good toasts and progress; Kindle-imported books silently landed on "Przeczytane" |
| 2 | Match with the real world | 3 | Mostly warm Polish; a few clunky lines ("Serii dni z rzędu", "z timerem", "To filtr działa", "Inny tytuł autora, którego cenisz: Władysław Stanisław Reymont") |
| 3 | User control & freedom | 3 | Sheets close by Back, swipe and Esc; undo for quotes; Goodreads dups could only be skipped |
| 4 | Consistency & standards | 2 | Sub-page headers differed (small inline title vs. big display title), the Sesja header "+" did something different from the "+" elsewhere, quote sources repeated on the book page |
| 5 | Error prevention | 3 | Duplicate checks on add; Kindle import created finished books without a read record |
| 6 | Recognition over recall | 3 | Labelled tabs, chips; the status segment cut "Porzucone" off at 375 px |
| 7 | Flexibility & efficiency | 3 | Two-tap common actions; carousel, filters |
| 8 | Aesthetic & minimalist | 3 | Strong; the jacket lettering collided with the "stack" figure, the library rows were noisy without the proxy |
| 9 | Error recovery | 3 | Plain-language errors with next steps |
| 10 | Help & documentation | 3 | Click-by-click Goodreads steps, helpful empty states |
| **Total** | | **29/40** | **Good** (target after fixes: about 33) |

Cognitive load: low (1 failure: the Co dalej mood chips scrolled sideways so options were hidden).

## Priority issues and what was done

**P1 — Kindle import made finished books with no history.** Books created from `My Clippings.txt` were always set to Przeczytane, with no read record, so they never showed up in stats or the yearly goal. *Fixed*: the preview now asks which shelf new books go to (Czytam by default, or Przeczytane). Czytam opens a read that starts on the day of the first highlight. Przeczytane saves a read finished on the day of the last highlight.

**P1 — Goodreads duplicates could only be skipped; the read count was lost.** *Fixed*: `dedupe()` now links each duplicate to the book on the shelf (`matchId`). The preview offers "Uzupełnij brakujące dane", which fills only empty fields (rating, pages, year, publisher, ISBN, review, tags, read count, and the read date when the book has no finished read) and never overwrites. Read Count > 1: Goodreads exports only the last date read, so the app creates one dated read when the date is known and keeps `readCount`. The book page then shows "Czytana 3 razy. Datę znam tylko z ostatniego razu." Covered by new node tests.

**P1 — Status segment on the book page was clipped at 375 px** ("Porzucone" was cut off). *Fixed*: it is now a 4-column grid with balanced two-line wrapping and 48 px targets.

**P1 — Catalogue-card rows were misaligned.** `dt` used `align-self: baseline`, so the label hairlines sat higher than the value hairlines on every card: book page, stats, library contact. *Fixed* in `base.css`, so every screen gets it.

**P2 — Jacket composition defects.** The "stack" figure ran straight through the title and author, and on "diag" jackets the lettering sat on the contrasting triangle. *Fixed*: the stack figure moved to the upper half, and the diag lettering now sits at the top. This is visible on Start, Półka, the book page and "Rok w książkach".

**P2 — The "Czytam teraz" carousel snapped flush to the screen edge** (scroll-snap ignored the gutter). *Fixed* with `scroll-padding-inline`, and the gap below it is tighter.

**P2 — Header and button inconsistency across builders.** *Fixed*:
- Ustawienia and Import z Goodreads now use the same back button plus display title as Co dalej and Biblioteka (rule added to DESIGN.md).
- The ambiguous "+" in the Sesja header is gone; "Dodaj dawną" in the history covers it.
- Progress buttons read "Zapisz stronę" / "Sesja" on both Start and the book page, with no two-line wrapping.

**P2 — Library rows without the proxy were noisy.** Each row showed "NIE SPRAWDZONO", "otwórz katalog, by sprawdzić" and the link. *Fixed*: without the proxy a row shows just the title, the author and "Szukaj w katalogu". The explanatory note was also rewritten in plain Polish.

**P2 — Library and suggestion matcher.** *Fixed*:
- A short local title now matches a catalogue title that starts with it when the author matches ("Wiedźmin" ~ "Wiedźmin. Ostatnie życzenie…").
- A title of two or more words also matches after a series name, so "Wiedzmin Ostatnie zyczenie" is no longer suggested next to an owned "Ostatnie życzenie".
- Open Library suggestions with English titles ("Season of Storms") are dropped even when they carry a Polish ISBN.

**P2 — Contrast (AA).** `--ink-3` measured 4.3:1 on `--paper-2` (placeholders, labels in inputs). It is now `#655E51`, at 4.9:1 or better on every paper. `--warn` was 4.4:1 on paper ("…za planem"); it is now `#8A560C`, about 5.3:1. Dark primary buttons nearly disappeared into dark cards; they now use `--cloth-2`.

**P2 — Touch targets under 44 px.** Fixed for chips (invisible 44 px hit area), the library badge, toast actions, the update banner and "Zmień książkę".

**P3 — Polish copy.** Fixed:
- "Serii dni z rzędu" → "Obecna seria"
- "z timerem" → "w sesjach"
- "To filtr działa…" → "Ten filtr zadziała, gdy…"
- "Dodaj do Chcę przeczytać" → "Dodaj do „Chcę przeczytać”"
- The suggestion reason is now "Ten sam autor co „Chłopi”" (no undeclined full name)
- The estimate reads "Zostało około 8 h 8 min czytania. Skończysz około 6 listopada.", with non-breaking spaces so "s. 133", "6 listopada" and "8 h" never split
- The empty yearly goal no longer says both "Jeszcze nic w tym roku" and "Do celu brakuje 24 książek"

**P3 — Small layout fixes.**
- Session history rows were a run-on line. They now have two lines: the date, then minutes, pages and speed.
- The Co dalej mood chips wrap instead of hiding off-screen.
- The Półka segment fades at the right edge to show it scrolls.
- Quotes on a book's own page no longer repeat the title and author.

**P3 — Delight (book motif, restrained).** When a book is moved to Przeczytane, the ex libris is now pressed onto the cover once: a short stamp-in animation, switched off by reduced motion.

**Console 404.** The only 404 traced was `/favicon.ico`. The browser requests it from the site root, and the local server had none. Added `docs/favicon.ico` (the 192 px icon) and the `.ico` type in `serve.cjs`. After reloading every screen, empty and with data, the console showed no errors. Covers use Open Library without `?default=false`, so they return 200.

## Persona red flags (checked)

- **Mateusz in bed, one thumb, low light (Casey):** primary actions sit in the lower half of the reading card, and dark mode is warm. Fixed: small chips and toast buttons were below 44 px. Open: the shelf search is at the top. That is acceptable, because it is a secondary action.
- **Jordan (first-timer):** the empty states invite well ("Witaj w Zakładce", "Najpierw książka", "Twój zeszyt z cytatami jest pusty"). The no-proxy library copy was too technical ("serwer pośredniczący"). Fixed.
- **Sam (accessibility):** there is a focus ring. Fixed: hidden file inputs and the hidden sort select gave no focus indication; `label.btn:focus-within` and `.sort-btn:focus-within` now show it. Open: the file-picker labels (Goodreads CSV, cover photo, Kindle file) still cannot be reached by keyboard Tab. This is phone-first, so it is left open.

## Left open (not done here)

- The update banner in the local preview overlaps the screen title until it is closed (by design; on the phone it appears only when a new version is waiting).
- Spines in bottle green blend into the cloth ledge; it could use a lighter ledge highlight. This is taste, not a defect.
- Keyboard reachability of file-picker labels (see Sam above).
- Automatic Nekla checks and BN search still need the `books-proxy` deployment (out of scope).

Screenshots of the final state: `screenshots/01-start.png`, `02-polka.png`, `03-ksiazka.png`, `04-cytaty.png`, `05-statystyki.png` (light) and `06-polka-noc.png` (dark).

---

## 2026-10-14 — second pass at real scale

DEGRADED: single-context (run inside a delegated agent; Assessment A and B were done one after the other, without separate sub-agents)

Seed data: the owner's real Goodreads export (193 books) loaded through the app's own importer (file fed into the import screen), plus 5 hand-added books (one with a 100-character Polish title), 9 sessions and 4 quotes. Result: 198 books, 192 on Przeczytane, **133 of them with no read date**, many foreign titles, 39 Open Library covers. Everything was deleted afterwards (database left empty). Checked at 375 px light and dark, and at 1024 px.

Deterministic scan (`impeccable detect`) on the changed files: no findings.

### Heuristic scores (this pass)

| # | Heuristic | Before | After | What moved it |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | — |
| 2 | Match with the real world | 3 | 4 | Undated reads explained, contradictory copy gone |
| 3 | User control & freedom | 3 | 3 | — |
| 4 | Consistency & standards | 3 | 3 | Library rows match the rest |
| 5 | Error prevention | 3 | 3 | — |
| 6 | Recognition over recall | 2 | 3 | The book in hand stands first on a 198-book shelf; list shows the year read |
| 7 | Flexibility & efficiency | 3 | 3 | — |
| 8 | Aesthetic & minimalist | 2 | 3 | Long titles, the double cloth band, library noise |
| 9 | Error recovery | 3 | 3 | — |
| 10 | Help & documentation | 3 | 3 | — |
| **Total** | | **28/40** | **31/40** | |

The earlier pass scored 29→~33 on a 13-book shelf; at the owner's real scale some of those wins did not hold, so this pass starts lower.

### Found and fixed

**P1. Long Polish titles broke four screens.** "Księgi Jakubowe albo Wielka podróż przez siedem granic…" became six lines of 9 px type on its spine, a six-line display title on the book page, and a full sentence in every quote caption and library row. *Fixed* with `splitTitle()` / `shortTitle()` in `util.js`. It splits on " albo ", " czyli ", ". ", ": " and spaced dashes, but never after initials ("Thomasa F. dla ogółu" stays whole).
- Spines, generated jackets, the Start card, Sesja, Co dalej, quote captions, the quote book filter and library rows now use the main title. The full title stays in `aria-label`.
- The book page sets the main title as the display line and the rest as a Literata subtitle (`.book-sub`).

**P1. A read book with no date contradicted itself.** All 133 undated Goodreads books said "Jeszcze nie zaczęte. Przełącz na „Czytam”…" right under "Przeczytane". *Fixed*: the page now says "Przeczytana, ale bez daty. Dodaj ją, jeśli pamiętasz — wtedy trafi do statystyk swojego roku." When the read count is above 1, it asks only for a date. Porzucone says "Bez zapisanych dat."

**P1. Statystyki hid two thirds of the library.** Only dated reads count, so 133 of the 192 read books appeared nowhere, with no explanation. *Fixed*: a one-line note under the year tabs gives the lifetime count and the number without a date, with correct plurals and verb agreement.

**P1. The book in hand got lost on a 198-book shelf.** "Wszystkie" sorted by date added, so the two current books (ribbons) were buried among the Goodreads books. *Fixed*: on "Wszystkie" the books being read stand first in both spines and list view, whatever the sort.

**P2. Start hierarchy.** The new "Zainstaluj na telefonie" was a full cloth primary button directly under the cloth header band. It read as a second band and outweighed "Czytam teraz". The date also sat as an uppercase eyebrow above the greeting (a banned pattern). *Fixed*:
- The install action is still at the very top, but it is now set into the band as a paper label: an on-cloth fill, an icon and a chevron.
- The first paper element is the reading card again.
- The date moved under "Dzień dobry" as an italic Literata line.
- "strona 122 z 304" no longer breaks before "304".

**P2. List view at scale.** 192 read rows showed only stars, so there was no sense of when anything was read. *Fixed*: read books show the year finished after the stars. With no rating and no date, the row says "przeczytana".

**P2. Library rows said the same thing twice.** With the proxy connected, every row showed the stamp "NIE SPRAWDZONO" and then "jeszcze nie sprawdzano". *Fixed*: an unchecked row shows only the title, the author and "Sprawdź". The stamp and the date appear once a check has run.

**P2. Performance at ~200 books.**
- The spine view is 26 shelf rows (~6.5k px) and the list ~19k px.
- `.shelf-row` and `.book-list > li` now use `content-visibility: auto` with intrinsic sizes, so off-screen rows are not laid out or painted.
- Shelf rows got inner padding, so the lifted spine and the hanging ribbon stay inside the paint box.
- Covers were already lazy.

**P3. The Goodreads preview listed "Chcę przeczytać 0".** Empty shelf rows are now hidden in the preview.

### Left open
- A single 404 appeared in the console after the import. It came from an external resource (most likely an Open Library cover redirect); every app file returned 200.
- Goodreads gives foreign transliterations for some authors ("Fyodor Dostoevsky" next to a hand-added "Fiodor Dostojewski"). These are separate authors in stats. An author-alias merge would be a feature, not a design fix.
- Co dalej: the mood chips (ink-filled) and the length segment (leaf) are two selection styles side by side. This is taste, left as it is.
- Preview-only: a service worker from an earlier session controlled localhost and served stale files until it was unregistered. On the phone this is the normal "Aktualizacja dostępna" flow.
