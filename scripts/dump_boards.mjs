// wf_boards.js(JS 객체) → JSON. 앞부분에 잘린 중복 블록이 있으면 마지막 "WF_BOARDS={" 부터 다시 읽는다.
import fs from "fs"; import vm from "vm";
const src = fs.readFileSync(process.argv[2], "utf8");
function run(code) { const c = {}; vm.runInNewContext(code + ";this.B=WF_BOARDS;this.O=typeof WF_ORDER!=='undefined'?WF_ORDER:null", c); return c; }
let c, repaired = false;
try { c = run(src); } catch (e) {
  const i = src.lastIndexOf("WF_BOARDS={");
  c = run("var " + src.slice(i)); repaired = true;
}
process.stdout.write(JSON.stringify({ boards: c.B, order: c.O, repaired }));
