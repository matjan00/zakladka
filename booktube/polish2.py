"""Second Polish pass: for books with no lubimyczytac match, search with the Polish title the agents supplied (audit/pt_*.json).
Writes raw/pl2_<k>.json keyed by book id. Usage: python booktube/polish2.py k n"""
import json, sys, time
from pathlib import Path
import polish
HERE = Path(__file__).parent

def main():
    k, n = int(sys.argv[1]), int(sys.argv[2])
    books = {b["id"]: b for b in json.loads((HERE.parent / "docs" / "data" / "books.json").read_text(encoding="utf-8"))["books"]}
    pt = {}
    for f in (HERE / "audit").glob("pt_*.json"):
        pt.update(json.loads(f.read_text(encoding="utf-8")))
    path = HERE / "raw" / f"pl2_{k}.json"
    out = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    todo = [i for j, i in enumerate(sorted(i for i, t in pt.items() if t and i in books)) if j % n == k and i not in out]
    print(len(todo), "to do", flush=True)
    for c, i in enumerate(todo):
        b = books[i]
        titles = list(dict.fromkeys([pt[i], b["t"]]))
        lc = polish.lubimy(titles, b["a"])
        ts = ([lc["t"]] if lc else []) + titles
        lg = polish.legimi(ts, b["a"])
        out[i] = {"t": (lc or {}).get("t") or pt[i], "lc": (lc or {}).get("lc"), "r": (lc or {}).get("r"), "legimi": lg}
        if c % 10 == 0 or c == len(todo) - 1:
            path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8"); print(c + 1, "/", len(todo), flush=True)
    path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    main()
