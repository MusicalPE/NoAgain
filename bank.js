// ─────────────────────────────────────────────
//  문제 은행: AI가 만든 "문제 틀"을 모아 두고, 다음에는 AI 없이 숫자만 바꿔 문제 만들기
//  틀(tpl): 문제 글에 {식} 자리를 두고, 숫자 규칙·답 계산식을 함께 적은 것
//  그대로(fixed): 숫자를 바꿀 수 없는 문제(국어·사회 개념 등)는 만든 문제를 그대로 모아 두기
//  ※ 은행에는 AI가 새로 쓴 문제만 들어가요. 사진·아이 답·이름은 넣지 않아요.
// ─────────────────────────────────────────────

// ───────── 분수 계산 (정확하게) ─────────
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
function Q(n, d = 1) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) throw new Error("0으로 나눔");
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    // 소수는 분수로 (소수 넷째 자리까지)
    const k = 10000; return Q(Math.round(n * k), Math.round(d * k));
  }
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d); return { n: n / g, d: d / g };
}
const qv = (x) => x.n / x.d;
const ops = {
  "+": (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d),
  "-": (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d),
  "*": (a, b) => Q(a.n * b.n, a.d * b.d),
  "/": (a, b) => Q(a.n * b.d, a.d * b.n),
  "%": (a, b) => { const r = qv(a) % qv(b); return Q(r); }
};
const cmp = { "<": (a, b) => qv(a) < qv(b), "<=": (a, b) => qv(a) <= qv(b), ">": (a, b) => qv(a) > qv(b), ">=": (a, b) => qv(a) >= qv(b),
  "==": (a, b) => a.n === b.n && a.d === b.d, "!=": (a, b) => !(a.n === b.n && a.d === b.d) };
const isQ = (x) => x && typeof x === "object" && "n" in x;
const toQ = (x) => { if (isQ(x)) return x; if (typeof x === "boolean") return Q(x ? 1 : 0); throw new Error("수가 아니에요"); };
const funcs = {
  gcd: (a, b) => Q(gcd(qv(a), qv(b))), lcm: (a, b) => Q(Math.abs(qv(a) * qv(b)) / gcd(qv(a), qv(b))),
  min: (...a) => a.reduce((x, y) => (qv(y) < qv(x) ? y : x)), max: (...a) => a.reduce((x, y) => (qv(y) > qv(x) ? y : x)),
  floor: (a) => Q(Math.floor(qv(a))), ceil: (a) => Q(Math.ceil(qv(a))), abs: (a) => Q(Math.abs(a.n), a.d),
  round: (a) => Q(Math.round(qv(a))), mod: (a, b) => ops["%"](a, b),
  isint: (a) => a.d === 1, num: (a) => Q(a.n), den: (a) => Q(a.d)
};

// ───────── 식 읽기 (eval 쓰지 않음: 은행의 틀은 남이 쓴 것일 수 있으니까) ─────────
function tokenize(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    let m = /^\d+(\.\d+)?/.exec(s.slice(i)); if (m) { out.push({ t: "num", v: m[0] }); i += m[0].length; continue; }
    m = /^[A-Za-z_]\w*/.exec(s.slice(i)); if (m) { out.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
    m = /^(<=|>=|==|!=|&&|\|\||[-+*/%(),<>!])/.exec(s.slice(i)); if (m) { out.push({ t: "op", v: m[0] }); i += m[0].length; continue; }
    throw new Error("읽을 수 없는 글자: " + c);
  }
  return out;
}
export function evalExpr(src, vars) {
  const tk = tokenize(String(src)); let p = 0;
  const peek = () => tk[p], eat = (v) => { const t = tk[p]; if (!t || (v && t.v !== v)) throw new Error("식이 이상해요: " + src); p++; return t; };
  const or = () => { let a = and(); while (peek() && peek().v === "||") { eat(); const b = and(); a = !!(a === true || (isQ(a) && a.n)) || !!(b === true || (isQ(b) && b.n)); } return a; };
  const and = () => { let a = rel(); while (peek() && peek().v === "&&") { eat(); const b = rel(); a = !!(a === true || (isQ(a) && a.n)) && !!(b === true || (isQ(b) && b.n)); } return a; };
  const rel = () => { let a = add(); while (peek() && cmp[peek().v]) { const o = eat().v; a = cmp[o](toQ(a), toQ(add())); } return a; };
  const add = () => { let a = mul(); while (peek() && (peek().v === "+" || peek().v === "-")) { const o = eat().v; a = ops[o](toQ(a), toQ(mul())); } return a; };
  const mul = () => { let a = un(); while (peek() && "*/%".includes(peek().v) && peek().t === "op") { const o = eat().v; a = ops[o](toQ(a), toQ(un())); } return a; };
  const un = () => {
    const t = peek(); if (!t) throw new Error("식이 끝났어요: " + src);
    if (t.v === "-") { eat(); return ops["-"](Q(0), toQ(un())); }
    if (t.v === "!") { eat(); const v = un(); return !(v === true || (isQ(v) && v.n)); }
    if (t.v === "(") { eat(); const v = or(); eat(")"); return v; }
    if (t.t === "num") { eat(); return t.v.includes(".") ? Q(parseFloat(t.v)) : Q(parseInt(t.v, 10)); }
    if (t.t === "id") {
      eat();
      if (peek() && peek().v === "(") {
        const f = funcs[t.v]; if (!f) throw new Error("모르는 계산: " + t.v);
        eat("("); const args = []; if (peek() && peek().v !== ")") { args.push(toQ(or())); while (peek() && peek().v === ",") { eat(); args.push(toQ(or())); } }
        eat(")"); return f(...args);
      }
      if (!(t.v in vars)) throw new Error("모르는 글자: " + t.v);
      return vars[t.v];
    }
    throw new Error("식이 이상해요: " + src);
  };
  const v = or(); if (p !== tk.length) throw new Error("식이 이상해요: " + src);
  return v;
}

