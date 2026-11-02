# Tagging books for the Discover tab

Each `batches/bNN.json` holds books that Reddit readers named in recommendation threads (r/suggestmeabook, r/books,
r/Fantasy, r/printSF, r/literature, r/ksiazki, r/Polska). Every entry has: `id`, `title`, `author`, `year`, `pages`,
`subjects` (Open Library subject tags, noisy), `threads` (titles of up to 3 threads it came up in), `comments`
(up to 3 short comments that name it) and `n` (how many distinct comments mention it).

For every book write one entry into `batches/bNN.out.json`, keyed by `id`:

```json
{ "ID": { "keep": true, "genre": "scifi", "mood": ["thoughtful", "dark"], "length": "medium", "diff": 2,
          "type": "novel", "title": "Solaris", "author": "Stanisław Lem", "why": "..." } }
```

- **keep**: `true` only when the entry is a real, readable book (novel, story collection, non-fiction, poetry, graphic
  novel) that readers recommend or praise. `false` for: not a book (a film, game, author-only name, phrase, series of
  unrelated works, a word that happens to be capitalised); jokes and memes ("The Bible", "Atlas Shrugged" named as a
  troll answer, "any Brandon Sanderson" style non-answers); books named only to criticise them or as a bad example
  ("I couldn't finish X", "overrated"); wrong match (the title and author do not belong together, or the book clearly
  is not the one the comments discuss). If the comments split, keep it only when most of them recommend it.
- **title / author**: fix the canonical English title and the main author's full name when the entry is clearly the
  well-known book but is misspelled or half-matched. Otherwise copy what you were given.
- **genre** (exactly one): `classic` (canonical works first published before ~1960, any genre except pure sci-fi and
  fantasy), `literary` (modern literary fiction, novels of ideas, translated literature), `scifi`, `fantasy`,
  `crime` (mystery, thriller, noir), `historical`, `horror`, `romance`, `ya` (young adult / children's), `history`
  (non-fiction history, politics, war), `science` (popular science, nature, technology), `memoir` (memoir, biography,
  essays), `philosophy` (philosophy, psychology, religion, self-development), `humour`, `graphic`, `poetry`, `other`.
  Old sci-fi (e.g. Wells, Lem, Asimov) is `scifi`, not `classic`.
- **mood** (1–3 of): `dark`, `thoughtful`, `funny`, `tense`, `cozy`, `epic`, `melancholic`, `mind-bending`, `emotional`,
  `fast`, `atmospheric`, `hopeful`, `bleak`, `adventurous`, `satirical`.
- **length**: `short` (under ~250 pages), `medium` (250–500), `long` (over 500). Use the `pages` field; when it is
  missing or looks wrong, use what you know about the book.
- **diff** (how hard it is to read): 1 = easy, page-turner; 2 = ordinary adult fiction/non-fiction; 3 = demanding
  (dense prose, experimental structure, heavy philosophy, archaic language).
- **type**: `novel`, `stories`, `nonfiction`, `poetry`, `graphic`, `play`.
- **why**: ONE plain sentence, max 25 words, in your own words, saying what a reader gets from the book and why people
  recommend it, based on the comments. Never copy comment text. No spoilers. No marketing language.

When unsure whether to keep a book, keep it only if the comments clearly recommend it.
Cover the whole batch; do not skip entries. Write valid JSON only into the .out.json file.
