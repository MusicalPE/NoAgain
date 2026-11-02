// 그림 설계도(JSON)를 받아 정확한 그림(SVG)으로 그려 주는 도구
// AI는 설계도만 만들고, 눈금·각도·칸 나누기는 여기서 계산해서 그린다.
//
// 지원하는 그림
//  numberline     수직선      {type, from, to, parts, arrows:[칸번호], labels:{칸번호:"글자"}}
//  fractionbar    띠 분수 모형 {type, bars:[{parts, shaded, label}]}
//  fractioncircle 원 분수 모형 {type, circles:[{parts, shaded}]}
//  clock          시계        {type, hour, minute}
//  polygon        도형        {type, points:[[x,y]...], sides:["5cm", ...], labels:[{x,y,text}], angles:[{at,text}]}
//  grid           모눈 위 도형 {type, cols, rows, shapes:[[[x,y]...]]}
//  table          표          {type, rows:[["", ...], ...]}

const INK = "#222", SHADE = "#f2a7b5", FONT = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;

// 글자 안에 "2 3/7" 처럼 대분수·분수가 있으면 위아래로 쌓아 쓰기
function label(x, y, text, size = 16, anchor = "middle") {
  const t = String(text ?? "").replace(/\$|\\frac\{(\d+)\}\{(\d+)\}/g, (m, a, b) => (a ? `${a}/${b}` : ""));
  const m = t.match(/^\s*(\d+)?\s*(\d+)\/(\d+)\s*$/);
  if (!m) return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${INK}">${e(t)}</text>`;
  const [, whole, n, d] = m, fs = size * 0.78, w = Math.max(n.length, d.length) * fs * 0.6 + 4;
  const wx = whole ? whole.length * size * 0.6 : 0;
  let cx = anchor === "middle" ? x - (wx + w) / 2 : anchor === "end" ? x - (wx + w) : x;
  let out = whole ? `<text x="${cx}" y="${y}" font-size="${size}" fill="${INK}">${e(whole)}</text>` : "";
  cx += wx + w / 2;
  out += `<text x="${cx}" y="${y - fs * 0.55}" font-size="${fs}" text-anchor="middle" fill="${INK}">${e(n)}</text>`;
  out += `<line x1="${cx - w / 2}" y1="${y - fs * 0.35}" x2="${cx + w / 2}" y2="${y - fs * 0.35}" stroke="${INK}" stroke-width="1.2"/>`;
  out += `<text x="${cx}" y="${y + fs * 0.6}" font-size="${fs}" text-anchor="middle" fill="${INK}">${e(d)}</text>`;
  return out;
}

function numberline(f) {
  const parts = clamp(Math.round(num(f.parts, 10)), 1, 40), W = 420, H = 120, x0 = 30, x1 = W - 30, y = 50;
  const X = (i) => x0 + ((x1 - x0) * i) / parts;
  let b = `<line x1="${x0 - 14}" y1="${y}" x2="${x1 + 14}" y2="${y}" stroke="${INK}" stroke-width="2"/>`;
  for (let i = 0; i <= parts; i++) {
    const big = i === 0 || i === parts || (f.major && i % f.major === 0);
    b += `<line x1="${X(i)}" y1="${y - (big ? 10 : 7)}" x2="${X(i)}" y2="${y + (big ? 10 : 7)}" stroke="${INK}" stroke-width="${big ? 2 : 1.5}"/>`;
  }
  const labels = { ...(f.labels || {}) };
  if (f.from != null && labels[0] == null) labels[0] = f.from;
  if (f.to != null && labels[parts] == null) labels[parts] = f.to;
  for (const [k, v] of Object.entries(labels)) { const i = clamp(Math.round(num(k)), 0, parts); b += label(X(i), y + 36, v, 17); }
  for (const a of [].concat(f.arrows ?? f.arrow ?? [])) {
    const i = clamp(num(a), 0, parts), x = X(i);
    b += `<line x1="${x}" y1="${y - 38}" x2="${x}" y2="${y - 14}" stroke="${INK}" stroke-width="2"/><path d="M${x - 6} ${y - 22} L${x} ${y - 12} L${x + 6} ${y - 22}" fill="none" stroke="${INK}" stroke-width="2"/>`;
  }
  for (const p of [].concat(f.points || [])) {
    const i = clamp(num(p.at), 0, parts);
    b += `<circle cx="${X(i)}" cy="${y}" r="5" fill="${INK}"/>${p.text ? label(X(i), y - 18, p.text, 15) : ""}`;
  }
  return svg(W, H, b);
}