// ───────── 수를 교과서 표기로 ─────────
export function fmtQ(x, how = "auto") {
  x = toQ(x);
  const neg = x.n < 0 ? "-" : "", n = Math.abs(x.n), d = x.d;
  if (d === 1) return neg + n;
  if (how === "dec") { const v = Math.abs(qv(x)); return neg + String(Math.round(v * 1000) / 1000); }
  if (how === "int") return neg + Math.round(Math.abs(qv(x)));
  if ((how === "mixed" || how === "auto") && n > d) { const w = Math.floor(n / d), r = n % d; return `$${neg}${w}\\frac{${r}}{${d}}$`; }
  return `$${neg}\\frac{${n}}{${d}}$`;
}
// "{식}" 또는 "{식|mixed}" 자리를 채우기
// $…$ 수식 안에 있는 자리는 $ 없이, 밖에 있는 자리는 $…$ 로 감싸 넣기
//   \frac{1}{2}, \text{ km} 같은 LaTeX 의 {…} 는 건드리지 않음
function fill(text, vars) {
  const s = String(text || ""); let out = "", inMath = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "$" && s[i - 1] !== "\\") { inMath = !inMath; out += c; continue; }
    if (c === "{") {
      const m = /^\{([^{}]+)\}/.exec(s.slice(i));
      const before = s.slice(0, i);
      const latexArg = /(\\[A-Za-z]+\s*|[}^_])$/.test(before);
      if (m && !latexArg) {
        const [e, how] = m[1].split("|").map((x) => x.trim());
        let v = null;
        try { v = fmtQ(evalExpr(e, vars), how || "auto"); } catch (err) { if (!inMath) throw err; }
        if (v !== null) { out += inMath ? v.replace(/\$/g, "") : v; i += m[0].length - 1; continue; }
      }
    }
    out += c;
  }
  return out.replace(/\$\s*\$/g, "");
}
// 채운 글의 수식 표시($)가 짝이 맞는지
const dollarsOk = (t) => (String(t).replace(/\\\$/g, "").match(/\$/g) || []).length % 2 === 0 && !/\$\$/.test(t);
// 그림 설계도 안의 "{식}" → 숫자
function fillFig(v, vars) {
  if (typeof v === "string") {
    const m = /^\{([^{}|]+)\}$/.exec(v.trim()); if (m) return qv(toQ(evalExpr(m[1], vars)));
    return fill(v, vars).replace(/\$/g, "");
  }
  if (Array.isArray(v)) return v.map((x) => fillFig(x, vars));
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = fillFig(v[k], vars); return o; }
  return v;
}

