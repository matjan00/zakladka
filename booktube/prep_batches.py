"""Split matched candidates into small files for Sonnet agents to tag (batches/bNN.json); answers go to bNN.out.json.
Usage: python booktube/prep_batches.py [batch size]"""
import json, sys
from pathlib import Path
HERE = Path(__file__).parent

def main():
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 70
    cand = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
    ol = json.loads((HERE / "raw" / "ol.json").read_text(encoding="utf-8"))
    tags = json.loads((HERE / "tags.json").read_text(encoding="utf-8")) if (HERE / "tags.json").exists() else {}
    todo = []
    for k, c in sorted(cand.items(), key=lambda kv: -kv[1]["rank"]):
        o = ol.get(k)
        if not o or k in tags: continue
        todo.append({"id": k, "title": o["title"], "author": o["author"], "year": o["year"], "pages": o["pages"],
                     "subjects": o["subjects"][:8], "n": c["n"], "threads": c["threads"], "comments": [x[:260] for x in c["comments"][:3]]})
    out = HERE / "batches"; out.mkdir(exist_ok=True)
    for f in out.glob("b*.json"):
        if not f.name.endswith(".out.json"): f.unlink()
    first = len(list(out.glob("b*.out.json"))) + 1
    for i in range(0, len(todo), size):
        (out / f"b{first + i // size:02d}.json").write_text(json.dumps(todo[i:i + size], ensure_ascii=False, indent=0), encoding="utf-8")
    print(len(todo), "books in", (len(todo) + size - 1) // size, "batches")

if __name__ == "__main__":
    main()
