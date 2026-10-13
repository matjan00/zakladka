# Zakładka: what's left (needs you)

Everything below needs your OK or your hands. Built and tested so far: shelf, adding books, reading timer, stats, quotes (typed, photo text recognition, Kindle import), Goodreads import, "Co dalej?", Nekla library screen, backup.

## 1. Look at it on your computer (optional, 1 min)
Ask Claude: "show me Zakładka in the preview". Or look at the pictures in the `screenshots` folder.

## 2. Publish it so it works on your phone (needs your OK)
Say "yes, publish Zakładka" to Claude. It will give you one command to paste. That command creates the public GitHub page https://matjan00.github.io/zakladka/, the same way Tempo and Wardrobe were published.
Your books stay on your phone only. Only the app itself goes online.

## 3. Turn on the automatic Nekla library check + full Polish book search (needs your OK)
A small helper has to go into your existing Supabase project (the fitness one, next to Tempo's alarm). Claude was not allowed to deploy it without you.
Say "deploy the books helper" and Claude gives you the command, or runs it once you approve. After that Claude fills in the address in `docs/js/config.js` and releases a new version.
Until then: searching uses Open Library only (fewer Polish books, but you can always add a book by hand), and the library screen shows "Szukaj w katalogu" links instead of automatic checks.

## 4. Bring in your Goodreads history
Laptop: goodreads.com → My Books → (left menu) Import and export → Export Library → download `goodreads_library_export.csv`.
Then in the app: Ustawienia → Import z Goodreads → choose the file. You'll see a preview before anything is saved.

## 5. Kindle highlights (Legimi books)
Connect the Kindle to the laptop with a USB cable → open the Kindle drive → `documents` → `My Clippings.txt`.
Send that file to your phone (or open the app on the laptop), then: Cytaty → Import z Kindle.

## 6. Things to test on the real phone (the computer preview can't)
- Barcode scanning with the camera (add book → scan).
- Photo of a page → text (first use downloads ~10 MB of Polish language data; after that it's quick).
- "Install" on the home screen and opening it offline.

## Free library tip
Biblioteka w Nekli gives free Legimi codes to readers: https://www.legimi.pl/biblioteka_nekla/. Ask at the library.
