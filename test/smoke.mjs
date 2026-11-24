// 도구 8종을 실제 MCP 클라이언트(stdio)로 호출해 보는 시험
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/server.js"] }));
const { tools } = await client.listTools();
console.log("도구:", tools.map((t) => t.name).join(", "));
const cases = [
  ["list_cheatkey_sections", {}],
  ["ask_cheatkey", { question: "착공 서류가 들어왔는데 뭘 확인해야 해?" }],
  ["search_cheatkey", { query: "BF 인증", kind: "manual" }],
  ["get_cheatkey_doc", { id: "task/가설건축물" }],
  ["get_workflow", { name: "준공검사" }],
  ["find_tool", { task: "지연배상금 계산" }],
  ["search_qa", { query: "방수공사 하자담보책임기간" }],
  ["get_qa", { id: "M10728" }],
];
let fail = 0;
for (const [name, args] of cases) {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content?.[0]?.text || "";
  const ok = !r.isError && t.length > 80;
  if (!ok) fail++;
  console.log(`\n${ok ? "✔" : "✘"} ${name} (${t.length}자)\n` + t.slice(0, 700));
}
await client.close();
if (tools.length !== 8 || fail) { console.error(`\n실패 ${fail}건`); process.exit(1); }
console.log("\n모두 통과");