function fractionbar(f) {
  const bars = (f.bars || [f]).slice(0, 6), W = 420, bh = 34, gap = 18, lx = bars.some((x) => x.label) ? 70 : 10;
  const H = bars.length * (bh + gap) + gap;
  let b = "";
  bars.forEach((bar, k) => {
    const parts = clamp(Math.round(num(bar.parts, 4)), 1, 30), shaded = clamp(Math.round(num(bar.shaded)), 0, parts);
    const y = gap + k * (bh + gap), w = (W - lx - 10) / parts;
    if (bar.label) b += label(lx - 10, y + bh / 2 + 6, bar.label, 16, "end");
    for (let i = 0; i < parts; i++)
      b += `<rect x="${lx + i * w}" y="${y}" width="${w}" height="${bh}" fill="${i < shaded ? SHADE : "#fff"}" stroke="${INK}" stroke-width="1.5"/>`;
  });
  return svg(W, H, b);
}

function fractioncircle(f) {
  const cs = (f.circles || [f]).slice(0, 4), r = 60, W = cs.length * (2 * r + 30) + 10, H = 2 * r + 30;
  let b = "";
  cs.forEach((c, k) => {
    const parts = clamp(Math.round(num(c.parts, 4)), 1, 24), shaded = clamp(Math.round(num(c.shaded)), 0, parts);
    const cx = 20 + r + k * (2 * r + 30), cy = r + 15;
    for (let i = 0; i < parts; i++) {
      const a1 = -Math.PI / 2 + (2 * Math.PI * i) / parts, a2 = -Math.PI / 2 + (2 * Math.PI * (i + 1)) / parts;
      const p = parts === 1 ? `M${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`
        : `M${cx} ${cy} L${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} A${r} ${r} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}Z`;
      b += `<path d="${p}" fill="${i < shaded ? SHADE : "#fff"}" stroke="${INK}" stroke-width="1.5"/>`;
    }
  });
  return svg(W, H, b);
}

