// 전남시설 MCP — 학교시설 치트키(사이트·책·질의회신) 검색 서버
// 실행: node src/server.js          → stdio (Claude Desktop)
//       node src/server.js --http   → Streamable HTTP (Fly.io), 경로는 MCP_PATH(기본 /mcp)
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { DOCS, QA, META, DOC_BY_ID, QA_BY_ID, searchDocs, searchQA, snippet } from "./search.js";

const NAME = "jeonnam-sisul-mcp";
const NOTE = "\n\n---\n※ 치트키는 해설 자료이고 질의회신은 법적 구속력이 없습니다. 법령은 국가법령정보센터 현행 원문과 대조하십시오." +
  ` (색인 ${META.built_at} · 치트키 ${META.school_bible || "-"})`;
const WEAK = 0.12; // 관련도 이 값 미만이면 ⚠ 표시

const KIND_LABEL = { manual: "매뉴얼 요약", task: "업무", stage: "단계", workflow: "워크플로우", board: "프로세스 보드", law: "법령 연결", cert: "인증", tool: "산출·판정 도구", book: "치트키 책" };
const KINDS = Object.keys(KIND_LABEL);
const text = (t) => ({ content: [{ type: "text", text: t + NOTE }] });
const where = (d) => d.url ? ` — ${d.url}` : d.path ? ` — 책 ${d.path}` : "";
const docLine = (d, q) => `- **${d.title}** [${KIND_LABEL[d.kind]}] \`${d.id}\`${where(d)}\n  ${snippet(d.text, q)}`;
const qaLine = (r, q) => `- \`${r[0]}\` **${r[2]}** · ${r[4]} · ${r[5] || "-"} (${r[1]})\n  ${snippet((r[6] ? "Q " + r[6] + " A " : "") + r[7], q, 180)}`;

function boardMarkdown(d) {
  const out = [`# ${d.title}`, d.category, d.url ? `화면: ${d.url}` : "", ""];
  for (const st of d.stages) {
    out.push(`## ${st.단계}`, "| 담당 | 구분 | 업무 | 근거 | 시기 | 산출물 |", "|---|---|---|---|---|---|");
    for (const n of st.업무) out.push(`| ${n.담당} | ${n.구분} | ${n.업무} | ${n.근거 || "-"} | ${n.시기 || "-"} | ${n.산출물.join(", ") || "-"} |`);
    const notes = st.업무.filter((n) => n.설명).map((n) => `- ${n.id} ${n.설명}`);
    if (notes.length) out.push("", ...notes);
    out.push("");
  }
  return out.join("\n");
}

