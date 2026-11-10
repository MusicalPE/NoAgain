// 미리보기(?demo)용 가짜 파이어스토어 — 메모리 속 표에 담고, 새로고침하면 처음으로
import { seedDocs } from "./seed.js";

const D = new Map();                       // "notebooks/abc" → 데이터
for (const [p, v] of Object.entries(seedDocs())) D.set(p, structuredClone(v));
const later = (v) => new Promise((r) => setTimeout(() => r(v), 60));
const nid = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const join = (parts) => parts.map(String).join("/");

export function getFirestore() { return { demo: true }; }
export function collection(base, ...segs) {
  const path = base && base.path ? join([base.path, ...segs]) : join(segs);
  return { type: "collection", path };
}
export function doc(base, ...segs) {
  let path;
  if (base && base.type === "collection") path = join([base.path, segs.length ? segs[0] : nid(), ...segs.slice(1)]);
  else if (base && base.path) path = join([base.path, ...segs]);
  else path = join(segs);
  const id = path.split("/").pop();
  return { type: "doc", path, id };
}
export function query(col, ...cons) { return { type: "query", path: col.path, cons }; }
export const where = (f, op, v) => ({ k: "where", f, op, v });
export const orderBy = (f, dir = "asc") => ({ k: "order", f, dir });
export const limit = (n) => ({ k: "limit", n });
export const arrayUnion = (...v) => ({ __op: "union", v });
export const arrayRemove = (...v) => ({ __op: "remove", v });
export const deleteField = () => ({ __op: "delete" });
export const serverTimestamp = () => Date.now();

function snapDoc(path) {
  const has = D.has(path), data = has ? structuredClone(D.get(path)) : undefined;
  return { id: path.split("/").pop(), ref: { type: "doc", path, id: path.split("/").pop() }, exists: () => has, data: () => data };
}
function listCol(path) {
  const pre = path + "/", out = [];
  for (const k of D.keys()) if (k.startsWith(pre) && !k.slice(pre.length).includes("/")) out.push(k);
  return out;
}
const getF = (o, f) => f.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function runQuery(q) {
  let docs = listCol(q.path).map(snapDoc);
  for (const c of q.cons || []) {
    if (c.k === "where") docs = docs.filter((d) => {
      const v = getF(d.data(), c.f);
      return c.op === "array-contains" ? Array.isArray(v) && v.includes(c.v) : c.op === "==" ? v === c.v : c.op === "in" ? c.v.includes(v) : true;
    });
    if (c.k === "order") docs.sort((a, b) => { const x = getF(a.data(), c.f), y = getF(b.data(), c.f); return (x > y ? 1 : x < y ? -1 : 0) * (c.dir === "desc" ? -1 : 1); });
    if (c.k === "limit") docs = docs.slice(0, c.n);
  }
  return { docs, empty: !docs.length, size: docs.length, forEach: (f) => docs.forEach(f) };
}
function apply(path, data, merge) {
  const cur = merge ? structuredClone(D.get(path) || {}) : {};
  for (const [k, v] of Object.entries(data)) {
    const keys = k.split("."), last = keys.pop();
    let o = cur; for (const x of keys) { if (typeof o[x] !== "object" || o[x] === null) o[x] = {}; o = o[x]; }
    if (v && v.__op === "union") o[last] = [...new Set([...(o[last] || []), ...v.v])];
    else if (v && v.__op === "remove") o[last] = (o[last] || []).filter((x) => !v.v.includes(x));
    else if (v && v.__op === "delete") delete o[last];
    else o[last] = structuredClone(v);
  }
  D.set(path, cur);
}
export async function getDoc(ref) { return later(snapDoc(ref.path)); }
export async function getDocs(q) { return later(runQuery(q.type === "query" ? q : { path: q.path, cons: [] })); }
export async function setDoc(ref, data, opt) { apply(ref.path, data, !!(opt && opt.merge)); return later(); }
export async function addDoc(col, data) { const ref = doc(col); apply(ref.path, data, false); return later(ref); }
export async function updateDoc(ref, data) {
  if (!D.has(ref.path)) { const e = new Error("없는 문서예요"); e.code = "not-found"; throw e; }
  apply(ref.path, data, true); return later();
}
export async function deleteDoc(ref) { D.delete(ref.path); return later(); }
export function writeBatch() {
  const ops = [];
  return {
    set(ref, data, opt) { ops.push(() => apply(ref.path, data, !!(opt && opt.merge))); return this; },
    update(ref, data) { ops.push(() => apply(ref.path, data, true)); return this; },
    delete(ref) { ops.push(() => D.delete(ref.path)); return this; },
    async commit() { ops.forEach((f) => f()); return later(); }
  };
}