// ───────── 틀로 문제 하나 만들기 ─────────
const rnd = (a, b, step = 1) => a + step * Math.floor(Math.random() * (Math.floor((b - a) / step) + 1));
function pickVars(tpl, fixed) {
  const vars = {};
  for (const [k, r] of Object.entries(tpl.vars || {})) {
    if (fixed && k in fixed) { vars[k] = Q(+fixed[k]); continue; }
    const [a, b, s] = Array.isArray(r) ? r.map(Number) : [Number(r), Number(r), 1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a > 100000) throw new Error("숫자 범위가 이상해요: " + k);
    vars[k] = Q(rnd(a, b, s > 0 ? s : 1));
  }
  for (const [k, e] of Object.entries(tpl.let || {})) vars[k] = toQ(evalExpr(e, vars));
  return vars;
}
const okAll = (tpl, vars) => (tpl.when || []).every((c) => { const v = evalExpr(c, vars); return v === true || (isQ(v) && v.n !== 0); });
export { dollarsOk };
export function fromTemplate(tpl, fixed = null, tries = 400) {
  for (let i = 0; i < tries; i++) {
    let vars;
    try { vars = pickVars(tpl, fixed); if (!okAll(tpl, vars)) { if (fixed) return null; continue; } }
    catch (e) { if (/0으로/.test(e.message) && !fixed) continue; throw e; }
    const ans = toQ(evalExpr(tpl.answer, vars));
    const out = {
      question: fill(tpl.question, vars),
      correctAnswer: fmtQ(ans, tpl.format || "auto"),
      explanation: fill(tpl.explanation, vars),
      figureSpec: tpl.figure ? fillFig(tpl.figure, vars) : null,
      value: qv(ans)
    };
    return out;
  }
  return null;
}
// 새 틀 검사: AI가 든 보기 숫자로 만든 답이 AI가 푼 답과 같은지, 여러 번 뽑아도 잘 되는지
export function checkTemplate(tpl, sameValue) {
  if (!tpl || typeof tpl !== "object" || !tpl.question || !tpl.answer || !tpl.vars) return "틀이 비었어요";
  if (JSON.stringify(tpl).length > 15000) return "틀이 너무 길어요";
  try {
    if (tpl.example) {
      const ex = fromTemplate(tpl, tpl.example, 1);
      if (!ex) return "보기 숫자가 조건에 맞지 않아요";
      if (sameValue && !sameValue(ex.correctAnswer)) return "보기 숫자로 계산한 답이 AI 답과 달라요";
    }
    const seen = new Set();
    for (let i = 0; i < 6; i++) {
      const p = fromTemplate(tpl); if (!p) return "조건에 맞는 숫자를 찾지 못했어요";
      if (/[{}]/.test(p.question.replace(/\\[A-Za-z]+\s*(\{[^{}]*\})+/g, ""))) return "문제 글에 채우지 못한 자리가 있어요";
      if (!dollarsOk(p.question) || !dollarsOk(p.explanation)) return "수식 표시($)가 짝이 맞지 않아요";
      seen.add(p.question);
    }
    if (seen.size < 2) return "숫자가 거의 바뀌지 않아요";
  } catch (e) { return "틀 계산 오류: " + e.message; }
  return "";
}

