// Plain-node tests for the pure parsers: Kindle clippings, fuzzy matching, Goodreads CSV.
// Run: node scripts/test-kindle.cjs
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), url = require('url');
const src = path.join(__dirname, '..', 'docs', 'js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zak-'));
for (const f of ['util', 'kindle-parse', 'goodreads-parse'])
  fs.writeFileSync(path.join(tmp, f + '.mjs'), fs.readFileSync(path.join(src, f + '.js'), 'utf8').replace(/from '\.\/(\w[\w-]*)\.js'/g, "from './$1.mjs'"));

const PL = [
  '﻿Pan Tadeusz (Adam Mickiewicz)',
  '- Twoje zakreślenie w lokalizacji 1234-1236 | Dodano: poniedziałek, 3 marca 2025 13:45:12',
  '', 'Litwo! Ojczyzno moja! ty jesteś jak zdrowie.', '==========',
  'Pan Tadeusz (Adam Mickiewicz)',
  '- Twoja notatka w lokalizacji 1236 | Dodano: poniedziałek, 3 marca 2025 13:46:00',
  '', 'Najsłynniejsza inwokacja', '==========',
  'Pan Tadeusz (Adam Mickiewicz)',
  '- Twoja zakładka w lokalizacji 1300 | Dodano: wtorek, 4 marca 2025 08:00:00',
  '', '==========',
  'Pan Tadeusz (Adam Mickiewicz)',
  '- Twoje zakreślenie na stronie 99 | w lokalizacji 2000-2001 | Dodano: czwartek, 6 marca 2025 21:05:00',
  '', 'W domu nie ma spokoju', 'bez gospodarza.', '==========',
  'Pan Tadeusz (Adam Mickiewicz)',
  '- Twoje zakreślenie na stronie 99 | w lokalizacji 2000-2003 | Dodano: czwartek, 6 marca 2025 21:06:00',
  '', 'W domu nie ma spokoju', 'bez gospodarza. Dłuższa wersja.', '==========',
  'Chłopi, tom 1 (Reymont, Władysław)',
  '- Twoje zakreślenie w lokalizacji 50-51 | Dodano: sobota, 1 listopada 2025 7:00:00',
  '', 'Żółć i gorycz.', '==========', '',
].join('\r\n');
const EN = [
  'The Pragmatic Programmer: From Journeyman to Master (Hunt, Andrew and Thomas, David)',
  '- Your Highlight on page 12 | location 120-122 | Added on Monday, March 3, 2025 1:45:12 PM',
  '', 'Care about your craft.', '==========',
  'The Pragmatic Programmer: From Journeyman to Master (Hunt, Andrew and Thomas, David)',
  '- Your Note on page 12 | location 122 | Added on Monday, March 3, 2025 1:46:12 PM',
  '', 'why waste time', '==========',
  'The Pragmatic Programmer: From Journeyman to Master (Hunt, Andrew and Thomas, David)',
  '- Your Bookmark at location 400 | Added on Tuesday, March 4, 2025 9:00:00 AM',
  '', '==========',
  'Dune (Frank Herbert)',
  '- Your Highlight at location 77-78 | Added on Friday, December 12, 2025 12:05:00 AM',
  '', 'I must not fear.', '==========', '',
].join('\n');

const CSV = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '1,"Chłopi, tom 1 (Chłopi, #1)",Władysław Reymont,"Reymont, Władysław",,"=""8373191909""","=""9788373191907""",5,4.2,Zielona Sowa,Hardcover,320,2005,1904,2024/03/10,2024/01/02,"klasyka, to-read-soon, read","klasyka (#3)",read,"Świetna. ""Cudowna"".\nDruga linia.<br/>Trzecia",,,2,1',
  '2,Dune,Frank Herbert,"Herbert, Frank",,"=""""","=""""",0,4.3,Ace,Kindle Edition,,1965,1965,,2025/02/01,currently-reading,,currently-reading,,,,0,0',
  '3,Solaris,Stanisław Lem,"Lem, Stanisław",,"=""""","=""9788308061015""",4,4.1,WL,Audiobook,204,2017,1961,,2025/05/05,,,to-read,,,,0,0',
  '4,Pan Tadeusz,Adam Mickiewicz,,,,,3,,,,,,,2023/12/24,2023/12/01,,,read,,,,1,0',
  '',
].join('\r\n');

