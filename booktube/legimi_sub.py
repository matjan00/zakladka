"""Which Legimi ebooks are in the SUBSCRIPTION (no extra fee)? The book page lists its reading options:
ebook-catalogb-option = subscription catalogue ("abo"); ebook-audiobook-unlimited-option only = the pricier ebooks+audiobooks plan
("abo+"); only ebook-retail-option = must be bought ("paid"). Cache raw/lg_<k>.json: url -> state. Usage: python legimi_sub.py k n"""
import json, re, subprocess, sys, time
from pathlib import Path
HERE = Path(__file__).parent
UA = "zakladka-booktube/0.1 (personal reading app; contact: matjan00 on GitHub)"

def state(url):
    for i in range(3):
        h = subprocess.run(["curl", "-s", "-m", "40", "-A", UA, url], capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
        if "data-test=\"ebook-" in h:
            o = set(re.findall(r'data-test="(ebook-[a-z\-]*option[^"]*)"', h))
            return "abo" if "ebook-catalogb-option" in o else "abo+" if "ebook-audiobook-unlimited-option" in o else "paid"
        time.sleep(2 + 2 * i)
    return None

def main():
    k, n = int(sys.argv[1]), int(sys.argv[2])
    urls = set()
    for f in (HERE / "raw").glob("pl_*.json"):
        urls |= {v["legimi"] for v in json.loads(f.read_text(encoding="utf-8")).values() if v.get("legimi")}
    for f in (HERE / "raw").glob("pl2_*.json"):
        urls |= {v["legimi"] for v in json.loads(f.read_text(encoding="utf-8")).values() if v.get("legimi")}
    done = {}
    for f in (HERE / "raw").glob("lg_*.json"):
        done.update(json.loads(f.read_text(encoding="utf-8")))
    path = HERE / "raw" / f"lg_{k}.json"
    out = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    todo = [u for i, u in enumerate(sorted(urls)) if i % n == k and u not in done]
    print(len(todo), "to check", flush=True)
    for c, u in enumerate(todo):
        s = state(u)
        time.sleep(0.7)
        if s: out[u] = s
        if c % 10 == 0 or c == len(todo) - 1:
            path.write_text(json.dumps(out), encoding="utf-8"); print(c + 1, "/", len(todo), flush=True)
    path.write_text(json.dumps(out), encoding="utf-8")

if __name__ == "__main__":
    main()
