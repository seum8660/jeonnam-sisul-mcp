"""치트키 책 HTML → book/ 장별 .md 분할"""
import sys, re, os, json
from bs4 import BeautifulSoup
from markdownify import markdownify as md

src, out = sys.argv[1], sys.argv[2]
soup = BeautifulSoup(open(src, encoding='utf-8').read(), 'lxml')
for t in soup(['script', 'style', 'svg', 'img', 'canvas', 'button', 'input', 'select', 'noscript', 'iframe']):
    t.decompose()
# 화면 조작용 UI 제거
for t in soup.select('nav, .toolbar, .tb, [aria-hidden="true"]'):
    t.decompose()

SKIP = {'game', 'thanks', 'colophon', 'flow', 'flowmap2', 'bldg3d', 'fig1'}  # 게임·감사의 글(인명)·그림 전용
for d in soup.find_all(['div','figcaption','header','footer','article','aside']):
    if not d.find(['table','ul','ol','h1','h2','h3','h4','p','div']):
        d.name='p'
for sp in soup.find_all(['span','b','strong','em','small']):
    sp.append(' ')
secs = [x for x in soup.find_all('section') if not x.find_parent('section')]

part = '머리말'; sub = ''
order = 0; index = []
os.makedirs(out, exist_ok=True)

def slug(s):
    s = re.sub(r'[\\/:*?"<>|]', '', s)
    s = re.sub(r'\s+', '_', s.strip())
    return s[:40]

for sec in secs:
    sid = sec.get('id') or ''
    cls = (sec.get('class') or ['-'])[0]
    h = sec.find(['h1', 'h2'])
    title = h.get_text(' ', strip=True) if h else sid
    if cls == 'divider':
        t = sec.get_text(' ', strip=True)
        m = re.match(r'(제\d편|부록)\s*(.*)', t)
        if m and not t.startswith('제7부'):
            part = (m.group(1) + ' ' + m.group(2)).strip(); sub = ''
        else:
            sub = t
        if t.startswith('제') and '부' in t[:4]:
            sub = re.sub(r'\s+', ' ', t)
        continue
    if sid in SKIP:
        continue
    body = md(str(sec), heading_style='ATX', bullets='-', strip=['a', 'span', 'div', 'section', 'figure', 'header', 'footer', 'article', 'aside'])
    body = re.sub(r'\n{3,}', '\n\n', body).strip()
    body = re.sub(r'[ \t]+\n', '\n', body)
    body = re.sub(r'\*\*\s+', '**', body); body = re.sub(r'  +', ' ', body); body = re.sub(r'\*\*([^*\n]+)\*\*(?=\S)', r'**\1** ', body); body = re.sub(r' +([)%,.])', r'\1', body)
    if len(body) < 80:
        continue
    order += 1
    # 질의회신 근거 태그
    qa_tags = sorted(set(re.findall(r'#질의회신\(([^)]+)\)', body)) - {'제목 키워드'})
    fname = f"{order:03d}_{sid}_{slug(re.sub(r'^\d+\.\s*', '', title))}.md"
    fm = {
        'title': title, 'id': f'book/{sid}', 'kind': 'book',
        'part': part, 'section': sub, 'order': order,
        'source': '학교시설 치트키 전자책 (2026.11.13 판)',
        'law_checked': '2026-11-03',
    }
    head = '---\n' + ''.join(f'{k}: {json.dumps(v, ensure_ascii=False)}\n' for k, v in fm.items())
    if qa_tags:
        head += 'qa_refs: ' + json.dumps(qa_tags, ensure_ascii=False) + '\n'
    head += '---\n\n'
    if not body.lstrip().startswith('#'):
        body = f'# {title}\n\n' + body
    body += '\n\n> 법령은 국가법령정보센터 현행 원문과 대조하십시오. (책 근거법령 대조일 2026. 11. 3.)\n'
    open(os.path.join(out, fname), 'w', encoding='utf-8').write(head + body)
    index.append({'file': fname, **fm, 'chars': len(body)})

json.dump(index, open(os.path.join(out, '_목차.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(order, 'files', sum(i['chars'] for i in index), 'chars')
