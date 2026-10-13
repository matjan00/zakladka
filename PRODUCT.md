# Product

<!-- impeccable:product-schema 1 -->

> Inferred from SPEC.md by the foundation builder (no interview was possible in that session). Every line below restates SPEC.md; nothing was invented.

## Platform

web

## Stack

Static PWA in `docs/`, vanilla JS ES modules, no build step (pinned in SPEC.md, same pattern as the owner's Tempo app). GitHub Pages hosting; Supabase edge function `books-proxy` for CORS-less sources.

## Users

One person: Mateusz. Reads Polish books only, on paper and on a Kindle via Legimi. Android phone. No coding background. Has a Goodreads account and a card at the public library in Nekla.

## Product Purpose

A private reading log on the phone: what I am reading, what I want to read, what I have read, how fast, which quotes I keep, and whether the Nekla library has the next book on the shelf. Success: he opens it every time he reads, and it feels like a well-made book, not a generic app.

## Positioning

Local-first, Polish-only, tied to his real life: Biblioteka Narodowa metadata, the Nekla SOWA catalogue, Legimi highlights from `My Clippings.txt`, Goodreads history import.

## Operating Context

Used in short moments: picking up a book in the evening (often in bed, low light), logging a session, snapping a quote with the camera, checking the library before a visit.

## Capabilities and Constraints

Shelves Czytam / Chcę przeczytać / Przeczytane / Porzucone + tags; reading sessions timer; stats; quote vault with OCR and Kindle import; what-next picker; Nekla availability check; Goodreads import. Data in IndexedDB only, backup JSON. Polish UI with correct plurals, pl-PL dates. Must work offline after first load.

## Brand Commitments

Name: Zakładka (bookmark). Owner asked for a very well-designed app with a book motif; a real night-reading dark mode.

## Evidence on Hand

None beyond the owner's own future data. No sample libraries or testimonials exist; empty states must invite, not fake.

## Product Principles

1. Never lose a book or a note: every change persists, backups round-trip.
2. One thumb, one moment: the common actions (open current book, log progress) take a tap or two.
3. Polish first: the language is correct and warm, never machine-translated.
4. The object matters: it should feel like a book he owns.

## Accessibility & Inclusion

Large tap targets, readable at night, respects reduced motion.
