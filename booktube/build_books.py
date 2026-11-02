"""Assemble docs/data/books.json from candidates.json + raw/ol.json + tags.json + raw/pl_*.json.
Usage: python booktube/build_books.py"""
import json, re, time
from pathlib import Path
from extract import norm, surname

HERE = Path(__file__).parent
OUT = HERE.parent / "docs" / "data" / "books.json"
cand = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
ol = json.loads((HERE / "raw" / "ol.json").read_text(encoding="utf-8"))
tags = json.loads((HERE / "tags.json").read_text(encoding="utf-8"))
pl = {}
for f in (HERE / "raw").glob("pl_*.json"):
    pl.update(json.loads(f.read_text(encoding="utf-8")))

ids, used = {}, set()
for k, t in tags.items():
    if not t.get("keep") or not ol.get(k):
        continue
    base = re.sub(r"\s+", "-", f"{norm(t.get('title') or ol[k]['title'])}-{surname(t.get('author') or ol[k]['author'])}".strip()) or k
    i, n = base, 2
    while i in used:
        i, n = f"{base}-{n}", n + 1
    used.add(i); ids[k] = i

books = []
for k, i in ids.items():
    t, o, c = tags[k], ol[k], cand[k]
    p = {} if t.get("pl_drop") else (pl.get(k) or {})
    if t.get("pl_t"):
        p = {**p, "t": t["pl_t"]}
    rel = [ids[r] for r, _ in c.get("related", []) if r in ids][:8]
    pages = o.get("pages") or None
    ln = t.get("length") or ("short" if pages and pages < 250 else "long" if pages and pages > 500 else "medium")
    books.append({"id": i, "t": t.get("title") or o["title"], "a": t.get("author") or o["author"], "y": t.get("y") or o.get("year"), "p": t.get("p") or pages,
                  "isbn": o.get("isbn") or None, "cover": o.get("cover"), "g": t["genre"], "m": t.get("mood", [])[:3], "len": ln,
                  "d": t.get("diff", 2), "ty": t.get("type", "novel"), "why": t["why"], "n": c["n"], "up": c["up"], "rank": c["rank"],
                  "subs": c["subs"], "rel": rel,
                  "pl": {"t": p.get("t") if p.get("t") and norm(p["t"]) != norm(t.get("title") or o["title"]) else None,
                         "lc": p.get("lc"), "r": p.get("r"), "legimi": p.get("legimi")} if p else None})
fixes = {}
for f in sorted((HERE / "audit").glob("fix_*.json")):
    fixes.update(json.loads(f.read_text(encoding="utf-8")))
for b in books:
    f = fixes.get(b["id"])
    if not f:
        continue
    for src, dst in (("title", "t"), ("author", "a"), ("year", "y"), ("pages", "p")):
        if f.get(src):
            b[dst] = f[src]
    if f.get("drop"):
        b["_drop"] = True
    if b["pl"]:
        if f.get("drop_pl"):
            b["pl"] = {"t": None, "lc": None, "r": None, "legimi": None}
        if f.get("pl_title"):
            b["pl"]["t"] = f["pl_title"]
        if f.get("drop_lc"):
            b["pl"]["lc"] = b["pl"]["r"] = None
        if f.get("drop_legimi"):
            b["pl"]["legimi"] = None
pl2 = {}
for f in (HERE / "raw").glob("pl2_*.json"):
    pl2.update(json.loads(f.read_text(encoding="utf-8")))
for b in books:
    q = pl2.get(b["id"])
    if q and not (b["pl"] and b["pl"].get("lc")) and (q.get("lc") or q.get("legimi")):
        old = b["pl"] or {}
        b["pl"] = {"t": q["t"] if q["t"] and norm(q["t"]) != norm(b["t"]) else None, "lc": q["lc"], "r": q["r"], "legimi": q["legimi"] or old.get("legimi")}
books = [b for b in books if not b.get("_drop")]
books.sort(key=lambda b: -b["rank"])
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"v": 1, "built": time.strftime("%Y-%m-%d"), "books": books}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(books), "books,", OUT.stat().st_size // 1024, "KB; with Polish data:", sum(1 for b in books if b["pl"]), "legimi:", sum(1 for b in books if b["pl"] and b["pl"]["legimi"]))