export function createServer() {
  const server = new McpServer({ name: NAME, version: "1.0.0" });

  server.registerTool("ask_cheatkey", {
    title: "치트키에 묻기",
    description: "학교시설 업무 질문 하나로 치트키 책·매뉴얼 요약·업무·워크플로우·프로세스 보드·계산 도구·질의회신 근거를 한 번에 모아 줍니다. 학교시설(신축·증축·리모델링, 설계·발주·감리·계약·준공·안전점검·인허가) 질문이면 가장 먼저 쓰십시오.",
    inputSchema: { question: z.string().describe("업무 질문(자연어)"), limit: z.number().int().min(1).max(10).optional().describe("자료 건수(기본 5)") },
  }, async ({ question, limit = 5 }) => {
    const docs = searchDocs(question, { kinds: ["book", "manual", "task", "workflow", "board", "stage", "law", "cert"], limit });
    const tools = searchDocs(question, { kinds: ["tool"], limit: 3 }).filter((r) => r.rel >= WEAK);
    const qas = searchQA(question, { limit: 4 });
    const weak = !docs.length || docs[0].rel < WEAK;
    const parts = [`# 「${question}」 치트키 자료`];
    if (weak) parts.push("⚠ 치트키에서 직접 맞는 자료를 찾지 못했습니다. 아래는 가까운 자료이니 그대로 답의 근거로 쓰지 마십시오.");
    parts.push("## 문서", docs.map((r) => docLine(r.doc, question)).join("\n") || "(없음)");
    if (tools.length) parts.push("## 쓸 수 있는 도구", tools.map((r) => `- ${r.doc.title} — ${r.doc.url}`).join("\n"));
    parts.push("## 질의회신", qas.map((r) => qaLine(r.qa, question)).join("\n") || "(없음)");
    parts.push("본문은 get_cheatkey_doc(id), 절차표는 get_workflow, 회신 전문은 get_qa(id)로 이어서 보십시오.");
    return text(parts.join("\n\n"));
  });

  server.registerTool("search_cheatkey", {
    title: "치트키 검색",
    description: "치트키 문서를 키워드로 검색합니다. kind로 종류를 좁힐 수 있습니다: book(치트키 책), manual(매뉴얼 요약), task(업무), workflow(워크플로우), board(프로세스 보드), stage(단계), law(법령 연결), cert(인증), tool(계산·판정 도구).",
    inputSchema: {
      query: z.string().describe("검색어"),
      kind: z.enum(KINDS).optional().describe("자료 종류"),
      limit: z.number().int().min(1).max(20).optional(),
    },
  }, async ({ query, kind, limit = 8 }) => {
    const rs = searchDocs(query, { kinds: kind ? [kind] : null, limit });
    if (!rs.length) return text(`⚠ 「${query}」에 맞는 치트키 자료가 없습니다.`);
    const warn = rs[0].rel < WEAK ? "⚠ 관련도가 낮습니다. 검색어를 바꿔 보십시오.\n\n" : "";
    return text(warn + rs.map((r) => docLine(r.doc, query)).join("\n"));
  });

  server.registerTool("get_cheatkey_doc", {
    title: "치트키 문서 읽기",
    description: "문서 id(예: book/k42, manual/…, task/…)로 본문을 읽습니다. 긴 문서는 offset으로 이어 읽고, section에 절 제목 일부를 주면 그 절부터 보여 줍니다. 매뉴얼은 요약문서·원문 PDF 주소를 함께 줍니다.",
    inputSchema: {
      id: z.string().describe("문서 id"),
      section: z.string().optional().describe("절 제목 일부(예: 처음 맡았다면)"),
      offset: z.number().int().min(0).optional().describe("이어 읽을 위치(글자)"),
    },
  }, async ({ id, section, offset = 0 }) => {
    let d = DOC_BY_ID.get(id);
    if (!d) { const r = searchDocs(id, { limit: 1 })[0]; if (r && r.rel >= WEAK) d = r.doc; }
    if (!d) return text(`⚠ 문서 \`${id}\`를 찾을 수 없습니다. search_cheatkey로 id를 먼저 확인하십시오.`);
    let body = d.kind === "board" ? boardMarkdown(d) : d.text;
    if (section) { const p = body.indexOf(section); if (p >= 0) body = body.slice(Math.max(0, body.lastIndexOf("\n", p))); }
    const SIZE = 7000, chunk = body.slice(offset, offset + SIZE);
    const head = [`# ${d.title}`, `[${KIND_LABEL[d.kind]}] \`${d.id}\``, d.url ? `화면·요약문서: ${d.url}` : "", d.pdf ? `원문 PDF: ${d.pdf}` : "", d.path ? `책 위치: ${d.path}` : ""].filter(Boolean).join("\n");
    const more = offset + SIZE < body.length ? `\n\n(이어 읽기: offset=${offset + SIZE}, 전체 ${body.length}자)` : "";
    return text(`${head}\n\n${chunk}${more}`);
  });

  server.registerTool("get_workflow", {
    title: "업무 절차표",
    description: "업무 이름(예: 준공검사, 설계변경, 공기연장 간접비, 감리 방식, 교육시설 안전인증)을 주면 프로세스 보드에서 단계별 담당·구분(선행·핵심·병목·후속)·근거 법령·시기·산출물 표를 돌려줍니다. 보드가 없으면 워크플로우 노트를 줍니다.",
    inputSchema: { name: z.string().describe("업무 이름") },
  }, async ({ name }) => {
    const b = searchDocs(name, { kinds: ["board"], limit: 3 });
    if (b.length && b[0].rel >= WEAK) {
      const others = b.slice(1).map((r) => `${r.doc.title}(\`${r.doc.id}\`)`).join(", ");
      return text(boardMarkdown(b[0].doc) + (others ? `\n비슷한 보드: ${others}` : ""));
    }
    const w = searchDocs(name, { kinds: ["workflow", "task", "book"], limit: 3 });
    if (!w.length) return text(`⚠ 「${name}」 절차를 찾지 못했습니다.`);
    return text(`⚠ 프로세스 보드가 없어 관련 노트를 드립니다.\n\n# ${w[0].doc.title}${where(w[0].doc)}\n\n${w[0].doc.text.slice(0, 6000)}\n\n다른 후보: ${w.slice(1).map((r) => r.doc.id).join(", ")}`);
  });

  server.registerTool("find_tool", {
    title: "치트키 계산기·대시보드 찾기",
    description: "하려는 일(예: 지연배상금 계산, 공사기간 산정, 물가변동 판정, 설계용역비 산출)을 말하면 치트키 사이트의 계산기·판정기·대시보드 주소를 찾아 줍니다.",
    inputSchema: { task: z.string().describe("하려는 일") },
  }, async ({ task }) => {
    const rs = searchDocs(task, { kinds: ["tool"], limit: 6 });
    if (!rs.length || rs[0].rel < WEAK) return text(`⚠ 「${task}」에 맞는 도구를 찾지 못했습니다. 치트키 첫 화면: https://seum8660.github.io/school_bible/`);
    return text(rs.map((r) => `- **${r.doc.title}** — ${r.doc.url}\n  ${String(r.doc.desc || "").slice(0, 160)}`).join("\n"));
  });

  server.registerTool("search_qa", {
    title: "질의회신 검색",
    description: "국토교통부 민원마당 질의회신(11,821건), 국민신문고 공사계약·시설 회신(3,225건), 치트키 주제별 의견(24건)을 검색합니다. source로 '국토부', '국민신문고', '주제별'을 고를 수 있습니다.",
    inputSchema: {
      query: z.string().describe("검색어"),
      source: z.enum(["국토부", "국민신문고", "주제별"]).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
  }, async ({ query, source, limit = 8 }) => {
    const src = source === "국토부" ? "국토부 민원마당" : source === "주제별" ? "주제별 의견" : source;
    const rs = searchQA(query, { source: src, limit });
    if (!rs.length) return text(`⚠ 「${query}」 질의회신이 없습니다.`);
    const warn = rs[0].rel < WEAK ? "⚠ 관련도가 낮습니다. 검색어를 바꿔 보십시오.\n\n" : "";
    return text(warn + rs.map((r) => qaLine(r.qa, query)).join("\n") + "\n\n전문은 get_qa(id)로 보십시오.");
  });

  server.registerTool("get_qa", {
    title: "질의회신 전문",
    description: "질의회신 id(예: M10728, E1, O-design-change)로 질의와 회신 전문을 봅니다.",
    inputSchema: { id: z.string().describe("질의회신 id") },
  }, async ({ id }) => {
    const k = id.trim().replace(/^#/, "");
    const r = QA_BY_ID.get(k) || QA_BY_ID.get("M" + k);
    if (!r) return text(`⚠ 질의회신 \`${id}\`가 없습니다.`);
    const old = /^(19|20[01]\d)/.test(r[5]) && Number(r[5].slice(0, 4)) < 2020 ? "\n※ 2020년 이전 회신 — 회신 당시 법령 기준입니다." : "";
    return text(`# ${r[2]}\n\`${r[0]}\` · ${r[1]} · ${r[4]} · ${r[5] || "-"} · 분야 ${r[3] || "-"}${old}\n\n## 질의\n${r[6] || "(원문에 질의 요약 없음)"}\n\n## 회신\n${r[7]}`);
  });

  server.registerTool("list_cheatkey_sections", {
    title: "치트키 목차",
    description: "치트키의 단계(7장), 치트키 책 편·부 구성, 프로세스 보드 목록과 자료 건수를 보여 줍니다. 연결 확인용으로도 씁니다.",
    inputSchema: {},
  }, async () => {
    const stages = DOCS.filter((d) => d.kind === "stage").map((d) => `- ${d.title}`).join("\n");
    const parts = {};
    for (const d of DOCS.filter((x) => x.kind === "book")) parts[d.path || "-"] = (parts[d.path || "-"] || 0) + 1;
    const boards = DOCS.filter((d) => d.kind === "board").map((d) => `${d.title}(\`${d.id}\`)`).join(" · ");
    const counts = Object.entries(META.counts).map(([k, v]) => `${KIND_LABEL[k] || (k === "qa" ? "질의회신" : k)} ${v}`).join(" · ");
    return text(`# 학교시설 치트키 목차\n사이트: https://seum8660.github.io/school_bible/\n\n## 자료 건수\n${counts}\n\n## 단계\n${stages}\n\n## 치트키 책\n${Object.entries(parts).map(([k, v]) => `- ${k} (${v})`).join("\n")}\n\n## 프로세스 보드\n${boards}`);
  });

  return server;
}

// ── 실행
const httpMode = process.argv.includes("--http") || !!process.env.FLY_APP_NAME;
if (httpMode) {
  const MCP_PATH = process.env.MCP_PATH || "/mcp";
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/", (_req, res) => res.json({ ok: true, name: NAME, built_at: META.built_at, counts: META.counts }));
  app.post(MCP_PATH, async (req, res) => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[전남시설 MCP] 요청 처리 오류:", err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  const na = (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  app.get(MCP_PATH, na); app.delete(MCP_PATH, na);
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => console.error(`[전남시설 MCP] HTTP 시작: 포트 ${PORT} (문서 ${DOCS.length} · 질의회신 ${QA.length})`));
} else {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`[전남시설 MCP] stdio 시작 (문서 ${DOCS.length} · 질의회신 ${QA.length})`);
}
