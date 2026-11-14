"""치트키 저장소(school_bible) + book/ → data/ 색인 생성

사용: python scripts/build_index.py <school_bible 경로>
      (인자가 없으면 환경변수 SCHOOL_BIBLE, 그것도 없으면 ../school_bible)
결과: data/docs.json · data/qa.json.gz · data/meta.json
"""
import gzip, json, os, re, subprocess, sys, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://seum8660.github.io/school_bible/"
SB = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SCHOOL_BIBLE", ROOT.parent / "school_bible")).resolve()
sys.path.insert(0, str(ROOT / "scripts"))
from book_loader import load_book  # noqa: E402

if not (SB / "wf_boards.js").exists():
    sys.exit(f"치트키 저장소를 찾을 수 없습니다: {SB}")

docs = []

def fm_split(raw):
    m = re.match(r"---\n(.*?)\n---\n", raw, re.S)
    meta = {}
    if m:
        for line in m.group(1).splitlines():
            k, _, v = line.partition(":")
            v = v.strip()
            try:
                meta[k.strip()] = json.loads(v)
            except Exception:
                meta[k.strip()] = v.strip('"')
        raw = raw[m.end():]
    return meta, raw

def clean_md(t):
    t = re.sub(r"\[\[([^\]|]+)(\|[^\]]+)?\]\]", r"\1", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()

# ── 1. 매뉴얼 원문 PDF 주소 (manifest)
pdf_by_summary = {}
man = SB / "manuals" / "manifest.json"
if man.exists():
    for m in json.loads(man.read_text(encoding="utf-8")):
        if m.get("file"):
            pdf_by_summary[m["file"]] = {
                "pdf": SITE + "manuals/" + m["pdf"] if m.get("pdf") else None,
                "tags": m.get("tags", []), "kind_label": m.get("kind"),
            }

# ── 2. vault 노트
KIND = {"매뉴얼": "manual", "업무": "task", "단계": "stage", "워크플로우": "workflow", "법령": "law", "인증": "cert"}
for folder, kind in KIND.items():
    for p in sorted((SB / "vault" / folder).glob("*.md")):
        meta, body = fm_split(p.read_text(encoding="utf-8"))
        title = meta.get("title") or p.stem
        url = meta.get("사이트") or meta.get("요약문서")
        rec = {"id": f"{kind}/{p.stem}", "kind": kind, "title": title, "url": url,
               "category": meta.get("구분", ""), "text": clean_md(body)}
        if kind == "manual" and url:
            extra = pdf_by_summary.get(url.rsplit("/", 1)[-1])
            if extra:
                rec["pdf"] = extra["pdf"]; rec["tags"] = extra["tags"]
        docs.append(rec)

# ── 3. 프로세스 보드 26종 (wf_boards.js)
out = subprocess.run(["node", str(ROOT / "scripts" / "dump_boards.mjs"), str(SB / "wf_boards.js")],
                     capture_output=True, text=True, check=True).stdout
bd = json.loads(out)
strip = lambda s: re.sub(r"<[^>]+>", " ", s or "").strip()
for key in (bd["order"] or list(bd["boards"])):
    b = bd["boards"][key]
    lanes = {}
    for i, l in enumerate(b.get("LANES", [])):
        lh = b.get("laneHead", [])
        lanes[l] = lh[i][0] if i < len(lh) else l
    stages = []
    for si, s in enumerate(b.get("STAGES", [])):
        nodes = []
        for n in b.get("NODES", []):
            if n.get("s") != si:
                continue
            nodes.append({
                "id": n.get("id"), "담당": lanes.get(n.get("l"), n.get("l")),
                "구분": {"lead": "선행", "key": "핵심", "bot": "병목", "post": "후속"}.get(n.get("k"), n.get("k")),
                "업무": n.get("t"), "근거": n.get("law") or "", "시기": n.get("due") if n.get("due") not in ("—", None) else "",
                "산출물": n.get("chips") or [], "설명": n.get("lawT") or "",
            })
        stages.append({"단계": f'{s.get("k")} {s.get("n")}', "업무": nodes})
    lines = [b.get("title", ""), strip(b.get("sub")), strip(b.get("right"))]
    for st in stages:
        lines.append(f'## {st["단계"]}')
        for n in st["업무"]:
            lines.append(f'- [{n["담당"]}·{n["구분"]}] {n["업무"]}' + (f' (근거 {n["근거"]})' if n["근거"] else "")
                         + (f' · 시기 {n["시기"]}' if n["시기"] else "") + (f' · 산출물 {", ".join(n["산출물"])}' if n["산출물"] else "")
                         + (f'\n  {n["설명"]}' if n["설명"] else ""))
    docs.append({"id": f"board/{key}", "kind": "board", "title": b.get("title", key),
                 "url": SITE + "워크플로우_통합보드.html#" + key, "category": strip(b.get("kick")),
                 "lanes": list(lanes.values()), "stages": stages, "text": "\n".join(lines)})

# ── 4. 산출·판정 도구 (사이트 루트 HTML)
SKIP = {"index.html", "intro.html", "bible.html", "bible_notion.html", "macro_ready.html"}
for p in sorted(SB.glob("*.html")):
    if p.name in SKIP or p.name.startswith("그래프뷰"):
        continue
    html = p.read_text(encoding="utf-8", errors="ignore")[:300000]
    t = re.search(r"<title>(.*?)</title>", html, re.S)
    title = re.sub(r"\s+", " ", t.group(1)).strip() if t else p.stem
    d = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
    body = re.sub(r"<(script|style|svg)[\s\S]*?</\1>", " ", html)
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"&nbsp;|&amp;|&lt;|&gt;", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    desc = d.group(1) if d else body[:240]
    docs.append({"id": f"tool/{p.stem}", "kind": "tool", "title": title, "url": SITE + p.name,
                 "desc": desc, "text": f"{title}\n{desc}\n{body[:1500]}"})

# ── 5. 치트키 책 (book/)
for b in load_book(ROOT / "book"):
    b["url"] = None
    docs.append(b)

# ── 6. 질의회신
qa = []
def add_rows(path, prefix, src):
    rows = json.loads(gzip.open(path).read().decode("utf-8"))
    for r in rows:
        r = (list(r) + [""] * 8)[:8]
        no, title, field, org, dept, date, q, a = r
        qa.append([f"{prefix}{str(no).lstrip('E')}", src, title, field, f"{org} {dept}".strip(), date, q, a])
add_rows(SB / "molit-faq" / "data.bin", "M", "국토부 민원마당")
add_rows(SB / "molit-faq" / "epeople.bin", "E", "국민신문고")
op = SB / "molit-faq" / "opinions.json"
if op.exists():
    for o in json.loads(op.read_text(encoding="utf-8")):
        qa.append([f"O-{o['id']}", "주제별 의견", o.get("title", ""), " ".join(o.get("keywords", [])), "치트키 정리", "", "", o.get("opinion", "")])

# ── 저장
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data" / "docs.json").write_text(json.dumps(docs, ensure_ascii=False), encoding="utf-8")
with gzip.open(ROOT / "data" / "qa.json.gz", "wt", encoding="utf-8") as f:
    json.dump(qa, f, ensure_ascii=False)
try:
    sha = subprocess.run(["git", "-C", str(SB), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
except Exception:
    sha = ""
counts = {}
for d in docs:
    counts[d["kind"]] = counts.get(d["kind"], 0) + 1
counts["qa"] = len(qa)
meta = {"built_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M KST"),
        "school_bible": sha, "boards_repaired": bd.get("repaired"), "counts": counts}
(ROOT / "data" / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(meta, ensure_ascii=False))
