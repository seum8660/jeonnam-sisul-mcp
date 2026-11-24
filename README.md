# 전남시설 MCP (jeonnam-sisul-mcp)

「학교시설업무 치트키」 사이트(https://seum8660.github.io/school_bible/)와 치트키 책, 질의회신을
Claude가 직접 검색·조회하도록 해 주는 MCP 서버입니다. 만든 사람: 승민(claude_min)

## 들어 있는 자료

| 종류 | 건수 | 원본 |
|---|---|---|
| 매뉴얼·지침 요약 | 59 | `vault/매뉴얼` + `manuals/manifest.json`(원문 PDF) |
| 업무 · 단계 | 48 · 7 | `vault/업무`, `vault/단계` |
| 세부 워크플로우 | 54 | `vault/워크플로우` |
| 프로세스 보드 | 26 | `wf_boards.js` (단계·담당·근거·시기·산출물) |
| 법령 연결 · 인증 | 39 · 9 | `vault/법령`, `vault/인증` |
| 산출·판정 도구 | 91 | 사이트 루트의 대시보드·계산기 화면 |
| 질의회신 | 15,070 | `molit-faq` (국토부 11,821 · 국민신문고 3,225 · 주제별 의견 24) |

건수는 색인 시점 기준이며 `data/meta.json`에 기록됩니다.

## 도구 8종

| 도구 | 하는 일 |
|---|---|
| `ask_cheatkey` | 질문 하나로 책·문서·보드·도구·질의회신 근거를 한 번에 (관련도 낮으면 ⚠) |
| `search_cheatkey` | 키워드 검색, kind로 book·manual·task·workflow·board·tool 등 제한 |
| `get_cheatkey_doc` | 문서 본문 읽기(절 지정·이어 읽기), 요약문서·원문 PDF 주소 |
| `get_workflow` | 업무 이름 → 단계별 담당·구분·근거 법령·시기·산출물 표 |
| `find_tool` | 할 일 → 치트키 계산기·대시보드 주소 |
| `search_qa` / `get_qa` | 질의회신 검색과 전문 (2020년 이전 회신은 「회신 당시 법령 기준」 표시) |
| `list_cheatkey_sections` | 단계·책 구성·보드 목록·자료 건수 (연결 확인용) |

모든 답에 "법령은 국가법령정보센터 현행 원문과 대조" 안내가 붙습니다. 법령 MCP와 함께 쓰십시오.

---

## 1. 원격 배포 (아이패드만으로 가능)

GitHub Actions가 색인 생성 → 시험 → Fly.io 배포까지 합니다. 사람이 할 일은 비밀값 두 개 입력뿐입니다.

1. **Fly.io 토큰**: fly.io 로그인 → Account → Access Tokens → Create token → 값 복사
2. **GitHub 비밀값**: 이 저장소 → Settings → Secrets and variables → Actions → New repository secret
   - `FLY_API_TOKEN` : 1번 값
   - `MCP_PATH` : 비밀 경로. `/`로 시작하고 `/mcp`로 끝나게 (예: `/jn-7f3k9q2x-sisul/mcp`)
3. **첫 배포**: Actions → 색인갱신 → Run workflow (force 체크) → 초록색 확인
   - 앱(`jeonnam-sisul-mcp`)이 없으면 워크플로가 만듭니다.
4. **확인**: `https://jeonnam-sisul-mcp.fly.dev/` 에 `{"ok":true,...}` 가 보이면 성공
5. **커넥터 등록**: claude.ai → 설정 → 커넥터 → 사용자 지정 커넥터 추가
   주소: `https://jeonnam-sisul-mcp.fly.dev` + MCP_PATH

- 비밀 경로(MCP_PATH)가 곧 열쇠입니다. 공유할 사람에게만 알려 주십시오.
- 앱 이름이 이미 쓰이고 있으면 `fly.toml`의 `app` 값을 바꾸고 다시 실행하십시오.
- 메모리 512MB(실측 약 330MB)로 설정했습니다.

## 2. 자동 갱신

| 언제 | 무엇이 |
|---|---|
| 치트키 저장소 main 푸시 | (치트키 쪽 `MCP알림` 워크플로가 있으면) 바로 신호 → 색인갱신 |
| 매일 10:17 · 18:17 | 치트키 커밋이 바뀌었으면 색인갱신 |
| 이 저장소 코드·책 수정 푸시 | 색인갱신 + 배포 |

색인 내용이 실제로 바뀐 경우에만 커밋·배포합니다. 시험(test/smoke.mjs)에 실패하면 배포하지 않습니다.

**치트키 책 원고**: 2026-11-24 저장소에서 내림(책 본문 외부 공개 방지). `book/`은 비워 둠.

## 3. 내 PC(Claude Desktop)에서 쓰기 — 선택

```
git clone https://github.com/seum8660/jeonnam-sisul-mcp C:\클로드\jeonnam-sisul-mcp
cd C:\클로드\jeonnam-sisul-mcp
npm install
```
`claude_desktop_config.json`의 `mcpServers`에 추가:
```json
"jeonnam-sisul": { "command": "node", "args": ["C:\\클로드\\jeonnam-sisul-mcp\\src\\server.js"] }
```
원격 커넥터를 등록했다면 이 단계는 필요 없습니다.

## 파일 구성

```
src/server.js            MCP 서버 (stdio / --http, 비밀 경로 MCP_PATH)
src/search.js            색인 로딩 + 한글 2글자 BM25 검색
scripts/build_index.py   치트키 저장소 + book/ → data/ 색인
scripts/dump_boards.mjs  wf_boards.js → JSON (앞부분 잘린 중복 블록 자동 우회)
scripts/book_loader.py   book/*.md 읽기
scripts/split_book.py    책 HTML → book/ 장별 .md
data/                    docs.json · qa.json.gz · meta.json
book/                    (비어 있음 — 책 원고는 공개하지 않음)
book_src/                새 책 HTML을 넣는 곳(자동 분할)
test/smoke.mjs           도구 8종 호출 시험
Dockerfile · fly.toml    Fly.io 배포
.github/workflows/색인갱신.yml
```

## 원칙
- 공문·내부문서·개인정보·업체명은 색인에 넣지 않습니다. API 키는 저장소에 두지 않습니다.
- 법령 개정·시행 여부는 법령 MCP(search_law → get_law_text) 현행 본문으로 확인합니다.
