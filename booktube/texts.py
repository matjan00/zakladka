"""Download every comment of the recommendation threads found by titles.py (Arctic Shift comment trees).
Writes raw/texts_<k>.json: thread id -> {"t": title, "sub": ..., "c": [[comment id, score, text], ...]}.
Re-running continues where it stopped. Run three parts at once (the archive is polite about that):
    python booktube/texts.py 0 3   /   1 3   /   2 3
"""
import json, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
API = "https://arctic-shift.photon-reddit.com/api"
UA = "zakladka-booktube/0.1 (personal reading app; contact: matjan00 on GitHub)"


def get(url, tries=6):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-m", "120", "-A", UA, url], capture_output=True, text=True, encoding="utf-8")
        try:
            d = json.loads(r.stdout)
        except Exception:
            d = {}
        if d.get("data") is not None:
            return d["data"]
        time.sleep(3 + 3 * i)
    return None


def main():
    threads = {}
    for f in RAW.glob("titles_*.json"):
        threads.update(json.loads(f.read_text(encoding="utf-8"))["threads"])
    k, n = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (0, 1)
    done = set()
    for f in RAW.glob("texts_*.json"):
        done |= set(json.loads(f.read_text(encoding="utf-8")))
    path = RAW / f"texts_{k}.json"
    out = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    todo = [t for i, t in enumerate(sorted(threads)) if t not in done and i % n == k]
    print(len(threads), "threads,", len(todo), "to read", flush=True)
    for i, tid in enumerate(todo):
        data = get(f"{API}/comments/tree?link_id={tid}&limit=2000")
        time.sleep(1)
        if data is None:
            continue
        cs, stack = [], list(data)
        while stack:
            c = stack.pop().get("data", {})
            rep = c.get("replies")
            if isinstance(rep, dict):
                stack.extend(rep.get("data", {}).get("children", []))
            body = (c.get("body") or "").strip()
            if body and body not in ("[deleted]", "[removed]") and c.get("author") != "AutoModerator":
                cs.append([c.get("id"), c.get("score", 1), body[:1500]])
        out[tid] = {"t": threads[tid]["t"], "sub": threads[tid]["sub"], "c": cs}
        if i % 20 == 0 or i == len(todo) - 1:
            path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
            print("read", i + 1, "/", len(todo), flush=True)
    path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
