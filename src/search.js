// 색인 로딩 + 한글 2글자(바이그램) BM25 검색
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

export const DOCS = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "docs.json"), "utf-8"));
export const QA = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA_DIR, "qa.json.gz"))).toString("utf-8"));
export const META = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "meta.json"), "utf-8"));
export const DOC_BY_ID = new Map(DOCS.map((d) => [d.id, d]));
export const QA_BY_ID = new Map(QA.map((q) => [q[0], q]));

// ── 토큰화: 질문 어미 제거 → 한글은 2글자 조각, 영문·숫자는 단어
const ENDINGS = /(인가요|인지요|일까요|할까요|하나요|되나요|있나요|없나요|맞나요|건가요|가요|나요|까요|해요|돼요|어요|아요|에요|예요|해줘|알려줘|알려주세요|보여줘|정리해줘|찾아줘|해주세요|해야\s*해|하면|이면|인데|은요|는요|이야)$/;
const STOP = new Set(["어떻게", "무엇", "뭐야", "뭔가", "언제", "어디", "누가", "있어", "하는", "에서", "으로", "치트키", "관련", "대해", "대한", "궁금", "알고", "싶어"]);

export function tokenize(text) {
  const out = [];
  const words = String(text || "").toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/);
  for (let w of words) {
    if (!w) continue;
    w = w.replace(ENDINGS, "");
    if (!w || STOP.has(w)) continue;
    if (/^[0-9a-z]+$/.test(w)) { out.push(w); continue; }
    if (w.length === 1) { out.push(w); continue; }
    for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
  }
  return out;
}

class BM25 {
  constructor(fields, k1 = 1.2, b = 0.75) {
    this.k1 = k1; this.b = b; this.post = new Map(); this.len = []; this.N = 0;
    fields.forEach((f, i) => this.add(i, f));
    this.avg = this.len.reduce((a, c) => a + c, 0) / Math.max(1, this.N);
  }
  add(i, { title, body, titleWeight = 3 }) {
    const tf = new Map();
    for (const t of tokenize(title)) tf.set(t, (tf.get(t) || 0) + titleWeight);
    for (const t of tokenize(body)) tf.set(t, (tf.get(t) || 0) + 1);
    let n = 0;
    for (const [t, c] of tf) { n += c; let p = this.post.get(t); if (!p) this.post.set(t, (p = [])); p.push(i, c); }
    this.len[i] = n; this.N++;
  }
  search(query, filter, limit = 10) {
    const terms = [...new Set(tokenize(query))];
    const score = new Map();
    for (const t of terms) {
      const p = this.post.get(t); if (!p) continue;
      const df = p.length / 2;
      const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
      for (let j = 0; j < p.length; j += 2) {
        const i = p[j], tf = p[j + 1];
        if (filter && !filter(i)) continue;
        const s = idf * (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * this.len[i] / this.avg));
        score.set(i, (score.get(i) || 0) + s);
      }
    }
    const maxPossible = terms.reduce((a, t) => {
      const p = this.post.get(t); if (!p) return a;
      return a + Math.log(1 + (this.N - p.length / 2 + 0.5) / (p.length / 2 + 0.5)) * (this.k1 + 1);
    }, 0) || 1;
    return [...score].sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([i, s]) => ({ i, score: s, rel: s / maxPossible, matched: terms.length }));
  }
}

const docIndex = new BM25(DOCS.map((d) => ({ title: d.title + " " + (d.tags || []).join(" "), body: d.text })));
const qaIndex = new BM25(QA.map((q) => ({ title: q[2] + " " + q[3], body: (q[6] || "") + " " + String(q[7] || "").slice(0, 1500) })));

export function searchDocs(query, { kinds, limit = 8 } = {}) {
  const ks = kinds && kinds.length ? new Set(kinds) : null;
  return docIndex.search(query, ks ? (i) => ks.has(DOCS[i].kind) : null, limit).map((r) => ({ doc: DOCS[r.i], score: r.score, rel: r.rel }));
}

export function searchQA(query, { source, limit = 8 } = {}) {
  return qaIndex.search(query, source ? (i) => QA[i][1].includes(source) : null, limit).map((r) => ({ qa: QA[r.i], score: r.score, rel: r.rel }));
}

// 질의어 주변 발췌
export function snippet(text, query, len = 220) {
  const t = String(text || "").replace(/\s+/g, " ");
  const toks = tokenize(query).filter((x) => x.length >= 2);
  let pos = -1;
  for (const k of toks) { pos = t.indexOf(k); if (pos >= 0) break; }
  const start = Math.max(0, pos < 0 ? 0 : pos - 60);
  return (start > 0 ? "…" : "") + t.slice(start, start + len) + (start + len < t.length ? "…" : "");
}
