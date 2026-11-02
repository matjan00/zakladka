"""Polish side of each kept book: Polish title (Wikidata), lubimyczytac.pl link + rating, Legimi ebook link.
Cache raw/pl_<k>.json (key -> result). Run 4 parts at once:  python booktube/polish.py k n
Result: {"t": Polish title or None, "lc": url or None, "r": rating/10 or None, "rn": votes, "legimi": url or None}"""
import difflib, html, json, re, subprocess, sys, time, urllib.parse
from pathlib import Path
from extract import norm, surname

HERE = Path(__file__).parent
RAW = HERE / "raw"
UA = "zakladka-booktube/0.1 (personal reading app; contact: matjan00 on GitHub)"
WORK = re.compile(r"novel|book|story|stories|collection|poem|poetry|work|literary|play|memoir|essay|trilogy|series|epic|tale|fable|biography", re.I)
NOT = re.compile(r"film|game|album|band|song|edition|television|opera|musical|company", re.I)


def curl(url):
    for i in range(3):
        r = subprocess.run(["curl", "-s", "-m", "40", "-A", UA, url], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.stdout:
            return r.stdout
        time.sleep(2 + 2 * i)
    return ""


def jget(url):
    try:
        return json.loads(curl(url))
    except Exception:
        return {}


def pl_label(title, author):
    q = urllib.parse.urlencode({"action": "wbsearchentities", "search": title, "language": "en", "type": "item", "format": "json", "limit": 8})
    ids = [x["id"] for x in jget("https://www.wikidata.org/w/api.php?" + q).get("search", [])
           if WORK.search(x.get("description", "")) and not NOT.search(x.get("description", ""))
           and (not author or surname(author) in norm(x.get("description", "")) or True)][:3]
    for i in ids:
        d = jget(f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={i}&props=labels|descriptions&languages=pl|en&format=json")
        e = d.get("entities", {}).get(i, {})
        lab = e.get("labels", {}).get("pl", {}).get("value")
        desc = e.get("descriptions", {}).get("en", {}).get("value", "")
        if lab and (not author or surname(author)[:4] in norm(desc) or len(ids) == 1 or i == ids[0]):
            return lab
    return None


def same_author(a, b):
    sa, sb = surname(a), surname(b)
    return bool(sa and sb and (sa[:4] == sb[:4]))


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def lubimy(titles, author):
    for t in titles:
        h = curl("https://lubimyczytac.pl/szukaj/ksiazki?phrase=" + urllib.parse.quote(t + " " + surname(author)))
        for card in h.split('class="book-card book-card--l')[1:6]:
            m = re.search(r'class="book-card__title" title="([^"]*)"\s*href="([^"]*)"', card)
            a = re.search(r'book-card__author"><a [^>]*>([^<]*)<', card)
            if not m or not a:
                continue
            r = re.search(r'rating__avarage">([\d,]+)<', card)
            n = re.search(r'z</small>\s*(\d+)\s*ocen', card)
            title = re.sub(r"\s*\((?:edycja|wydanie|nowe)[^)]*\)", "", html.unescape(m.group(1)))
            if same_author(html.unescape(a.group(1)), author) and max(sim(title, x) for x in titles) >= 0.6:
                return {"t": title, "lc": "https://lubimyczytac.pl" + m.group(2), "r": float(r.group(1).replace(",", ".")) if r else None, "rn": int(n.group(1)) if n else 0}
        time.sleep(0.5)
    return None


def legimi(titles, author):
    for t in titles:
        d = jget("https://www.legimi.pl/api/search?" + urllib.parse.urlencode({"searchPhrase": t + " " + surname(author), "limit": 8}))
        for b in d.get("books", []):
            if b.get("isEbook") and same_author(b.get("author", ""), author) and max(sim(b["title"], x) for x in titles) >= 0.7:
                return "https://www.legimi.pl" + b["url"]
        time.sleep(0.4)
    return None


def main():
    k, n = int(sys.argv[1]), int(sys.argv[2])
    tags = json.loads((HERE / "tags.json").read_text(encoding="utf-8"))
    ol = json.loads((RAW / "ol.json").read_text(encoding="utf-8"))
    path = RAW / f"pl_r{n}_{k}.json"
    out = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    done = set()
    for f in RAW.glob("pl_*.json"):
        done |= set(json.loads(f.read_text(encoding="utf-8")))
    keep = [key for key, t in sorted(tags.items()) if t.get("keep") and ol.get(key)]
    todo = [key for i, key in enumerate(keep) if i % n == k and key not in done]
    print(len(todo), "to do", flush=True)
    for i, key in enumerate(todo):
        title, author = tags[key].get("title") or ol[key]["title"], tags[key].get("author") or ol[key]["author"]
        pl = pl_label(title, author)
        time.sleep(0.4)
        titles = [x for x in dict.fromkeys([pl, title]) if x]
        lc = lubimy(titles, author)
        if lc and lc["t"] not in titles:
            titles.insert(0, lc["t"])
        lg = legimi(titles, author)
        out[key] = {"t": (lc or {}).get("t") or pl, "lc": (lc or {}).get("lc"), "r": (lc or {}).get("r"), "rn": (lc or {}).get("rn"), "legimi": lg}
        if i % 10 == 0 or i == len(todo) - 1:
            path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
            print(i + 1, "/", len(todo), flush=True)
    path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
