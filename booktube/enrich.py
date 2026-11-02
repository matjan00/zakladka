"""Look every candidate up on Open Library (free, no key): canonical title/author, cover id, year, pages, ISBN, subjects.
A candidate is accepted only when the Open Library title is close to the mentioned title (and the author surname matches when
one was mentioned). Cache: raw/ol.json (key -> result or null). Usage: python booktube/enrich.py [max books, default 3000]
"""
import json, subprocess, sys, time, urllib.parse, difflib
from pathlib import Path
from extract import norm, surname

HERE = Path(__file__).parent
CACHE = HERE / "raw" / "ol.json"
UA = "zakladka-booktube/0.1 (personal reading app; contact: matjan00 on GitHub)"
F = "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn,subject,language,ratings_average,ratings_count,edition_count"


def get(url, tries=4):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-m", "40", "-A", UA, url], capture_output=True, text=True, encoding="utf-8")
        try:
            return json.loads(r.stdout)
        except Exception:
            time.sleep(2 + 3 * i)
    return None


def look(c):
    c = dict(c)
    if len(c["author"].split()) < 2:
        c["author"] = ""
    q = {"title": c["title"], "limit": 5, "fields": F}
    if c["author"]:
        q["author"] = c["author"]
    d = get("https://openlibrary.org/search.json?" + urllib.parse.urlencode(q))
    if d is None:
        return "retry"
    best, score = None, 0
    for doc in d.get("docs", []):
        s = difflib.SequenceMatcher(None, norm(doc.get("title", "")), norm(c["title"])).ratio()
        if c["author"] and not any(surname(a) == surname(c["author"]) for a in doc.get("author_name", [])):
            s -= 0.4
        s += min(doc.get("edition_count", 0), 50) / 500
        if s > score:
            best, score = doc, s
    if not best or score < 0.8:
        return None
    subs = [x for x in best.get("subject", []) if len(x) < 40][:10]
    isbn = next((i for i in best.get("isbn", []) if len(i) == 13), (best.get("isbn") or [""])[0])
    return {"title": best["title"], "author": (best.get("author_name") or [""])[0], "year": best.get("first_publish_year"),
            "pages": best.get("number_of_pages_median"), "cover": best.get("cover_i"), "isbn": isbn, "subjects": subs,
            "lang": (best.get("language") or [])[:8], "ol": best["key"], "olr": best.get("ratings_average"), "oln": best.get("ratings_count")}


def main():
    cap = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    cand = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    order = sorted(cand, key=lambda k: -cand[k]["rank"])[:cap]
    todo = [k for k in order if k not in cache]
    print(len(todo), "to look up", flush=True)
    for i, k in enumerate(todo):
        r = look(cand[k])
        time.sleep(0.4)
        if r == "retry":
            continue
        cache[k] = r
        if i % 25 == 0 or i == len(todo) - 1:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(i + 1, "/", len(todo), flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(sum(1 for v in cache.values() if v), "matched of", len(cache))


if __name__ == "__main__":
    main()
