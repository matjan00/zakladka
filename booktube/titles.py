"""List recommendation threads in the book subreddits from the Arctic Shift archive (plain date listing,
one MONTH window and one request at a time; its text search and open-ended date queries time out).
Per window it keeps the most-commented threads whose title looks like a request or a list of favourites.
Writes raw/titles_<sub>.json. Re-running continues where it stopped.
Usage:  python booktube/titles.py [sub ...]      (no argument: every subreddit, one after another)
"""
import json, re, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"; RAW.mkdir(exist_ok=True)
API = "https://arctic-shift.photon-reddit.com/api"
UA = "zakladka-booktube/0.1 (personal reading app; contact: matjan00 on GitHub)"
END = int(time.mktime(time.strptime("2026-11-01", "%Y-%m-%d")))
RECS = re.compile(r"recommend|suggest|favou?rite|best|underrated|must.?read|read next|similar|like |looking for|what should|what to read|top |classics?|polec|szukam|jak[aią] ksi|co czyta|warto|ulubion|najlepsz|\?", re.I)
# sub: (start, min comments, keep per window, title filter or None)
SUBS = {
    "suggestmeabook": ("2025-01-01", 25, 40, None),
    "books":          ("2025-07-01", 30, 15, RECS),
    "Fantasy":        ("2025-07-01", 20, 12, RECS),
    "printSF":        ("2023-01-01", 10, 8, RECS),
    "literature":     ("2023-01-01", 8, 8, RECS),
    "ksiazki":        ("2023-01-01", 6, 12, None),
    "Polska":         ("2023-01-01", 15, 5, re.compile(r"ksi[aą][zż]k|czyta|lektur|polec|autor|powie[sś]", re.I)),
}


def get(url, tries=8):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-m", "90", "-A", UA, url], capture_output=True, text=True, encoding="utf-8")
        try:
            d = json.loads(r.stdout)
        except Exception:
            d = {}
        if d.get("data") is not None:
            return d["data"]
        time.sleep(3 + 3 * i)
    return None


def run(sub):
    start, minc, keep, rx = SUBS[sub]
    path = RAW / f"titles_{sub}.json"
    st = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"after": int(time.mktime(time.strptime(start, "%Y-%m-%d"))), "threads": {}}
    while st["after"] < END:
        before = min(END, st["after"] + 30 * 86400)
        cur, rows = st["after"], []
        while cur < before:
            data = get(f"{API}/posts/search?subreddit={sub}&after={cur}&before={before}&sort=asc&limit=100&fields=id,title,score,num_comments,created_utc")
            time.sleep(1)
            if data is None:
                print("archive not answering, stopping for now", flush=True); return False
            rows += data
            if len(data) < 100: break
            cur = max(p["created_utc"] for p in data) + 1
        good = [p for p in rows if p["num_comments"] >= minc and (rx is None or rx.search(p["title"]))]
        good.sort(key=lambda p: -p["num_comments"])
        for p in good[:keep]:
            st["threads"][p["id"]] = {"t": p["title"], "s": p["score"], "n": p["num_comments"], "sub": sub, "d": p["created_utc"]}
        st["after"] = before
        path.write_text(json.dumps(st), encoding="utf-8")
        print(sub, time.strftime("%Y-%m", time.localtime(before)), len(rows), "posts, kept so far:", len(st["threads"]), flush=True)
    return True


if __name__ == "__main__":
    for s in (sys.argv[1:] or ["printSF", "literature", "ksiazki", "Polska", "suggestmeabook", "books", "Fantasy"]):
        if not run(s): break
    print("done", flush=True)
