"""book/*.md (치트키 책 장별 원고) → 색인 레코드 목록
build_index.py 에서:  from book_loader import load_book;  docs += load_book(ROOT / 'book')
"""
import json, re
from pathlib import Path

def load_book(book_dir):
    out = []
    for p in sorted(Path(book_dir).glob('[0-9][0-9][0-9]_*.md')):
        raw = p.read_text(encoding='utf-8')
        m = re.match(r'---\n(.*?)\n---\n', raw, re.S)
        meta = {}
        if m:
            for line in m.group(1).splitlines():
                k, _, v = line.partition(': ')
                try: meta[k] = json.loads(v)
                except Exception: meta[k] = v
            raw = raw[m.end():]
        out.append({
            'id': meta.get('id', 'book/' + p.stem),
            'kind': 'book',
            'title': meta.get('title', p.stem),
            'path': f"{meta.get('part','')} > {meta.get('section','')}".strip(' >'),
            'order': meta.get('order'),
            'qa_refs': meta.get('qa_refs', []),
            'source': meta.get('source'),
            'law_checked': meta.get('law_checked'),
            'text': raw.strip(),
        })
    return out

if __name__ == '__main__':
    import sys
    d = load_book(sys.argv[1] if len(sys.argv) > 1 else 'book')
    print(len(d), 'docs,', sum(len(x['text']) for x in d), 'chars')
