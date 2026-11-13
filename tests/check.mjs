// 코드 검사 (단순 수정 때 이것만, 기능 수정 때는 full.py 까지)
//   node tests/check.mjs
// 1) 문법 오류  2) 따옴표·괄호 짝(HTML·CSS·규칙)  3) 단추·화면이 가리키는 함수·id 가 실제로 있는지
// 4) 판 번호가 파일마다 같은지  5) 미리보기(demo)·파이어베이스 모듈에서 가져오는 이름이 다 있는지
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const fails = [], oks = [];
const ok = (m) => oks.push(m), bad = (m) => fails.push(m);

// ───── 1) 문법 ─────
const JS = ["app.js", "bank.js", "figure.js", "config.js", "sw.js", "qrcode.js", ...["firebase-app", "firebase-app-check", "firebase-auth", "firebase-firestore", "firebase-ai", "seed"].map((n) => `demo/${n}.js`)].filter((f) => existsSync(join(ROOT, f)));
const tmp = mkdtempSync(join(tmpdir(), "ttosil-"));
function syntax(name, code) {
  // 모듈(import/export)로 읽어 문법만 검사
  const f = join(tmp, name.replace(/[\\/]/g, "_") + ".mjs"); writeFileSync(f, code);
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) bad(`문법 오류: ${name}\n   ${(r.stderr || "").split("\n").filter((l) => /Error|^\s*\^/.test(l) || /:\d+$/.test(l)).slice(0, 3).join("\n   ")}`);
  return r.status === 0;
}
let synOk = JS.every((f) => syntax(f, read(f)));
const html = read("index.html");
[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => { synOk = syntax(`index.html 안 스크립트 ${i + 1}`, m[1]) && synOk; });
if (synOk) ok(`문법: JS ${JS.length}개 + index.html 안 스크립트 이상 없음`);