function clock(f) {
  const r = 80, c = 95, W = 190, h = num(f.hour) % 12, m = clamp(num(f.minute), 0, 59);
  let b = `<circle cx="${c}" cy="${c}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI, big = i % 5 === 0, r1 = big ? r - 10 : r - 5;
    b += `<line x1="${c + r1 * Math.sin(a)}" y1="${c - r1 * Math.cos(a)}" x2="${c + r * Math.sin(a)}" y2="${c - r * Math.cos(a)}" stroke="${INK}" stroke-width="${big ? 2 : 1}"/>`;
    if (big) { const n = i / 5 || 12; b += `<text x="${c + (r - 24) * Math.sin(a)}" y="${c - (r - 24) * Math.cos(a) + 6}" font-size="16" text-anchor="middle" fill="${INK}">${n}</text>`; }
  }
  const ha = ((h + m / 60) / 12) * 2 * Math.PI, ma = (m / 60) * 2 * Math.PI;
  b += `<line x1="${c}" y1="${c}" x2="${c + 42 * Math.sin(ha)}" y2="${c - 42 * Math.cos(ha)}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  b += `<line x1="${c}" y1="${c}" x2="${c + 64 * Math.sin(ma)}" y2="${c - 64 * Math.cos(ma)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  b += `<circle cx="${c}" cy="${c}" r="5" fill="${INK}"/>`;
  return svg(W, W, b);
}

// 점 좌표(아무 크기)를 그림 칸에 맞게 늘이고 줄이기
function fit(points, W, H, pad) {
  const xs = points.map((p) => num(p[0])), ys = points.map((p) => num(p[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  return (p) => [ox + (num(p[0]) - minX) * s, oy + (num(p[1]) - minY) * s];
}

function polygon(f) {
  const pts = (f.points || []).filter((p) => Array.isArray(p) && p.length === 2).slice(0, 12);
  if (pts.length < 2) return "";
  const W = 360, H = 240, map = fit([...pts, ...(f.labels || []).map((l) => [l.x, l.y])], W, H, 40);
  const P = pts.map(map), cx = P.reduce((a, p) => a + p[0], 0) / P.length, cy = P.reduce((a, p) => a + p[1], 0) / P.length;
  let b = `<polygon points="${P.map((p) => p.join(",")).join(" ")}" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`;
  (f.sides || []).forEach((t, i) => {
    if (!t) return;
    const a = P[i], c = P[(i + 1) % P.length], mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
    const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1;
    b += label(mx + (dx / d) * 18, my + (dy / d) * 18 + 6, t, 16);
  });
  (f.vertices || []).forEach((t, i) => {
    if (!t || !P[i]) return;
    const dx = P[i][0] - cx, dy = P[i][1] - cy, d = Math.hypot(dx, dy) || 1;
    b += label(P[i][0] + (dx / d) * 16, P[i][1] + (dy / d) * 16 + 6, t, 16);
  });
  (f.angles || []).forEach((a) => {
    const i = Math.round(num(a.at)); if (!P[i]) return;
    const dx = cx - P[i][0], dy = cy - P[i][1], d = Math.hypot(dx, dy) || 1;
    b += label(P[i][0] + (dx / d) * 30, P[i][1] + (dy / d) * 30 + 5, a.text, 14);
  });
  (f.labels || []).forEach((l) => { const p = map([l.x, l.y]); b += label(p[0], p[1], l.text, 16); });
  return svg(W, H, b);
}

function grid(f) {
  const cols = clamp(Math.round(num(f.cols, 10)), 1, 30), rows = clamp(Math.round(num(f.rows, 8)), 1, 30);
  const s = Math.min(360 / cols, 260 / rows), W = cols * s + 20, H = rows * s + 20;
  let b = "";
  for (let i = 0; i <= cols; i++) b += `<line x1="${10 + i * s}" y1="10" x2="${10 + i * s}" y2="${10 + rows * s}" stroke="#bbb"/>`;
  for (let j = 0; j <= rows; j++) b += `<line x1="10" y1="${10 + j * s}" x2="${10 + cols * s}" y2="${10 + j * s}" stroke="#bbb"/>`;
  for (const sh of (f.shapes || []).slice(0, 6)) {
    const pts = (sh || []).filter((p) => Array.isArray(p) && p.length === 2);
    if (pts.length > 1) b += `<polygon points="${pts.map((p) => `${10 + num(p[0]) * s},${10 + num(p[1]) * s}`).join(" ")}" fill="rgba(242,167,181,.35)" stroke="${INK}" stroke-width="2.5"/>`;
  }
  return svg(W, H, b);
}

function table(f) {
  const rows = (f.rows || []).slice(0, 10).map((r) => (r || []).slice(0, 8));
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((r) => r.length)), cw = Math.min(90, 400 / cols), rh = 38, W = cols * cw + 4, H = rows.length * rh + 4;
  let b = "";
  rows.forEach((r, j) => {
    for (let i = 0; i < cols; i++) {
      b += `<rect x="${2 + i * cw}" y="${2 + j * rh}" width="${cw}" height="${rh}" fill="${j === 0 ? "#f3f1ea" : "#fff"}" stroke="${INK}"/>`;
      b += label(2 + i * cw + cw / 2, 2 + j * rh + rh / 2 + 6, r[i] ?? "", 15);
    }
  });
  return svg(W, H, b);
}

const DRAW = { numberline, fractionbar, fractioncircle, clock, polygon, grid, table };

// 설계도 → 그림 주소(data:image/svg+xml...). 그릴 수 없으면 빈 글자
export function drawFigure(spec) {
  try {
    if (!spec || typeof spec !== "object" || !DRAW[spec.type]) return "";
    const s = DRAW[spec.type](spec);
    return s ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s) : "";
  } catch (_) { return ""; }
}
export const FIGURE_TYPES = Object.keys(DRAW);