// ───────── 비슷한지 재기 (숫자·수식 빼고 글자 두 개씩 비교) ─────────
const strip = (s) => String(s || "").replace(/\\d?frac\{[^}]*\}\{[^}]*\}|\{[^}]*\}|\$|\\[a-z]+|\d+([./]\d+)?|[\s.,?!()]/g, "");
const grams = (s) => { const t = strip(s), g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
export function likeness(a, b) {
  const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
  let x = 0; A.forEach((g) => { if (B.has(g)) x++; });
  return x / (A.size + B.size - x);
}

// ───────── 학년·단원 이름표 ─────────
export function gradeKey(g) {
  const s = String(g || "");
  let m = /초\D*(\d)/.exec(s) || /^(\d)\s*학년/.exec(s); if (m) return "초" + m[1];
  m = /중\D*(\d)/.exec(s); if (m) return "중" + m[1];
  m = /고\D*(\d)/.exec(s); if (m) return "고" + m[1];
  return "";
}
export const bankKey = (subject, grade, unit) => [subject || "기타", gradeKey(grade), String(unit || "").replace(/[\s·.,]/g, "")].join("|");

// 초등 수학 단원 (교과서 단원 이름) — AI가 이 안에서 고르면 같은 유형이 한곳에 모여요
export const MATH_UNITS = {
  초1: ["9까지의 수", "여러 가지 모양", "덧셈과 뺄셈", "비교하기", "50까지의 수", "100까지의 수", "모양과 시각", "규칙 찾기"],
  초2: ["세 자리 수", "여러 가지 도형", "덧셈과 뺄셈", "길이 재기", "분류하기", "곱셈", "네 자리 수", "곱셈구구", "시각과 시간", "표와 그래프", "규칙 찾기"],
  초3: ["덧셈과 뺄셈", "평면도형", "나눗셈", "곱셈", "길이와 시간", "분수와 소수", "원", "분수", "들이와 무게", "자료의 정리"],
  초4: ["큰 수", "각도", "곱셈과 나눗셈", "평면도형의 이동", "막대그래프", "규칙 찾기", "분수의 덧셈과 뺄셈", "삼각형", "소수의 덧셈과 뺄셈", "사각형", "꺾은선그래프", "다각형"],
  초5: ["자연수의 혼합 계산", "약수와 배수", "규칙과 대응", "약분과 통분", "분수의 덧셈과 뺄셈", "다각형의 둘레와 넓이", "수의 범위와 어림하기", "분수의 곱셈", "합동과 대칭", "소수의 곱셈", "직육면체", "평균과 가능성"],
  초6: ["분수의 나눗셈", "각기둥과 각뿔", "소수의 나눗셈", "비와 비율", "여러 가지 그래프", "직육면체의 부피와 겉넓이", "공간과 입체", "비례식과 비례배분", "원의 넓이", "원기둥, 원뿔, 구"]
};
export function unitGuide(grade) {
  const k = gradeKey(grade);
  if (MATH_UNITS[k]) return `수학 문제의 unit 은 아래 ${k.replace("초", "초등 ")}학년 단원 이름 중 가장 가까운 것을 글자 그대로 쓴다: ${MATH_UNITS[k].join(", ")}`;
  if (!k) return `수학 문제의 unit 은 초등 교과서 단원 이름으로 쓴다(예: 분수의 덧셈과 뺄셈, 각도, 큰 수, 약분과 통분).`;
  return `unit 은 교과서 단원 이름으로 짧게 쓴다.`;
}

// 틀 쓰는 법 (AI에게 줄 설명)
export const TEMPLATE_GUIDE = `"문제 틀"(template) 쓰는 법 — 숫자만 바꿔 같은 유형 문제를 끝없이 만들 수 있게 하는 설계도
- 숫자를 바꿀 수 있는 계산·문장제(주로 수학)일 때만 쓴다. 보기 고르기·낱말·개념 문제는 template 을 null 로 둔다.
- vars: 바꿀 숫자와 범위. {"a":[2,9],"d":[3,9]} 처럼 [가장 작은 수, 가장 큰 수] (정수만). 간격이 필요하면 [10,90,10].
- let: 다른 수로 계산해 두는 값(선택). {"s":"a+b"}
- when: 꼭 지켜야 할 조건 식 목록. 예: ["b<a", "a<d", "gcd(a,d)==1"]. 답이 깔끔하게(학년에 맞게) 나오도록 조건을 충분히 건다.
- question / explanation: 글 속 숫자 자리에 {식} 을 쓴다. {식} 을 $ 로 감싸지 않는다(앱이 알아서 수식으로 보여 준다). 단위는 그냥 글자로 쓴다(예: "{a/d} km", \\text 쓰지 않기). 분수는 {a/d}, 대분수로 보이려면 {a/d|mixed}, 가분수 그대로는 {a/d|frac}.
  자연수는 {a}, 계산 결과는 {a*b} 처럼. explanation 도 같은 방법으로 단계별 풀이를 쓴다.
- answer: 정답 계산식(예: "(a-b)/d+c"). format: "mixed"(대분수) | "frac"(분수) | "auto"(자연수면 자연수, 아니면 대분수).
- 식에 쓸 수 있는 것: + - * / % ( ), < <= > >= == != && ||, gcd lcm min max floor ceil abs round mod isint num den
- figure: 그림이 있으면 그림 설계도를 쓰되, 바뀌는 숫자는 "{식}" 글자로 쓴다(예: "value":"{a/d}").
- example: 첫 번째 문제(problems[0])에 실제로 쓴 숫자. {"a":13,"b":3,"d":5}. 이 숫자로 계산한 답이 problems[0] 의 correctAnswer 와 같아야 한다.
- 사람 이름은 실제 이름 대신 흔한 이름(예: 민지, 서준)이나 "친구"로 쓴다.`;