// ───── 2) 짝 맞추기 ─────
function pairs(name, text) {
  const st = [], open = "([{", close = ")]}";
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") line++;
    if (text.startsWith("/*", i)) { const j = text.indexOf("*/", i + 2); line += (text.slice(i, j).match(/\n/g) || []).length; i = j + 1; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < text.length && text[j] !== c && text[j] !== "\n") { if (text[j] === "\\") j++; j++; } if (text[j] !== c) { bad(`${name} ${line}째 줄: 따옴표(${c}) 짝이 없어요`); return false; } i = j; continue; }
    if (open.includes(c)) st.push([c, line]);
    else if (close.includes(c)) { const t = st.pop(); if (!t || open.indexOf(t[0]) !== close.indexOf(c)) { bad(`${name} ${line}째 줄: 괄호 "${c}" 짝이 안 맞아요`); return false; } }
  }
  if (st.length) { bad(`${name} ${st[st.length - 1][1]}째 줄: 괄호 "${st[st.length - 1][0]}" 가 닫히지 않았어요`); return false; }
  return true;
}
const p1 = pairs("style.css", read("style.css"));
const p2 = pairs("파이어베이스-규칙.txt", read("파이어베이스-규칙.txt").replace(/\/\/.*$/gm, ""));
// HTML 태그 짝 (script·style 안은 빼고)
function tags(name, text) {
  const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
  const body = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "");
  const st = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const [, end, tagRaw, attrs] = m, tag = tagRaw.toLowerCase();
    if ((attrs.match(/"/g) || []).length % 2) { bad(`${name}: <${tag}> 의 따옴표 짝이 안 맞아요`); return false; }
    if (VOID.has(tag) || /\/\s*$/.test(attrs) || tag === "!doctype") continue;
    if (!end) st.push(tag);
    else { const t = st.pop(); if (t !== tag) { bad(`${name}: </${tag}> 가 <${t || "없음"}> 과 짝이 안 맞아요`); return false; } }
  }
  if (st.length) { bad(`${name}: <${st.pop()}> 가 닫히지 않았어요`); return false; }
  return true;
}
const p3 = tags("index.html", html);
try { JSON.parse(read("manifest.webmanifest")); } catch (e) { bad("manifest.webmanifest: JSON 형식 오류 " + e.message); }
if (p1 && p2 && p3) ok("짝 맞추기: style.css · index.html · 규칙 이상 없음");

// ───── 3) 단추·id·동작 ─────
const app = read("app.js");
const ids = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]).concat([...app.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1])));
const used = new Set([...app.matchAll(/\$\(\s*["'`]#([\w-]+)["'`]\s*\)/g), ...app.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)].map((m) => m[1]));
const missing = [...used].filter((i) => !ids.has(i));
if (missing.length) bad("없는 화면 요소를 찾아요(id): " + missing.join(", "));
// data-act="x" 단추마다 act === "x" 처리가 있는지
const acts = new Set([...app.matchAll(/data-act="([\w-]+)"/g)].map((m) => m[1]));
const handled = new Set([...app.matchAll(/act\s*===\s*"([\w-]+)"/g)].map((m) => m[1]));
const noHandler = [...acts].filter((a) => !handled.has(a));
if (noHandler.length) bad("눌러도 아무 일 없는 단추(data-act): " + noHandler.join(", "));
// onclick="함수()" 가 있으면 그 함수가 있는지
const fnNames = new Set([...app.matchAll(/function\s+([\w$]+)\s*\(/g), ...app.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=/g), ...app.matchAll(/window\.([\w$]+)\s*=/g)].map((m) => m[1]));
const inline = [...(html + app).matchAll(/\bon(?:click|change|input|submit)="([\w$]+)\(/g)].map((m) => m[1]).filter((f) => !fnNames.has(f));
if (inline.length) bad("없는 함수를 부르는 단추(onclick): " + [...new Set(inline)].join(", "));
// 부르는 함수가 정의돼 있는지 (자주 쓰는 이름만이 아니라 app.js 안 함수 호출 전체)
const BUILTIN = new Set("if for while switch catch return typeof function await new import export super Number String Boolean Array Object JSON Math Date Promise Error Set Map RegExp parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent setTimeout clearTimeout setInterval clearInterval requestAnimationFrame fetch alert confirm prompt atob btoa structuredClone queueMicrotask Image Blob URL File FileReader Notification TextEncoder TextDecoder AbortController Uint8Array CustomEvent DOMParser Intl Symbol escape async URLSearchParams matchMedia getComputedStyle print open close scrollTo ResizeObserver IntersectionObserver MutationObserver Event Function BigInt".split(" "));
const imported = new Set([...app.matchAll(/import\s*\{([^}]+)\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop())));
const params = new Set([...app.matchAll(/\(([^()]*)\)\s*=>/g), ...app.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g), ...app.matchAll(/([\w$]+)\s*=>/g)].flatMap((m) => m[1].split(/[,{}\[\]=\s.]+/)).filter(Boolean));
const calls = new Set([...app.replace(/\/\/.*$/gm, "").replace(/`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (s) => s.replace(/[^${}]/g, " ")).matchAll(/(?<![\w$.])([a-zA-Z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
const undef = [...calls].filter((c) => !fnNames.has(c) && !imported.has(c) && !BUILTIN.has(c) && !params.has(c));
if (undef.length) bad("정의되지 않은 함수를 불러요: " + undef.join(", "));
if (!missing.length && !noHandler.length && !inline.length && !undef.length) ok(`단추·id: id ${used.size}개, 동작 단추 ${acts.size}종, 함수 호출 ${calls.size}종 모두 있음`);

// ───── 4) 판 번호 ─────
const vApp = (app.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
const vSw = (read("sw.js").match(/VERSION\s*=\s*"([^"]+)"/) || [])[1];
const vHtml = (html.match(/name="app-version"\s+content="([^"]+)"/) || [])[1];
if (!vApp || vApp !== vSw || vApp !== vHtml) bad(`판 번호가 달라요: app.js ${vApp} / sw.js ${vSw} / index.html ${vHtml}`);
else ok("판 번호: " + vApp + " (app.js · sw.js · index.html 같음)");

// ───── 5) 가져오는 이름 ─────
let impOk = true;
for (const m of app.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
  const names = m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
  const src = m[2];
  const files = src.startsWith("./") ? [src.slice(2)] : /firebase-[\w-]+\.js$/.test(src) ? [`demo/${src.match(/(firebase-[\w-]+\.js)$/)[1]}`] : [];
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue;
    const t = read(f);
    const lost = names.filter((n) => !new RegExp(`export\\s+(?:async\\s+)?(?:const|let|var|function|class)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`).test(t));
    if (lost.length) { impOk = false; bad(`${f} 에 없는 이름을 가져와요: ${lost.join(", ")}`); }
  }
}
if (impOk) ok("가져오기: config·bank·figure·미리보기 모듈 이름 모두 있음");

// ───── 결과 ─────
console.log(oks.map((m) => "  통과  " + m).join("\n"));
if (fails.length) { console.log(fails.map((m) => "  실패  " + m).join("\n")); console.log(`\n코드 검사: 실패 ${fails.length}건`); process.exit(1); }
console.log("\n코드 검사: 모두 통과");