(async () => {
  const K = await import(url.pathToFileURL(path.join(tmp, 'kindle-parse.mjs')));
  const G = await import(url.pathToFileURL(path.join(tmp, 'goodreads-parse.mjs')));
  let n = 0;
  const ok = (name, fn) => (fn(), console.log('ok -', name), n++);

  ok('PL clippings', () => {
    const r = K.parseClippings('﻿' + PL.replace('﻿', ''));
    assert.equal(r.highlights.length, 3);
    assert.equal(r.skipped.bookmarks, 1);
    assert.equal(r.skipped.dupInFile, 1);
    const h = r.highlights[0];
    assert.equal(h.title, 'Pan Tadeusz');
    assert.equal(h.author, 'Adam Mickiewicz');
    assert.equal(h.note, 'Najsłynniejsza inwokacja');
    assert.equal(h.locStart, 1234);
    assert.equal(h.locEnd, 1236);
    assert.equal(r.highlights[1].text, 'W domu nie ma spokoju bez gospodarza. Dłuższa wersja.');
    assert.equal(r.highlights[1].page, 99);
    const c = r.highlights[2];
    assert.equal(c.title, 'Chłopi, tom 1');
    assert.equal(c.author, 'Władysław Reymont');
    const d = new Date(h.added);
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2025, 2, 3, 13, 45]);
    assert.equal(new Date(c.added).getMonth(), 10);
  });
  ok('EN clippings', () => {
    const r = K.parseClippings(EN);
    assert.equal(r.highlights.length, 2);
    assert.equal(r.skipped.bookmarks, 1);
    const h = r.highlights[0];
    assert.equal(h.page, 12);
    assert.equal(h.locStart, 120);
    assert.equal(h.note, 'why waste time');
    assert.equal(h.title, 'The Pragmatic Programmer: From Journeyman to Master');
    assert.equal(new Date(h.added).getHours(), 13);
    assert.equal(new Date(r.highlights[1].added).getHours(), 0); // 12:05 AM
  });
  ok('hash is stable and unique', () => {
    const a = K.parseClippings(PL).highlights.map((x) => x.hash);
    const b = K.parseClippings(PL).highlights.map((x) => x.hash);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, a.length);
  });
  ok('fuzzy book match', () => {
    const lib = [
      { id: 1, title: 'Chłopi', author: 'Władysław Stanisław Reymont' },
      { id: 2, title: 'Pan Tadeusz', author: 'Adam Mickiewicz' },
      { id: 3, title: 'Dune', author: 'Frank Herbert' },
      { id: 4, title: 'Diuna', author: 'Frank Herbert' },
    ];
    assert.equal(K.matchBook('Pan Tadeusz', 'Adam Mickiewicz', lib).book.id, 2);
    assert.equal(K.matchBook('PAN TADEUSZ czyli ostatni zajazd na Litwie', 'Adam Mickiewicz', lib).book.id, 2);
    assert.equal(K.matchBook('Chłopi, tom 1', 'Władysław Reymont', lib).book.id, 1);
    assert.equal(K.matchBook('Chlopi', '', lib).book.id, 1);
    assert.equal(K.matchBook('Dune', 'Frank Herbert', lib).book.id, 3);
    assert.equal(K.matchBook('Zbrodnia i kara', 'Fiodor Dostojewski', lib), null);
  });
  ok('CSV parser', () => {
    assert.deepEqual(G.parseCsv('a,b\r\n"x, ""y""\nz",2\r\n\r\n3,4'), [['a', 'b'], ['x, "y"\nz', '2'], ['3', '4']]);
    assert.equal(G.unwrapIsbn('="9788373191907"'), '9788373191907');
    assert.equal(G.unwrapIsbn('=""'), '');
  });
  ok('Goodreads mapping', () => {
    const r = G.parseGoodreads('﻿' + CSV);
    assert.equal(r.books.length, 4);
    const [c, d, s, p] = r.books;
    assert.equal(c.title, 'Chłopi, tom 1');
    assert.equal(c.isbn, '9788373191907');
    assert.equal(c.status, 'przeczytane');
    assert.equal(c.rating, 5);
    assert.equal(c.pages, 320);
    assert.equal(c.year, 2005);
    assert.equal(c.dateRead, '2024-03-10');
    assert.equal(c.dateAdded, '2024-01-02');
    assert.deepEqual(c.tags, ['klasyka', 'to read soon']);
    assert.equal(c.readCount, 2);
    assert.equal(c.review, 'Świetna. "Cudowna".\nDruga linia.\nTrzecia');
    assert.equal(d.status, 'czytam');
    assert.equal(d.format, 'kindle');
    assert.equal(d.rating, null);
    assert.equal(d.isbn, '');
    assert.equal(s.status, 'chce');
    assert.equal(s.format, 'audiobook');
    assert.equal(s.isbn, '9788308061015');
    assert.equal(p.status, 'przeczytane');
    assert.equal(p.readCount, 1);
    assert.ok(G.parseGoodreads('foo,bar\n1,2').error);
  });
  ok('Goodreads dedupe', () => {
    const r = G.parseGoodreads(CSV);
    const { fresh, dups } = G.dedupe(r.books, [
      { title: 'Pan Tadeusz', author: 'Adam Mickiewicz', isbn: '' },
      { title: 'Inna', author: 'X', isbn: '9788308061015' },
    ]);
    assert.equal(dups.length, 2);
    assert.equal(fresh.length, 2);
    assert.equal(G.dedupe([...r.books, ...r.books], []).fresh.length, 4);
    const m = G.dedupe(r.books, [{ id: 'x1', title: 'Pan Tadeusz', author: 'Adam Mickiewicz', isbn: '' }]);
    assert.equal(m.dups[0].matchId, 'x1');
  });
  ok('Goodreads fills only empty fields', () => {
    const [c] = G.parseGoodreads(CSV).books;
    const shelf = { id: 'b1', title: c.title, author: c.author, status: 'przeczytane', rating: 3, pages: null, year: null, isbn: '', review: '', tags: [] };
    const f = G.missingFrom(shelf, c, []);
    assert.equal(f.patch.rating, undefined); // 3 stays 3
    assert.equal(f.patch.pages, 320);
    assert.equal(f.patch.readCount, 2);
    assert.deepEqual(f.addRead, { bookId: 'b1', started: null, finished: '2024-03-10' });
    assert.equal(G.missingFrom(shelf, c, [{ finished: '2020-01-01' }]).addRead, null);
  });
  console.log(`\n${n} test groups passed`);
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
