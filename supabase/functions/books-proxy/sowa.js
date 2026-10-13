// Parser for the SOWA OPAC result list (Biblioteka Publiczna Miasta i Gminy Nekla).
// Plain JS (no Deno/Node APIs) so the same file runs in the edge function and in a local node test.
//
// Each hit in the HTML starts with  onclick="location.href='…index.php?KatID=0&amp;typ=record&amp;001=…'"
// and then carries, in order: an availability icon <span class="av-status-available|av-status-loaned|…" title="…">,
// the title <span class="desc-o-mb-title">, the rest of the title statement <span class="desc-o-b-rest"> / Author.</span>,
// and an author block (.desc-descr-block-author). The data-title attribute on the page is the SERIES title
// (field 830), so it is used only as a last resort.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the HTML entities SOWA uses (named + numeric). */
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

const text = (html) => decodeEntities(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "Sapkowski Andrzej." / "Sapkowski, Andrzej (1948- )" → "Andrzej Sapkowski" */
export function personName(raw) {
  let s = String(raw || '').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.,;:\s]+$/, '');
  if (!s) return '';
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((x) => x.trim());
    return first ? `${first} ${last}` : last;
  }
  const parts = s.split(' ');
  // SOWA lists "Surname Given [Given]" in the author block: move the surname to the end.
  return parts.length > 1 ? `${parts.slice(1).join(' ')} ${parts[0]}` : s;
}

const BASE = 'https://www.nekla-bpmig.sowa.pl/';

/**
 * @param {string} html  the full result page
 * @returns {{title:string, author:string, available:boolean|null, statusText:string, recordUrl:string}[]}
 */
export function parseSowa(html) {
  const src = String(html || '');
  const re = /location\.href='([^']*typ=record[^']*)'/g;
  const starts = [];
  let m;
  while ((m = re.exec(src))) starts.push({ at: m.index, href: decodeEntities(m[1]) });
  const out = [];
  const seen = new Set();
  for (let i = 0; i < starts.length; i++) {
    const seg = src.slice(starts[i].at, i + 1 < starts.length ? starts[i + 1].at : src.length);
    let recordUrl = starts[i].href;
    if (!/^https?:/i.test(recordUrl)) recordUrl = BASE + recordUrl.replace(/^\.?\//, '');
    if (seen.has(recordUrl)) continue;
    seen.add(recordUrl);

    const titleM = seg.match(/class="desc-o-mb-title"[^>]*>([\s\S]*?)<\/span>/);
    const restM = seg.match(/class="desc-o-b-rest"[^>]*>([\s\S]*?)<\/span>/);
    const dataTitle = seg.match(/data-title="([^"]*)"/);
    let title = titleM ? text(titleM[1]) : dataTitle ? decodeEntities(dataTitle[1]).trim() : '';
    const rest = restM ? text(restM[1]) : '';
    // "rest" may hold ": subtitle / Author ; translator" — keep a subtitle only if there is no author part before it
    const sub = rest.split(' / ')[0].replace(/^[:\s]+/, '').trim();
    if (sub && rest.trim().startsWith(':')) title = `${title}: ${sub}`;
    title = title.replace(/\s+([.,;:])/g, '$1').replace(/\s*[/:;,.]\s*$/, '').trim();

    // Prefer the statement of responsibility ("/ Andrzej Sapkowski ; tł. …"): it is already in natural order.
    let author = '';
    if (rest.includes('/')) {
      author = rest.split('/')[1].split(/;|,|(?:tł|przeł|il|red|oprac)\.|przekł/)[0].replace(/[.\s]+$/, '').replace(/^\[|\]$/g, '').trim();
    }
    if (!author) {
      const block = seg.match(/desc-descr-block-author[\s\S]*?desc-descr-items[^>]*>([\s\S]*?)<\/div>/);
      if (block) {
        const first = block[1].match(/<a[^>]*>([\s\S]*?)<\/a>/);
        const raw = (first ? first[1] : block[1]).replace(/<span[^>]*>[\s\S]*?<\/span>/g, ' '); // drop the role ("Autor")
        author = personName(text(raw));
      }
    }

    const av = seg.match(/<span class="av-status-([a-z-]+)"\s*(?:title="([^"]*)")?/);
    let available = null;
    let statusText = '';
    if (av) {
      statusText = decodeEntities(av[2] || '').trim();
      if (av[1] === 'available') available = true;
      else if (av[1] !== 'icon') available = false;
    }
    if (!statusText) {
      const sum = seg.match(/class="record-av-bests"[\s\S]*?<span>([\s\S]*?)<\/span>\s*<i/);
      if (sum) statusText = text(sum[1]);
    }
    if (!title) continue;
    out.push({ title, author, available, statusText, recordUrl });
  }
  return out;
}
