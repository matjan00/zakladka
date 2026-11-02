"""Join the agents' answers (batches/bNN.out.json) and hand corrections (overrides.json) into tags.json.
overrides.json: {"<id>": {"keep": false}} or any tag field to change (genre, mood, why, title, author...)."""
import json
from pathlib import Path
HERE = Path(__file__).parent
tags = json.loads((HERE / "tags.json").read_text(encoding="utf-8")) if (HERE / "tags.json").exists() else {}
for f in sorted((HERE / "batches").glob("b*.out.json")):
    tags.update(json.loads(f.read_text(encoding="utf-8")))
import glob
for over in sorted(HERE.glob("overrides*.json")):
    for k, v in json.loads(over.read_text(encoding="utf-8")).items():
        tags[k] = {**tags.get(k, {}), **v}
(HERE / "tags.json").write_text(json.dumps(tags, ensure_ascii=False, indent=0), encoding="utf-8")
GEN = set("classic literary scifi fantasy crime historical horror romance ya history science memoir philosophy humour graphic poetry other".split())
bad = [k for k, t in tags.items() if t.get("keep") and (t.get("genre") not in GEN or not t.get("why"))]
print(len(tags), "tagged,", sum(1 for t in tags.values() if t.get("keep")), "kept; bad entries:", len(bad), bad[:5])
import collections
print(collections.Counter(t["genre"] for t in tags.values() if t.get("keep")).most_common())
