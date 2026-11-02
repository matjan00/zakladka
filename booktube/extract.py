"""Pull book mentions out of the downloaded comments and count them.
Mentions: **Title** by Author, *Title* by Author, "Title" by Author, Title by Author (capitalised words),
and bold / italic / quoted titles without an author. A comment that lists k books counts 1/sqrt(k) per book.
Reads raw/texts_*.json. Writes candidates.json: key -> {title, author, n, up, rank, subs, threads, comments, related}.
Usage: python booktube/extract.py [min distinct comments, default 3]
"""
import json, math, re, sys, unicodedata
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
CAP = r"[A-ZĄĆĘŁŃÓŚŹŻ0-9][\w'’.:,&!?\-]*"
SMALL = r"(?:of|the|a|an|and|in|on|to|for|at|by|from|with|or|de|la|le|von|van|der|den|du|des|el|y|i|w|z|o|na|do|nad|pod)"
TITLE_WORDS = rf"{CAP}(?:\s+(?:{CAP}|{SMALL})){{0,9}}"
NAME = rf"[A-ZĄĆĘŁŃÓŚŹŻ][\w'’.\-]+(?:\s+(?:[A-ZĄĆĘŁŃÓŚŹŻ][\w'’.\-]+|de|van|von|le|la|der|du|Jr\.?)){{0,3}}"
MD = re.compile(r"(\*\*\*|\*\*|\*|__|_)(?=\S)(.{2,90}?)(?<=\S)\1")
BY = re.compile(rf"^\s*[,(\-–—:]?\s*(?:by|autorstwa|–|-|—|\()\s*({NAME})")
QUOTED = re.compile(r"[\"“„]([^\"”“\n]{2,80})[\"”]")
PLAIN_BY = re.compile(rf"(?<![\w*_])({TITLE_WORDS})\s+by\s+({NAME})")
STOP = {"edit", "update", "tl;dr", "tldr", "this", "that", "yes", "no", "lol", "same", "thank you", "thanks", "ps", "note", "spoiler", "spoilers", "source",
        "the", "and", "but", "also", "or", "however", "imo", "imho", "me", "i", "it", "why", "what", "how", "yes!", "nope", "great", "good", "bad", "this!", "wow"}
GENERIC = re.compile(r"^(and|or|but|so|if|when|then|the one|a |an |my |your |i |it |this |that |these |those |you |we |they |he |she |there |here |what |why |how |also )", re.I)


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c) and c not in "'’")
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    s = re.sub(r"[^a-z0-9ąćęłńóśźż ]+", " ", s.replace("ł", "l"))
    s = re.sub(r"^(the|a|an) ", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


def surname(a):
    w = [x for x in re.split(r"\s+", a.replace(".", " ")) if x and x.lower() not in ("jr", "sr")]
    return norm(w[-1]) if w else ""


def plausible(t):
    t = t.strip(" .,:;!?-–—*_\"'")
    if not (2 <= len(t) <= 80) or t.lower() in STOP:
        return None
    w = t.split()
    if not t[0].isupper() and not t[0].isdigit() or t in ("Summary", "Rating", "Topics", "Themes", "Anything", "Edit", "Spoilers", "Warning", "Mild", "Content"):
        return None
    if len(w) > 12 or GENERIC.match(t) and len(w) > 3:
        return None
    if len(w) > 1 and sum(x[:1].isupper() or x.lower() in {"of", "the", "a", "an", "and", "in", "on", "to", "for", "de", "la", "i", "w", "z", "na", "do", "o"} for x in w) < len(w) * 0.7:
        return None
    if not any(c.isalpha() for c in t) or re.search(r"https?:|www\.|\.com|reddit", t, re.I):
        return None
    return t


def mentions(text):
    """Return [(title, author or '')] found in one comment, de-duplicated."""
    found, seen = [], set()

    def add(t, a=""):
        t = plausible(t)
        if not t:
            return
        k = norm(t)
        if len(k) < 2 or k in seen:
            return
        seen.add(k); found.append((t, a.strip(" .,")))

    for m in MD.finditer(text):
        t = m.group(2)
        if "*" in t or "_" in t:
            continue
        tail = text[m.end():m.end() + 70]
        b = BY.match(tail)
        add(t, b.group(1) if b else "")
    for m in QUOTED.finditer(text):
        b = BY.match(text[m.end():m.end() + 70])
        if b:
            add(m.group(1), b.group(1))
    for m in PLAIN_BY.finditer(text):
        add(m.group(1), m.group(2))
    return found


def main():
    minc = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    cand = defaultdict(lambda: {"titles": defaultdict(int), "authors": defaultdict(int), "n": 0, "up": 0, "rank": 0.0, "subs": defaultdict(int), "threads": defaultdict(int), "comments": []})
    pair = defaultdict(float)
    ncom = 0
    for f in sorted(RAW.glob("texts_*.json")):
        for tid, th in json.loads(f.read_text(encoding="utf-8")).items():
            for cid, score, body in th["c"]:
                ms = mentions(body)
                ncom += 1
                if not ms or len(ms) > 40:
                    continue
                w = 1 / math.sqrt(len(ms))
                keys = []
                for t, a in ms:
                    k = norm(t)
                    c = cand[k]
                    c["titles"][t] += 1
                    if a:
                        c["authors"][a] += 1
                    c["n"] += 1
                    c["up"] += max(score, 0)
                    c["rank"] += w * (1 + math.log1p(max(score, 0)))
                    c["subs"][th["sub"]] += 1
                    c["threads"][th["t"]] += 1
                    if len(c["comments"]) < 4 and 40 < len(body) < 400:
                        c["comments"].append(body[:300])
                    keys.append(k)
                for i, a in enumerate(keys):
                    for b in keys[i + 1:]:
                        pair[(a, b)] += 1; pair[(b, a)] += 1
    print(ncom, "comments,", len(cand), "distinct candidate titles")
    out = {}
    for k, c in cand.items():
        if c["n"] < minc:
            continue
        title = max(c["titles"], key=lambda t: (c["titles"][t], t[:1].isupper(), len(t)))
        author = max(c["authors"], key=c["authors"].get) if c["authors"] else ""
        out[k] = {"title": title, "author": author, "n": c["n"], "up": c["up"], "rank": round(c["rank"], 2),
                  "subs": dict(c["subs"]), "threads": [t for t, _ in sorted(c["threads"].items(), key=lambda x: -x[1])[:3]], "comments": c["comments"][:3]}
    rel = defaultdict(list)
    for (a, b), v in pair.items():
        if a in out and b in out and v >= 2:
            rel[a].append((v, b))
    for a, L in rel.items():
        out[a]["related"] = [[b, v] for v, b in sorted(L, reverse=True)[:12]]
    (HERE / "candidates.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    top = sorted(out.items(), key=lambda kv: -kv[1]["rank"])[:40]
    print(len(out), "candidates with at least", minc, "comments")
    for k, c in top:
        print(f'{c["rank"]:7.1f} {c["n"]:4d}  {c["title"]} | {c["author"]}')


if __name__ == "__main__":
    main()
