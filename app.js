// 주또싫 (오답노트) — 음악적체육인
import { FIREBASE_CONFIG, RECAPTCHA_SITE_KEY, AI_MODELS, AI_MODELS_FAST, SUBJECTS, SIMILAR_COUNT, APP_NAME, APP_SUBTITLE, SUBJECT_COLORS } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken as getAppCheckToken } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc, query, orderBy, where, arrayUnion, arrayRemove, writeBatch }
  from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { drawFigure } from "./figure.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-ai.js";

// ───────── 작은 도구 ─────────
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rich = (s) => esc(s).replace(/\n/g, "<br>");
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
function typeset(el) {
  if (!el || !window.renderMathInElement) return;
  window.renderMathInElement(el, {
    delimiters: [
      { left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }
    ], throwOnError: false
  });
}
function toast(msg, ms = 2200) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms); }
function busy(on, msg = "잠시만요") { $("#busyMsg").textContent = msg; $("#busy").classList.toggle("hidden", !on); }
function openModal(html) { $("#modalBox").innerHTML = html; $("#modal").classList.remove("hidden"); typeset($("#modalBox")); }
function closeModal() { $("#modal").classList.add("hidden"); $("#modalBox").innerHTML = ""; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()}`; };

// 앱 이름 표시
const NAME = APP_NAME || "오답노트", SUB = APP_SUBTITLE || "";
document.title = NAME;
["#brandName", "#loginTitle"].forEach((s) => ($(s).textContent = NAME));
["#brandSub", "#loginSub"].forEach((s) => ($(s).textContent = SUB));

// 답 비교용 정리: 띄어쓰기·마침표·수식 기호를 빼고, ①을 1로
export function normAnswer(s) {
  return String(s ?? "")
    .replace(/[①-⑩]/g, (c) => String(CIRCLED.indexOf(c) + 1))
    .replace(/\$|\\,|\\ |\{|\}/g, "")
    .replace(/\\(d?frac)(\d)(\d)/g, "$2/$3")
    .replace(/\s+/g, "").replace(/[.。]+$/, "").replace(/번$/, "")
    .toLowerCase();
}

// ───────── 상태 ─────────
const state = { user: null, nb: null, notebooks: [], notes: [], view: "list", photo: null, recog: [], retry: null };
const grade = () => (state.nb && state.nb.grade) || "";
const subjColor = (s) => (SUBJECT_COLORS && SUBJECT_COLORS[s]) || "#9aa3ad";
let listSubject = "all";

// ───────── 파이어베이스 ─────────
if (!FIREBASE_CONFIG.apiKey) {
  $("#view-setup").classList.remove("hidden");
  throw new Error("config.js 가 비어 있습니다");
}
const app = initializeApp(FIREBASE_CONFIG);
if (["localhost", "127.0.0.1"].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
let appCheck = null;
if (RECAPTCHA_SITE_KEY) {
  appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const auth = getAuth(app);
const db = getFirestore(app);
const ai = getAI(app, { backend: new GoogleAIBackend() });
const notesCol = () => collection(db, "notebooks", state.nb.id, "notes");

// ───────── AI 부르기 ─────────
// AI가 수식의 \ 를 하나만 써서 JSON이 깨지거나(\d, \c …), 다른 글자로 바뀌는(\frac → 줄바꿈 기호) 것 바로잡기
function fixTeX(v) {
  if (typeof v === "string") return v.replace(/\f/g, "\\f").replace(/\x08/g, "\\b").replace(/\t/g, "\\t").replace(/\r/g, "\\r");
  if (Array.isArray(v)) return v.map(fixTeX);
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = fixTeX(v[k]); return o; }
  return v;
}
function parseJSON(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const tries = [t];
  const a = t.search(/[{[]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const x of [...tries]) tries.push(x.replace(/\\(?!["\\/bfnrtu])/g, "\\\\"));
  for (const x of tries) { try { return fixTeX(JSON.parse(x)); } catch (_) {} }
  throw new Error("AI 답을 읽지 못했어요: " + t.slice(0, 60));
}
// 오류 구분: "generateContent" 안의 "rate" 같은 글자에 걸리지 않게 낱말 단위로 찾기
const QUOTA_RE = /quota|\b429\b|exhausted|rate.?limit|too many requests/i;
const BUSY_RE = /high demand|overloaded|unavailable|try again later|\b50[03]\b|\b504\b|deadline/i;
const NO_MODEL_RE = /not found|\b404\b|not supported|unsupported|is not available|invalid model/i;
// 최근 오류 기억해 두기 (설정 > AI 연결 점검에서 보임)
function logErr(where, e) {
  try {
    const list = JSON.parse(localStorage.getItem("odapErrors") || "[]");
    list.unshift({ t: Date.now(), where, msg: String(e?.message || e).slice(0, 300) });
    localStorage.setItem("odapErrors", JSON.stringify(list.slice(0, 5)));
  } catch (_) {}
}

// 시간 제한을 걸어 기다리기
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(new Error("timeout: " + label)), ms); })])
    .finally(() => clearTimeout(timer));
}
// 생각을 짧게 하도록 (모델이 이 설정을 모르면 빼고 다시)
const THINK = { thinkingConfig: { thinkingBudget: 0 } };
const THINK_RE = /thinking|budget|invalid.?argument|\b400\b/i;
const noThink = new Set();
async function callModel(name, parts, temperature, json = true, ms = 60000) {
  const base = { temperature, ...(json ? { responseMimeType: "application/json" } : {}) };
  const run = (cfg) => withTimeout(getGenerativeModel(ai, { model: name, generationConfig: cfg }).generateContent(parts), ms, `${name} 응답이 ${ms / 1000}초 넘게 없었어요`);
  if (!noThink.has(name)) {
    try { return await run({ ...base, ...THINK }); }
    catch (e) { if (!THINK_RE.test(String(e?.message || e))) throw e; noThink.add(name); }
  }
  return run(base);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 붐비거나 안 된 모델은 10분 동안 뒤로 미루기 (헛걸음 줄이기)
const RESTING = "odapResting";
const restMap = () => { try { return JSON.parse(localStorage.getItem(RESTING) || "{}"); } catch (_) { return {}; } };
function restModel(name) { try { const m = restMap(); m[name] = Date.now() + 10 * 60 * 1000; localStorage.setItem(RESTING, JSON.stringify(m)); } catch (_) {} }
function orderModels(list) {
  const m = restMap(), now = Date.now();
  return [...list.filter((n) => !(m[n] > now)), ...list.filter((n) => m[n] > now)];
}
async function askAI(parts, temperature = 0.2, onStep, list = AI_MODELS) {
  let lastErr;
  const models = orderModels(list);
  for (let i = 0; i < models.length; i++) {
    const name = models[i];
    try {
      if (onStep) onStep(name, i);
      const t = Date.now();
      const res = await callModel(name, parts, temperature, true, 45000);
      state.lastAI = { model: name, sec: Math.round((Date.now() - t) / 1000) };
      return parseJSON(res.response.text());
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      // 붐비거나, 모델이 없거나, 무료 사용량이 찼거나, 너무 오래 걸리면 바로 다음 모델로
      if (BUSY_RE.test(msg) || NO_MODEL_RE.test(msg) || QUOTA_RE.test(msg) || /^timeout/i.test(msg)) { restModel(name); continue; }
      throw e;
    }
  }
  throw lastErr;
}
function aiErrorText(e) {
  const m = String(e?.message || e);
  const raw = " (" + m.replace(/^\[[^\]]*\]\s*/, "").replace(/Error fetching from \S+\s*/i, "").replace(/^[:\s]+/, "").slice(0, 110) + ")";
  if (/^timeout/i.test(m)) return "AI가 답을 주지 않아 멈췄어요. [설정] > [AI 연결 점검]을 눌러 어디서 멈추는지 확인해 주세요";
  if (/app.?check|attestation|recaptcha/i.test(m)) return "App Check 설정을 확인해 주세요" + raw;
  if (BUSY_RE.test(m)) return "AI 서버가 지금 붐벼서 모든 모델이 답하지 못했어요. 몇 분 뒤 다시 해 보세요";
  if (QUOTA_RE.test(m)) return "AI 사용량이 잠깐 넘쳤어요. 1~2분 뒤 다시 해 보세요" + raw;
  if (/api.*not.*enabled|\b403\b|permission/i.test(m)) return "AI Logic 이 켜져 있는지 확인해 주세요" + raw;
  return "AI가 답하지 못했어요" + raw;
}

// ───────── 사진 처리 ─────────
function loadImage(file) {
  return new Promise((ok, no) => { const img = new Image(); img.onload = () => ok(img); img.onerror = no; img.src = URL.createObjectURL(file); });
}
function imageToCanvas(img, maxSide) {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// 사진을 시계 방향으로 deg(90/180/270)만큼 돌리기
function rotateCanvas(src, deg) {
  deg = ((deg % 360) + 360) % 360; if (!deg) return src;
  const c = document.createElement("canvas");
  const side = deg === 180;
  c.width = side ? src.width : src.height; c.height = side ? src.height : src.width;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
// 돌리기 전 사진 기준 네모 [ymin,xmin,ymax,xmax] 를 돌린 뒤 기준으로 바꾸기
function rotateBox(box, deg) {
  if (!Array.isArray(box) || box.length !== 4) return box;
  const [y1, x1, y2, x2] = box.map(Number);
  deg = ((deg % 360) + 360) % 360;
  if (deg === 90) return [x1, 1000 - y2, x2, 1000 - y1];
  if (deg === 180) return [1000 - y2, 1000 - x2, 1000 - y1, 1000 - x1];
  if (deg === 270) return [1000 - x2, y1, 1000 - x1, y2];
  return box;
}
function showPhoto() { $("#photoImg").src = state.photo.canvas.toDataURL("image/jpeg", 0.85); }

// box: [ymin, xmin, ymax, xmax] 0~1000
function cropToDataURL(srcCanvas, box, maxSide = 900) {
  if (!box || box.length !== 4) return "";
  let [y1, x1, y2, x2] = box.map(Number);
  if ([y1, x1, y2, x2].some((v) => isNaN(v))) return "";
  const pad = 12;
  y1 = Math.max(0, y1 - pad); x1 = Math.max(0, x1 - pad); y2 = Math.min(1000, y2 + pad); x2 = Math.min(1000, x2 + pad);
  const W = srcCanvas.width, H = srcCanvas.height;
  const sx = (x1 / 1000) * W, sy = (y1 / 1000) * H, sw = ((x2 - x1) / 1000) * W, sh = ((y2 - y1) / 1000) * H;
  if (sw < 10 || sh < 10) return "";
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * s); c.height = Math.round(sh * s);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  let q = 0.8, url = c.toDataURL("image/jpeg", q);
  while (url.length > 300000 && q > 0.3) { q -= 0.15; url = c.toDataURL("image/jpeg", q); }
  return url;
}

// ───────── 로그인 ─────────
$("#btnLogin").onclick = async () => {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (/popup-blocked|operation-not-supported/.test(e.code || "")) await signInWithRedirect(auth, provider);
    else if (!/popup-closed|cancelled-popup/.test(e.code || "")) toast("로그인하지 못했어요: " + (e.code || e.message));
  }
};
onAuthStateChanged(auth, async (user) => {
  state.user = user;
  $("#view-login").classList.toggle("hidden", !!user);
  $("#tabs").classList.toggle("hidden", !user);
  $("#userBox").classList.toggle("hidden", !user);
  if (!user) { document.querySelectorAll(".view").forEach((v) => v.id !== "view-login" && v.classList.add("hidden")); return; }
  $("#userName").textContent = user.displayName || user.email;
  busy(true, "노트를 여는 중");
  try { await setupNotebook(); }
  catch (e) { busy(false); toast("노트를 열지 못했어요: " + (e.code || e.message), 4000); return; }
  busy(false);
  await loadNotes();
  show("list");
  resumeJobs();
});

// ───────── 같이 쓰는 노트 ─────────
// notebooks/{id} : { name, owner, members:[uid], names:{uid:이름}, grade, inviteCode, inviteExpires }
// notebooks/{id}/notes/{noteId} : 문제
const invite = (() => { const q = new URLSearchParams(location.search); return q.get("nb") && q.get("code") ? { nb: q.get("nb"), code: q.get("code") } : null; })();
if (invite) $("#loginInvite").classList.remove("hidden");
const myName = () => state.user.displayName || (state.user.email || "").split("@")[0];
const nbRef = (id) => doc(db, "notebooks", id);

async function listNotebooks() {
  const snap = await getDocs(query(collection(db, "notebooks"), where("members", "array-contains", state.user.uid)));
  state.notebooks = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
async function useNotebook(id) {
  state.nb = state.notebooks.find((n) => n.id === id) || state.notebooks[0];
  try { await setDoc(doc(db, "users", state.user.uid), { currentNb: state.nb.id }, { merge: true }); } catch (_) {}
}
async function createNotebook(name, gradeText = "") {
  const uid = state.user.uid;
  const ref = await addDoc(collection(db, "notebooks"), {
    name, owner: uid, members: [uid], names: { [uid]: myName() }, grade: gradeText, inviteCode: "", inviteExpires: 0, createdAt: Date.now()
  });
  return ref.id;
}
async function setupNotebook() {
  const uid = state.user.uid;
  let joined = "";
  if (invite) {
    try {
      await updateDoc(nbRef(invite.nb), { members: arrayUnion(uid), lastJoinCode: invite.code, ["names." + uid]: myName() });
      joined = invite.nb;
    } catch (_) { setTimeout(() => toast("초대가 끝났거나 잘못된 QR이에요. 초대한 사람에게 새 QR을 받아 주세요", 5000), 300); }
    history.replaceState(null, "", location.pathname);
  }
  await listNotebooks();
  let user = {};
  try { const u = await getDoc(doc(db, "users", uid)); if (u.exists()) user = u.data(); } catch (_) {}
  if (!state.notebooks.length) {
    const id = await createNotebook(`${NAME} 노트`, user.grade || "");
    await migrateOldNotes(id);
    await listNotebooks();
  }
  await useNotebook(joined || (state.notebooks.some((n) => n.id === user.currentNb) ? user.currentNb : state.notebooks[0].id));
  if (joined) setTimeout(() => toast(`"${state.nb.name}"에 함께하게 됐어요`, 3500), 300);
}
// 예전(혼자 쓰던) 저장 위치에 있던 문제를 새 노트로 옮기기
async function migrateOldNotes(nbId) {
  try {
    const old = await getDocs(collection(db, "users", state.user.uid, "notes"));
    if (old.empty) return;
    const idMap = {}; old.docs.forEach((d) => (idMap[d.id] = d.id));
    let batch = writeBatch(db), n = 0;
    for (const d of old.docs) {
      batch.set(doc(db, "notebooks", nbId, "notes", d.id), { ...d.data(), addedBy: state.user.uid, addedByName: myName() });
      if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    await batch.commit();
  } catch (_) {}
}

// ───────── 데이터 ─────────
async function loadNotes() {
  busy(true, "오답을 불러오는 중");
  try {
    const snap = await getDocs(query(notesCol(), orderBy("createdAt", "desc")));
    state.notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { toast("불러오지 못했어요: " + (e.code || e.message)); }
  busy(false);
}
async function addNote(data) {
  const now = Date.now();
  const note = {
    subject: "기타", unit: "", type: "", question: "", choices: [], myAnswer: "", correctAnswer: "",
    answerFromAI: false, wrongReason: "", explanation: "", figure: "", source: "photo", parentId: "",
    status: "wrong", wrongCount: 1, correctStreak: 0, tryCount: 0, lastTriedAt: 0, createdAt: now, updatedAt: now,
    addedBy: state.user.uid, addedByName: myName(), ...data
  };
  const ref = await addDoc(notesCol(), note);
  const saved = { id: ref.id, ...note };
  state.notes.unshift(saved);
  return saved;
}
async function patchNote(id, data) {
  data.updatedAt = Date.now();
  await updateDoc(doc(notesCol(), id), data);
  const n = state.notes.find((x) => x.id === id); if (n) Object.assign(n, data);
}
async function removeNote(id) {
  await deleteDoc(doc(notesCol(), id));
  state.notes = state.notes.filter((x) => x.id !== id);
}

// ───────── 화면 전환 ─────────
function show(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-" + view).classList.remove("hidden");
  document.body.classList.toggle("list-mode", view === "list");
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  if (view === "list") renderList();
  if (view === "retry") { if (!state.retry) { $("#retrySetup").classList.remove("hidden"); $("#retryPlay").classList.add("hidden"); } updateRetryAvail(); }
  if (view === "print") updatePrintAvail();
  window.scrollTo(0, 0);
}
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => show(b.dataset.view)));

function fillSubjectSelect(sel, withAll = true) {
  const used = new Set(state.notes.map((n) => n.subject));
  const list = SUBJECTS.filter((s) => used.has(s) || !withAll);
  sel.innerHTML = (withAll ? `<option value="all">모든 과목</option>` : "") + list.map((s) => `<option>${esc(s)}</option>`).join("");
}

// ───────── 답 쓰는 칸 (객관식·분수·글) ─────────
// 분수는 [자연수] [분자/분모] 칸에 숫자만 넣으면 된다
const isFracAns = (a) => /\\d?frac|\d\s*\/\s*\d/.test(String(a || ""));
function answerBoxHTML(n) {
  if (n.choices && n.choices.length)
    return `<div class="ans-box" data-mode="choice"><div class="choice-btns">${n.choices.map((c, i) => `<button type="button" data-ch="${i}">${CIRCLED[i]} ${rich(c)}</button>`).join("")}</div></div>`;
  const frac = isFracAns(n.correctAnswer);
  return `<div class="ans-box" data-mode="${frac ? "frac" : "text"}">
    <div class="frac-in"${frac ? "" : " hidden"}>
      <input class="fw" inputmode="numeric" autocomplete="off" aria-label="자연수 (없으면 비워 두기)" placeholder=" ">
      <span class="fstack"><input class="fn" inputmode="numeric" autocomplete="off" aria-label="분자"><i></i><input class="fd" inputmode="numeric" autocomplete="off" aria-label="분모"></span>
      <span class="muted frac-help">큰 칸은 자연수<br>없으면 비워요</span>
    </div>
    <input class="answer-in txt"${frac ? " hidden" : ""} placeholder="답을 써 주세요" autocomplete="off">
    <button type="button" class="btn-text small" data-swap>${frac ? "글로 쓰기" : "분수로 쓰기"}</button>
  </div>`;
}
function wireAnswerBox(root, onEnter) {
  const box = root.querySelector(".ans-box"); if (!box) return;
  box.querySelectorAll("[data-ch]").forEach((b) => (b.onclick = () => {
    if (box.dataset.locked) return;
    box.querySelectorAll("[data-ch]").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); box.dataset.sel = b.dataset.ch;
  }));
  const sw = box.querySelector("[data-swap]");
  if (sw) sw.onclick = () => {
    const toFrac = box.dataset.mode !== "frac"; box.dataset.mode = toFrac ? "frac" : "text";
    box.querySelector(".frac-in").hidden = !toFrac; box.querySelector(".txt").hidden = toFrac; sw.textContent = toFrac ? "글로 쓰기" : "분수로 쓰기";
  };
  box.querySelectorAll("input").forEach((inp) => (inp.onkeydown = (e) => { if (e.key === "Enter" && onEnter) onEnter(); }));
}
// 쓴 답 읽기 → { given: 보여 줄 답, cands: 비교할 후보들 } (안 썼으면 null)
function readAnswer(root, n) {
  const box = root.querySelector(".ans-box"); if (!box) return null;
  if (box.dataset.mode === "choice") {
    if (box.dataset.sel == null) return null;
    const i = +box.dataset.sel; return { given: CIRCLED[i], cands: [CIRCLED[i], String(i + 1), n.choices[i]] };
  }
  if (box.dataset.mode === "frac") {
    const v = (c) => box.querySelector(c).value.replace(/\D/g, "");
    const w = v(".fw"), nu = v(".fn"), de = v(".fd");
    if (!nu && !de) return w ? { given: w, cands: [w] } : null;
    if (!nu || !de) return { error: "분자와 분모를 둘 다 써 주세요" };
    const g = (w ? w + " " : "") + nu + "/" + de; return { given: g, cands: [g] };
  }
  const t = box.querySelector(".txt").value.trim(); return t ? { given: t, cands: [t] } : null;
}
const judgeAnswer = (n, a) => { const right = normAnswer(n.correctAnswer); return !!right && a.cands.some((c) => normAnswer(c) === right); };
// 푼 기록 남기기 (두 번 연속 맞히면 익힘)
function solvedData(n, ok, given) {
  const data = { tryCount: (n.tryCount || 0) + 1, lastTriedAt: Date.now(), lastAnswer: given || "" };
  if (ok) { data.correctStreak = (n.correctStreak || 0) + 1; if (data.correctStreak >= 2) data.status = "mastered"; }
  else { data.correctStreak = 0; data.status = "wrong"; data.wrongCount = (n.wrongCount || 0) + 1; }
  return data;
}

// ───────── 문제 카드 ─────────
function choicesHTML(choices) {
  if (!choices || !choices.length) return "";
  return `<ul class="choices">${choices.map((c, i) => `<li>${/^[①-⑩]/.test(c) ? "" : CIRCLED[i] + " "}${rich(c)}</li>`).join("")}</ul>`;
}
function noteCard(n) {
  const parent = n.parentId ? state.notes.find((x) => x.id === n.parentId) : null;
  const col = subjColor(n.subject);
  // 내 답이 정답과 같거나, 처음 찍을 때 맞은 문제로 저장된 경우는 맞은 답으로 보여 주기
  const mineOk = !!n.myAnswer && (n.myAnswerOk || normAnswer(n.myAnswer) === normAnswer(n.correctAnswer) || (n.source === "photo" && !n.wrongCount));
  // 비슷한 문제는 아이가 먼저 풀어 봐야 답과 풀이가 보인다
  const practice = n.source === "ai" && !n.tryCount && !n.myAnswer;
  return `<article class="note" data-id="${n.id}" style="--sc:${col}">
    <span class="flag">${esc(n.subject)}</span>
    <div class="note-head">
      ${n.unit ? `<span class="tag">${esc(n.unit)}</span>` : ""}
      ${n.type ? `<span class="tag">${esc(n.type)}</span>` : ""}
      ${n.source === "ai" ? `<span class="tag ai">비슷한 문제</span>` : ""}
      ${n.status === "mastered" ? `<span class="tag ok">익힘</span>` : `<span class="tag wrong">${n.wrongCount ? `틀림 ${n.wrongCount}번` : "연습할 문제"}</span>`}
      <span class="muted small" style="margin-left:auto">${(state.nb.members || []).length > 1 && n.addedByName ? esc(n.addedByName) + " · " : ""}${fmtDate(n.createdAt)}</span>
    </div>
    <div class="q">${rich(n.question)}</div>
    ${n.figure ? `<img class="fig" src="${n.figure}" alt="문제 그림">` : ""}
    ${practice ? `<div class="practice">${answerBoxHTML(n)}
      <div class="row" style="margin-top:8px"><button class="btn red" data-act="check">답 확인</button><span class="muted small">답을 써야 정답과 풀이가 보여요</span></div></div>` : `${choicesHTML(n.choices)}
    <div class="ans">
      ${n.myAnswer ? `<div class="mine ${mineOk ? "ok" : ""}">내 답: ${rich(n.myAnswer)}</div>` : ""}
      <div class="right">정답: ${rich(n.correctAnswer || "(없음)")}${n.answerFromAI ? ` <span class="muted small">(AI가 푼 답)</span>` : ""}</div>
    </div>
    ${n.wrongReason || n.explanation ? `<details class="exp"><summary>${n.wrongReason && !mineOk ? "틀린 이유와 풀이" : "풀이"}</summary>
      ${n.wrongReason && !mineOk ? `<p><b>틀린 이유</b><br>${rich(n.wrongReason)}</p>` : ""}
      ${n.explanation ? `<p><b>풀이</b><br>${rich(n.explanation)}</p>` : ""}</details>` : ""}
    ${n.source === "ai" && n.myAnswer && !mineOk ? `<button class="btn-text small" data-act="fixok">내 답도 맞는 답이에요</button>` : ""}`}
    ${parent ? `<p class="muted small">원래 문제: ${esc(parent.question.slice(0, 40))}…</p>` : ""}
    <div class="note-actions">
      <button class="btn sm" data-act="similar">비슷한 문제 ${SIMILAR_COUNT}개 더</button>
      <button class="btn sm" data-act="toggle">${n.status === "mastered" ? "다시 틀림으로" : "익힘으로"}</button>
      <button class="btn sm" data-act="edit">고치기</button>
      <button class="btn sm ghost" data-act="del">지우기</button>
    </div>
  </article>`;
}

// ───────── 목록 ─────────
// 학년도: 3월 ~ 다음 해 2월
const schoolYear = (t) => { const d = new Date(t || Date.now()); return d.getMonth() >= 2 ? d.getFullYear() : d.getFullYear() - 1; };
let listYear = null; // 처음 열 때 정함
function yearsWithNotes() { return [...new Set(state.notes.map((n) => schoolYear(n.createdAt)))].sort((a, b) => a - b); }
const inYear = (n, y) => y === "all" || y == null || schoolYear(n.createdAt) === +y;

function renderStats() {
  // 왼쪽 학년도 띠지
  const years = yearsWithNotes();
  if (listYear === null || (listYear !== "all" && !years.includes(+listYear))) {
    const now = schoolYear();
    listYear = years.includes(now) ? now : years.length ? years[years.length - 1] : "all";
  }
  $("#yearTabs").innerHTML = years.length < 1 ? "" :
    `<button class="ytab ${listYear === "all" ? "on" : ""}" data-year="all">모든 해</button>` +
    years.map((y) => `<button class="ytab ${+listYear === y ? "on" : ""}" data-year="${y}"><span class="yy">${String(y).slice(2)}</span>학년도</button>`).join("");

  const pool = state.notes.filter((n) => inYear(n, listYear));
  const wrong = pool.filter((n) => n.status !== "mastered").length;
  const done = pool.length - wrong;
  const bySub = {};
  pool.forEach((n) => { if (n.status !== "mastered") bySub[n.subject] = (bySub[n.subject] || 0) + 1; });
  $("#stats").innerHTML = `<div class="stat red"><b>${wrong}</b>아직 틀림</div><div class="stat green"><b>${done}</b>익힘</div>`;
  // 오른쪽 과목 색 띠지
  const subs = SUBJECTS.filter((s) => pool.some((n) => n.subject === s));
  if (listSubject !== "all" && !subs.includes(listSubject)) listSubject = "all";
  const num = (c) => `<span class="cnt">${c || ""}</span>`;
  $("#indexTabs").style.setProperty("--sel", listSubject === "all" ? "var(--ink)" : subjColor(listSubject));
  $("#indexTabs").innerHTML = !state.notes.length ? "" :
    `<button class="itab all ${listSubject === "all" ? "on" : ""}" data-sub="all">전체${num(wrong)}</button>` +
    subs.map((s) => `<button class="itab ${listSubject === s ? "on" : ""}" data-sub="${esc(s)}" style="background:${subjColor(s)}">${esc(s)}${num(bySub[s])}</button>`).join("");
}
function filtered({ subject, status, similar, search = "", year = "all" }) {
  const q = search.trim().toLowerCase();
  return state.notes.filter((n) =>
    inYear(n, year) &&
    (subject === "all" || n.subject === subject) &&
    (status === "all" || (status === "mastered" ? n.status === "mastered" : n.status !== "mastered")) &&
    (similar || n.source !== "ai") &&
    (!q || [n.question, n.unit, n.type].join(" ").toLowerCase().includes(q)));
}
function fillYearSelect(sel) {
  const cur = sel.value || String(listYear ?? "all");
  sel.innerHTML = `<option value="all">모든 해</option>` + yearsWithNotes().map((y) => `<option value="${y}">${y}학년도</option>`).join("");
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "all";
}
function renderList() {
  renderStats();
  const list = filtered({ subject: listSubject, status: $("#fStatus").value, similar: $("#fSimilar").checked, search: $("#fSearch").value, year: listYear });
  const st = { wrong: "아직 틀린", mastered: "익힌", all: "모은" }[$("#fStatus").value];
  const yName = listYear === "all" ? "" : `${listYear}학년도 · `;
  $("#secTitle").innerHTML = state.notes.length ? `<span class="sec-mark" style="background:${listSubject === "all" ? "var(--ink)" : subjColor(listSubject)}"></span>${yName}${listSubject === "all" ? "전체" : esc(listSubject)} · ${st} ${list.length}문제` : "";
  const box = $("#noteList");
  if (!state.notes.length) { box.innerHTML = `<div class="empty">아직 모은 오답이 없어요.<br>아래 "찍기"에서 틀린 문제를 찍어 올려 보세요.</div>`; return; }
  box.innerHTML = list.length ? list.map(noteCard).join("") : `<div class="empty">조건에 맞는 문제가 없어요.</div>`;
  box.querySelectorAll(".note .practice").forEach((p) => { const card = p.closest(".note"); wireAnswerBox(p, () => card.querySelector('[data-act="check"]').click()); });
  typeset(box);
}
["#fStatus", "#fSimilar"].forEach((s) => ($(s).onchange = renderList));
$("#yearTabs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-year]"); if (!t) return;
  listYear = t.dataset.year === "all" ? "all" : +t.dataset.year; renderList(); window.scrollTo({ top: 0, behavior: "smooth" });
});
$("#indexTabs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-sub]"); if (!t) return;
  listSubject = t.dataset.sub; renderList(); window.scrollTo({ top: 0, behavior: "smooth" });
});
$("#fSearch").oninput = () => { clearTimeout(renderList._t); renderList._t = setTimeout(renderList, 250); };

$("#noteList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]"); if (!btn) return;
  const id = btn.closest(".note").dataset.id; const n = state.notes.find((x) => x.id === id); if (!n) return;
  const act = btn.dataset.act;
  if (act === "del") {
    if (!confirm("이 문제를 지울까요?")) return;
    await removeNote(id); renderList(); toast("지웠어요");
  } else if (act === "toggle") {
    await patchNote(id, n.status === "mastered" ? { status: "wrong", correctStreak: 0 } : { status: "mastered" });
    renderList();
  } else if (act === "edit") {
    openEdit(n);
  } else if (act === "check") {
    const card = btn.closest(".note"), a = readAnswer(card, n);
    if (!a) { toast(n.choices && n.choices.length ? "답을 골라 주세요" : "답을 써 주세요"); return; }
    if (a.error) { toast(a.error); return; }
    const ok = judgeAnswer(n, a);
    try { await patchNote(id, { ...solvedData(n, ok, a.given), myAnswer: a.given }); } catch (e) { toast("기록하지 못했어요: " + (e.code || e.message)); return; }
    toast(ok ? "맞았어요! 한 번 더 맞히면 익힘이 돼요" : "아쉬워요. 정답과 풀이를 확인해 봐요", 3500);
    renderList();
    const again = document.querySelector(`.note[data-id="${id}"] details.exp`); if (again && !ok) again.open = true;
  } else if (act === "fixok") {
    await patchNote(id, { myAnswerOk: true, correctStreak: (n.correctStreak || 0) + 1, wrongCount: Math.max(0, (n.wrongCount || 1) - 1) });
    renderList(); toast("맞은 답으로 고쳤어요");
  } else if (act === "similar") {
    askNotifyOnce();
    enqueueSimilar([n]);
    toast("비슷한 문제를 만들기 시작했어요. 다른 화면을 봐도 괜찮아요");
  }
});

// ───────── 고치기 ─────────
function editFormHTML(n, prefix) {
  const subj = SUBJECTS.map((s) => `<option ${s === n.subject ? "selected" : ""}>${esc(s)}</option>`).join("");
  return `<div class="edit" data-prefix="${prefix}">
    <div class="two">
      <label>과목<select name="subject">${subj}</select></label>
      <label>단원<input name="unit" value="${esc(n.unit)}"></label>
    </div>
    <label>유형<input name="type" value="${esc(n.type)}"></label>
    <label>문제 (수식은 $ 로 감싸기, 예: $\\frac{1}{2}$)<textarea name="question">${esc(n.question)}</textarea></label>
    <div class="preview-box" data-preview>${rich(n.question)}</div>
    <label>보기 (한 줄에 하나, 없으면 비워 두기)<textarea name="choices" style="min-height:50px">${esc((n.choices || []).join("\n"))}</textarea></label>
    <div class="two">
      <label>내 답<input name="myAnswer" value="${esc(n.myAnswer)}"></label>
      <label>정답<input name="correctAnswer" value="${esc(n.correctAnswer)}"></label>
    </div>
    <label>틀린 이유<textarea name="wrongReason" style="min-height:50px">${esc(n.wrongReason)}</textarea></label>
    <label>풀이<textarea name="explanation">${esc(n.explanation)}</textarea></label>
  </div>`;
}
function readForm(root) {
  const v = (k) => root.querySelector(`[name="${k}"]`).value.trim();
  return {
    subject: v("subject"), unit: v("unit"), type: v("type"), question: v("question"),
    choices: v("choices").split("\n").map((s) => s.trim()).filter(Boolean),
    myAnswer: v("myAnswer"), correctAnswer: v("correctAnswer"), wrongReason: v("wrongReason"), explanation: v("explanation")
  };
}
function wirePreview(root) {
  const ta = root.querySelector('[name="question"]'), pv = root.querySelector("[data-preview]");
  ta.addEventListener("input", () => { clearTimeout(ta._t); ta._t = setTimeout(() => { pv.innerHTML = rich(ta.value); typeset(pv); }, 300); });
}
function openEdit(n) {
  openModal(`<h2>문제 고치기</h2>${editFormHTML(n, "m")}
    ${n.figure ? `<img class="fig" src="${n.figure}"><label class="chk"><input type="checkbox" id="mDropFig"> 그림 빼기</label>` : ""}
    <div class="row" style="margin-top:12px"><button class="btn primary" id="mSave">저장</button><button class="btn" id="mCancel">닫기</button></div>`);
  const root = $("#modalBox .edit"); wirePreview(root);
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const data = readForm(root);
    if ($("#mDropFig")?.checked) { data.figure = ""; data.figureSpec = ""; }
    try { await patchNote(n.id, data); closeModal(); renderList(); toast("저장했어요"); }
    catch (e) { toast("저장하지 못했어요: " + (e.code || e.message)); }
  };
}

// ───────── 설정 ─────────
$("#btnSettings").onclick = () => openSettings();
function openSettings() {
  const nb = state.nb, uid = state.user.uid, isOwner = nb.owner === uid;
  const people = (nb.members || []).map((m) => `<li>${esc((nb.names || {})[m] || "이름 없음")}${m === nb.owner ? " <span class='tag'>만든 사람</span>" : ""}${m === uid ? " (나)" : ""}
      ${isOwner && m !== uid ? `<button class="btn sm ghost" data-kick="${m}">빼기</button>` : ""}</li>`).join("");
  const others = state.notebooks.length > 1
    ? `<label>다른 노트로 바꾸기<select id="sSwitch">${state.notebooks.map((n) => `<option value="${n.id}" ${n.id === nb.id ? "selected" : ""}>${esc(n.name)}</option>`).join("")}</select></label>` : "";
  openModal(`<h2>설정</h2>
    <div class="edit">
      <label>노트 이름<input id="sName" value="${esc(nb.name)}"></label>
      <label>학년 (AI가 눈높이를 맞추는 데 써요)<input id="sGrade" placeholder="예: 초등 4학년, 중학교 2학년" value="${esc(nb.grade || "")}"></label>
      ${others}
    </div>
    <h3 style="margin-top:14px">함께 쓰는 사람</h3>
    <ul class="people">${people}</ul>
    <button class="btn red" id="sInvite">QR로 초대하기</button>
    <p class="muted small">초대받은 사람은 QR을 찍고 자기 구글 계정으로 로그인하면 이 노트를 같이 보고 함께 채울 수 있어요.</p>
    <p class="muted small">로그인: ${esc(state.user.email)}</p>
    <div class="row" style="margin-top:12px">
      <button class="btn primary" id="sSave">저장</button>
      <button class="btn" id="sOut">로그아웃</button>
      <button class="btn" id="sDiag">AI 연결 점검</button>
      <button class="btn" id="sNotify">알림 받기</button>
      ${isOwner ? `<button class="btn ghost" id="sNew">새 노트 만들기</button>` : `<button class="btn ghost" id="sLeave">이 노트에서 나가기</button>`}
      <button class="btn ghost" id="sClose">닫기</button>
    </div>`);
  $("#sClose").onclick = closeModal;
  $("#sOut").onclick = async () => { closeModal(); state.notes = []; state.retry = null; state.nb = null; await signOut(auth); };
  $("#sInvite").onclick = () => openInvite();
  $("#sDiag").onclick = () => openDiag();
  $("#sNotify").onclick = async () => {
    if (!canNotify()) { toast("이 브라우저는 알림을 띄울 수 없어요. 아이폰은 홈 화면에 추가한 앱에서만 돼요", 6000); return; }
    if (Notification.permission === "denied") { toast("알림이 막혀 있어요. 휴대폰 설정 > 앱(브라우저) > 알림에서 이 사이트를 허용해 주세요", 7000); return; }
    const r = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (r === "granted") notifyDone("알림이 켜졌어요. 비슷한 문제를 다 만들면 이렇게 알려 드려요");
  };
  $("#sSave").onclick = async () => {
    const data = { name: $("#sName").value.trim() || nb.name, grade: $("#sGrade").value.trim() };
    try {
      await updateDoc(nbRef(nb.id), data); Object.assign(nb, data);
      const sw = $("#sSwitch");
      if (sw && sw.value !== nb.id) { await useNotebook(sw.value); state.retry = null; closeModal(); await loadNotes(); show("list"); toast(`"${state.nb.name}"로 바꿨어요`); return; }
      toast("저장했어요"); closeModal();
    } catch (e) { toast("저장하지 못했어요: " + (e.code || e.message)); }
  };
  $("#modalBox").querySelectorAll("[data-kick]").forEach((b) => (b.onclick = async () => {
    const who = (nb.names || {})[b.dataset.kick] || "이 사람";
    if (!confirm(`${who}을(를) 이 노트에서 뺄까요?`)) return;
    try { await updateDoc(nbRef(nb.id), { members: arrayRemove(b.dataset.kick) }); nb.members = nb.members.filter((m) => m !== b.dataset.kick); openSettings(); }
    catch (e) { toast("빼지 못했어요: " + (e.code || e.message)); }
  }));
  if ($("#sLeave")) $("#sLeave").onclick = async () => {
    if (!confirm("이 노트에서 나갈까요? 다시 들어오려면 새 초대 QR이 필요해요.")) return;
    try {
      await updateDoc(nbRef(nb.id), { members: arrayRemove(uid) });
      closeModal(); busy(true, "노트를 여는 중"); state.nb = null; await setupNotebook(); busy(false); await loadNotes(); show("list");
    } catch (e) { busy(false); toast("나가지 못했어요: " + (e.code || e.message)); }
  };
  if ($("#sNew")) $("#sNew").onclick = async () => {
    const name = prompt("새 노트 이름", "새 오답노트"); if (!name) return;
    try {
      const id = await createNotebook(name.trim()); await listNotebooks(); await useNotebook(id);
      state.retry = null; closeModal(); await loadNotes(); show("list"); toast(`"${name}"를 만들었어요`);
    } catch (e) { toast("만들지 못했어요: " + (e.code || e.message)); }
  };
}

// AI 연결 점검: 어디서 멈추는지 단계별로 보여 주기
async function openDiag() {
  openModal(`<h2>AI 연결 점검</h2><p class="muted small">한 단계씩 확인해요. 끝나면 이 화면을 캡처해 주세요.</p>
    <ol id="diagList" class="diag"></ol>
    <h3 style="margin-top:12px">최근 오류</h3><div id="diagErr" class="muted small"></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="dBack">돌아가기</button></div>`);
  try {
    const errs = JSON.parse(localStorage.getItem("odapErrors") || "[]");
    $("#diagErr").innerHTML = errs.length ? errs.map((x) => { const d = new Date(x.t); return `<p class="err-line">${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} · ${esc(x.where)}<br>${esc(x.msg)}</p>`; }).join("") : "없어요";
  } catch (_) {}
  $("#dBack").onclick = () => openSettings();
  const line = (label) => { const li = document.createElement("li"); li.innerHTML = `${esc(label)} <span class="muted">확인 중…</span>`; $("#diagList").appendChild(li); return li; };
  const done = (li, ok, text) => { li.querySelector("span").outerHTML = `<b class="${ok ? "ok" : "no"}">${ok ? "통과" : "멈춤"}</b> <span class="muted small">${esc(text)}</span>`; };
  const short = (e) => String(e?.message || e).replace(/^\[[^\]]*\]\s*/, "").replace(/Error fetching from \S+\s*/i, "").slice(0, 140);
  const sec = (t) => ((Date.now() - t) / 1000).toFixed(1) + "초";

  let li = line("1. 인터넷 연결"); done(li, navigator.onLine, navigator.onLine ? "연결됨" : "인터넷이 끊겨 있어요");
  li = line("2. App Check 확인 표 받기");
  let t = Date.now();
  if (!appCheck) done(li, false, "config.js 에 사이트 키가 없어요");
  else {
    try { const r = await withTimeout(getAppCheckToken(appCheck, true), 20000, "20초 넘게 걸림"); done(li, !!(r && r.token), sec(t)); }
    catch (e) { done(li, false, short(e)); }
  }
  for (const name of [...new Set([...AI_MODELS_FAST, ...AI_MODELS])]) {
    li = line(`3. AI 대답 (${name})`); t = Date.now();
    try {
      const r = await callModel(name, ["숫자 1만 답해."], 0, false, 40000);
      done(li, true, `${sec(t)} · "${String(r.response.text()).trim().slice(0, 10)}"${noThink.has(name) ? " · 생각 줄이기 안 됨" : ""}`);
    } catch (e) { done(li, false, `${sec(t)} · ${short(e)}`); }
  }
}

// QR 초대: 하루 동안 쓸 수 있는 초대 코드를 만들어 QR로 보여 주기
async function openInvite() {
  const nb = state.nb;
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (v) => abc[v % abc.length]).join("");
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  try { await updateDoc(nbRef(nb.id), { inviteCode: code, inviteExpires: expires }); Object.assign(nb, { inviteCode: code, inviteExpires: expires }); }
  catch (e) { toast("초대를 만들지 못했어요: " + (e.code || e.message)); return; }
  const url = `${location.origin}${location.pathname}?nb=${encodeURIComponent(nb.id)}&code=${code}`;
  openModal(`<h2>QR로 초대하기</h2>
    <p class="muted small">함께 쓸 사람이 휴대폰 카메라로 찍으면 "${esc(nb.name)}"에 들어와요. 이 QR은 하루 동안만 쓸 수 있어요.</p>
    <div id="qrBox" class="qr-box"></div>
    <div class="row" style="justify-content:center;margin-top:10px">
      <button class="btn" id="qCopy">링크 복사</button>
      ${navigator.share ? `<button class="btn" id="qShare">카톡 등으로 보내기</button>` : ""}
      <button class="btn ghost" id="qBack">돌아가기</button>
    </div>`);
  if (window.qrcode) { const qr = window.qrcode(0, "M"); qr.addData(url); qr.make(); $("#qrBox").innerHTML = qr.createImgTag(6, 8, "초대 QR"); }
  else $("#qrBox").innerHTML = `<p class="muted small">QR을 그리지 못했어요. 아래 링크 복사를 써 주세요.</p>`;
  $("#qCopy").onclick = async () => { try { await navigator.clipboard.writeText(url); toast("링크를 복사했어요"); } catch (_) { prompt("이 링크를 복사하세요", url); } };
  if ($("#qShare")) $("#qShare").onclick = () => navigator.share({ title: NAME, text: `${nb.name}에 같이 쓰자!`, url }).catch(() => {});
  $("#qBack").onclick = () => openSettings();
}

// ───────── 찍기 ─────────
async function onPhoto(file) {
  if (!file) return;
  try {
    const img = await loadImage(file);
    state.photo = { canvas: imageToCanvas(img, 1600) };
    showPhoto();
    $("#photoPreview").classList.remove("hidden");
    $("#recogResult").innerHTML = ""; state.recog = [];
  } catch (_) { toast("사진을 열지 못했어요"); }
}
$("#inCamera").onchange = (e) => { onPhoto(e.target.files[0]); e.target.value = ""; };
$("#inGallery").onchange = (e) => { onPhoto(e.target.files[0]); e.target.value = ""; };
$("#btnRotL").onclick = () => { if (!state.photo) return; state.photo.canvas = rotateCanvas(state.photo.canvas, 270); showPhoto(); };
$("#btnRotR").onclick = () => { if (!state.photo) return; state.photo.canvas = rotateCanvas(state.photo.canvas, 90); showPhoto(); };
$("#btnClearPhoto").onclick = () => { state.photo = null; state.recog = []; $("#photoPreview").classList.add("hidden"); $("#recogResult").innerHTML = ""; };

function recognizePrompt() {
  return `너는 학생의 오답노트를 정리해 주는 친절한 선생님이다. 사진은 학생이 푼 시험지·문제집·학습지다.
학생 학년: ${grade() || "모름(사진을 보고 짐작)"}
할 일
0. 사진이 옆으로 눕거나 거꾸로 찍혔을 수 있다. 글자 방향을 보고 머릿속으로 바로 세워서 읽는다.
   사진을 바로 세우려면 시계 방향으로 몇 도 돌려야 하는지 rotate 에 0, 90, 180, 270 중 하나로 적는다.
   figureBox 는 돌리기 전, 보낸 사진 그대로를 기준으로 적는다.
1. 문제 글(question)·보기·그림은 "인쇄된 글자"만 읽는다. 연필·펜으로 쓴 손글씨, 풀이 계산, 낙서, 밑줄, 동그라미, 옆 페이지의 글은 문제 글에 넣지 않는다.
   손글씨는 딱 두 가지에만 쓴다: 학생이 답 칸·괄호·밑줄 자리에 적은 최종 답(myAnswer), 그리고 채점 표시.
   답 칸 밖의 계산 낙서는 학생 답으로 보지 않는다. 다만 wrongReason 을 쓸 때 어디서 틀렸는지 짐작하는 데는 참고해도 된다.
   figureBox 는 인쇄된 그림만 감싸고, 그 위의 손글씨는 되도록 피한다.
2. 사진 속 문제를 하나하나 찾는다. 잘려서 다 보이지 않는 문제는 빼고, 온전히 보이는 문제만 정리한다.
3. 채점 표시(빗금, X표, 빨간 줄, 세모)가 있으면 그것으로 틀린 문제를 판단한다. 동그라미는 맞은 문제다. 채점 표시가 없으면 학생 답과 정답을 비교해 판단한다.
4. 정답이 사진에 없으면 직접 풀어서 정답을 쓰고 answerFromAI 를 true 로 한다.
5. 수식은 LaTeX 로 쓰고 $...$ 로 감싼다(예: $\\frac{3}{4}+\\frac{1}{8}$). 수식이 아닌 글은 그대로 쓴다.
6. 보기(①②③…)는 question 에 넣지 말고 choices 배열에 앞 번호 없이 넣는다. 정답이 보기 중 하나면 correctAnswer 는 "③" 처럼 번호로 쓴다.
7. 문제에 그림·도형·그래프·표·지도처럼 글로 옮기기 어려운 부분이 있으면 hasFigure 를 true 로 하고, 그 부분이 사진 어디에 있는지 figureBox 에 [ymin, xmin, ymax, xmax] (사진 전체를 0~1000 으로 본 비율)로 적는다. 글로 옮길 수 있는 짧은 표는 question 안에 글로 적는다.
8. wrongReason 은 학생 답을 보고 왜 틀렸을지 학생 눈높이로 한두 문장, explanation 은 학생 눈높이의 단계별 풀이로 쓴다.
9. subject 는 다음 중 하나: ${SUBJECTS.join(", ")}

아래 JSON 하나만 출력한다.
{"rotate":0,"problems":[{"number":"문제 번호","subject":"과목","unit":"단원(짐작)","type":"문제 유형(짧게)","question":"문제 글","choices":[],"myAnswer":"학생이 쓴 답, 없으면 빈 문자열","correctAnswer":"정답","answerFromAI":false,"isWrong":true,"wrongReason":"","explanation":"","hasFigure":false,"figureBox":[]}]}`;
}

async function readPhotoOnce() {
  const b64 = state.photo.canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  const out = await askAI([recognizePrompt(), { inlineData: { data: b64, mimeType: "image/jpeg" } }], 0.2,
    (name, i) => { state.aiNote = i > 0 ? ` (붐벼서 ${name.replace("gemini-", "")}로 다시)` : ""; }, AI_MODELS_FAST);
  const probs = Array.isArray(out.problems) ? out.problems.filter((p) => p && p.question) : [];
  const rot = [90, 180, 270].includes(+out.rotate) ? +out.rotate : 0;
  if (rot && probs.length) {
    // 사진을 바로 세우고, 그림 위치도 같이 돌리기
    state.photo.canvas = rotateCanvas(state.photo.canvas, rot); showPhoto();
    probs.forEach((p) => { p.figureBox = rotateBox(p.figureBox, rot); });
  }
  return probs;
}
$("#btnRecognize").onclick = async () => {
  if (!state.photo) return;
  const t0 = Date.now();
  let msg = "사진 속 문제를 읽는 중";
  state.aiNote = "";
  const est = estSec("read");
  busy(true, `${msg}\n${leftText(est)}`);
  const tick = setInterval(() => { const el = (Date.now() - t0) / 1000; busy(true, `${msg}${state.aiNote || ""}\n${leftText(est - el)} · ${Math.round(el)}초 지남`); }, 1000);
  try {
    let probs = await readPhotoOnce();
    if (probs.length) recordSec("read", (Date.now() - t0) / 1000);
    if (!probs.length) {
      // 못 찾으면 사진을 옆으로 돌려 한 번 더
      msg = "사진을 돌려서 한 번 더 읽는 중";
      state.photo.canvas = rotateCanvas(state.photo.canvas, 90); showPhoto();
      probs = await readPhotoOnce();
      if (!probs.length) { state.photo.canvas = rotateCanvas(state.photo.canvas, 270); showPhoto(); }
    }
    state.recog = probs.map((p) => ({
      ...p,
      subject: SUBJECTS.includes(p.subject) ? p.subject : "기타",
      choices: Array.isArray(p.choices) ? p.choices.map(String) : [],
      figure: p.hasFigure ? cropToDataURL(state.photo.canvas, p.figureBox) : "",
      keep: p.isWrong !== false
    }));
    renderRecog();
    if (!probs.length) $("#recogResult").innerHTML = `<div class="card"><h3>문제를 찾지 못했어요</h3>
      <p class="muted">위의 돌리기 단추로 글자가 바로 서게 맞춘 뒤 다시 눌러 보세요.<br>
      그래도 안 되면 문제 2~3개만 나오게 가까이, 밝은 곳에서, 그림자 없이 찍어 주세요.</p></div>`;
  } catch (e) { logErr("사진 읽기", e); toast(aiErrorText(e), 8000); }
  clearInterval(tick);
  busy(false);
};

function renderRecog() {
  const box = $("#recogResult");
  if (!state.recog.length) { box.innerHTML = ""; return; }
  const how = state.lastAI ? ` <span class="small">(${state.lastAI.sec}초 · ${esc(state.lastAI.model.replace("gemini-", ""))})</span>` : "";
  box.innerHTML = `<p class="muted">문제 ${state.recog.length}개를 찾았어요${how}. 틀린 문제에는 미리 체크해 두었어요. 내용을 확인하고 고칠 곳은 고쳐 주세요.</p>` +
    state.recog.map((p, i) => `<div class="card recog ${p.keep ? "" : "notwrong"}" data-i="${i}">
      <div class="note-head">
        <label class="chk" style="margin:0"><input type="checkbox" data-keep ${p.keep ? "checked" : ""}> <b>${esc(p.number || i + 1)}번 저장</b></label>
        ${p.isWrong === false ? `<span class="tag ok">맞은 문제</span>` : `<span class="tag wrong">틀린 문제</span>`}
        ${p.answerFromAI ? `<span class="tag ai">정답은 AI가 풂</span>` : ""}
      </div>
      ${editFormHTML(p, "r" + i)}
      <div data-figbox>${figBlock(p)}</div>
      <div class="row" style="margin-top:6px">
        <button class="btn sm" data-crop>${p.figure ? "그림 다시 자르기" : "그림 잘라 넣기"}</button>
        ${p.figure ? `<button class="btn sm ghost" data-nofig>그림 빼기</button>` : ""}
      </div>
    </div>`).join("") +
    `<div class="save-bar">
      <label class="chk"><input type="checkbox" id="optSimilar" checked> 저장하면서 문제마다 비슷한 문제 ${SIMILAR_COUNT}개씩 만들기</label>
      <button class="btn red big" id="btnSaveRecog">체크한 문제 저장</button>
    </div>`;
  box.querySelectorAll(".recog").forEach((card) => wirePreview(card.querySelector(".edit")));
  typeset(box);
}
const figBlock = (p) => (p.figure ? `<img class="fig" src="${p.figure}" alt="잘라 낸 그림">` : "");

$("#recogResult").addEventListener("change", (e) => {
  if (e.target.matches("[data-keep]")) {
    const card = e.target.closest(".recog"); const p = state.recog[card.dataset.i];
    p.keep = e.target.checked; card.classList.toggle("notwrong", !p.keep);
  }
});
$("#recogResult").addEventListener("click", async (e) => {
  const card = e.target.closest(".recog");
  if (card) {
    const i = +card.dataset.i, p = state.recog[i];
    if (e.target.matches("[data-nofig]")) { syncRecog(); p.figure = ""; renderRecog(); return; }
    if (e.target.matches("[data-crop]")) {
      syncRecog();
      const box = await cropEditor(state.photo.canvas, p.figureBox);
      if (box) { p.figureBox = box; p.figure = cropToDataURL(state.photo.canvas, box); renderRecog(); }
      return;
    }
  }
  if (e.target.id === "btnSaveRecog") saveRecog();
});
function syncRecog() {
  document.querySelectorAll("#recogResult .recog").forEach((card) => {
    const p = state.recog[card.dataset.i]; Object.assign(p, readForm(card.querySelector(".edit")));
  });
}
async function saveRecog() {
  syncRecog();
  const picks = state.recog.filter((p) => p.keep && p.question);
  if (!picks.length) { toast("저장할 문제를 체크해 주세요"); return; }
  const withSimilar = $("#optSimilar").checked;
  if (withSimilar) askNotifyOnce();
  busy(true, "저장하는 중");
  let saved = 0; const savedNotes = [];
  try {
    for (const p of picks) {
      const note = await addNote({
        subject: p.subject, unit: p.unit || "", type: p.type || "", question: p.question, choices: p.choices || [],
        myAnswer: p.myAnswer || "", correctAnswer: p.correctAnswer || "", answerFromAI: !!p.answerFromAI,
        wrongReason: p.wrongReason || "", explanation: p.explanation || "", figure: p.figure || "", source: "photo",
        status: p.isWrong === false ? "mastered" : "wrong", wrongCount: p.isWrong === false ? 0 : 1
      });
      saved++; savedNotes.push(note);
    }
    toast(`${saved}문제를 저장했어요` + (withSimilar ? ". 비슷한 문제는 뒤에서 만들고 있어요" : ""), 3500);
    if (withSimilar) enqueueSimilar(savedNotes);
    state.photo = null; state.recog = []; $("#photoPreview").classList.add("hidden"); $("#recogResult").innerHTML = "";
    busy(false); show("list");
  } catch (e) { busy(false); toast("저장하지 못했어요: " + (e.code || e.message), 4000); }
}

// 그림 자르기 창: 사진 위에 손가락(마우스)으로 네모를 그려서 고르기
function cropEditor(canvas, initBox) {
  return new Promise((resolve) => {
    openModal(`<h2>그림 부분 고르기</h2><p class="muted small">사진 위를 끌어서 그림이 들어갈 네모를 그려 주세요.</p>
      <div class="crop-wrap" id="cropWrap"><img id="cropImg" src="${canvas.toDataURL("image/jpeg", 0.8)}"><div class="crop-rect hidden" id="cropRect"></div></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="cOk">이 부분으로</button><button class="btn" id="cNo">취소</button></div>`);
    const wrap = $("#cropWrap"), rect = $("#cropRect"), img = $("#cropImg");
    let box = Array.isArray(initBox) && initBox.length === 4 ? initBox.map(Number) : null, start = null;
    const draw = () => {
      if (!box) return; const w = img.clientWidth, h = img.clientHeight;
      Object.assign(rect.style, { top: (box[0] / 1000) * h + "px", left: (box[1] / 1000) * w + "px", height: ((box[2] - box[0]) / 1000) * h + "px", width: ((box[3] - box[1]) / 1000) * w + "px" });
      rect.classList.remove("hidden");
    };
    img.onload = draw; if (img.complete) draw();
    const pos = (e) => { const r = img.getBoundingClientRect(); return [Math.min(1000, Math.max(0, ((e.clientY - r.top) / r.height) * 1000)), Math.min(1000, Math.max(0, ((e.clientX - r.left) / r.width) * 1000))]; };
    wrap.onpointerdown = (e) => { wrap.setPointerCapture(e.pointerId); start = pos(e); box = [start[0], start[1], start[0], start[1]]; draw(); };
    wrap.onpointermove = (e) => { if (!start) return; const p = pos(e); box = [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.max(start[0], p[0]), Math.max(start[1], p[1])]; draw(); };
    wrap.onpointerup = () => { start = null; };
    $("#cNo").onclick = () => { closeModal(); resolve(null); };
    $("#cOk").onclick = () => { closeModal(); resolve(box && box[2] - box[0] > 15 && box[3] - box[1] > 15 ? box.map(Math.round) : null); };
  });
}

// ───────── 비슷한 문제 만들기 ─────────
async function makeSimilar(n, count) {
  const prompt = `너는 학생에게 연습 문제를 내 주는 선생님이다. 아래 "원래 문제"와 같은 유형의 새 문제를 ${count}개 만든다.
학생 학년: ${grade() || "원래 문제 수준에 맞춤"}
규칙
- 같은 개념, 같은 풀이 방법을 쓰는 문제로 만들되 숫자·상황·낱말은 바꾼다. 원래 문제를 그대로 베끼지 않는다.
- 학생이 틀린 이유(${n.wrongReason || "모름"})를 다시 연습할 수 있게 만든다.
- 원래 문제에 그림이 있었으면 새 문제에도 그림을 넣는다. 그림은 직접 그리지 말고 아래 "그림 설계도" 중 하나로 figure 에 적는다.
  그러면 앱이 자로 잰 듯 정확하게 그려 준다. 그림으로 보여 줄 정보(예: 화살표가 가리키는 곳)는 문제 글에 다시 쓰지 않는다.
  그림이 필요 없거나, 아래 설계도로 나타낼 수 없는 그림이면 figure 는 null 로 두고 필요한 정보를 글로 설명한다.
- 그림을 넣었으면 그림을 보고 다시 풀어서 정답과 그림이 꼭 맞는지 확인한다.

그림 설계도 (숫자는 실제 값으로)
 수직선: {"type":"numberline","from":"5","to":"6","parts":6,"arrows":[3],"labels":{"2":"□"}}
   from/to = 양 끝 눈금 글자, parts = 작은 칸 수, arrows = 화살표가 가리키는 눈금 번호(왼쪽 끝이 0), labels = 눈금 번호별 글자(대분수는 "5 2/6")
   points 를 쓰면 점을 찍을 수 있다: "points":[{"at":2,"text":"ㄱ"}]
 띠 분수 모형: {"type":"fractionbar","bars":[{"parts":5,"shaded":2,"label":"가"}]}
 원 분수 모형: {"type":"fractioncircle","circles":[{"parts":8,"shaded":3}]}
 시계: {"type":"clock","hour":3,"minute":40}
 도형: {"type":"polygon","points":[[0,0],[6,0],[6,4],[0,4]],"sides":["6cm","4cm","",""],"vertices":["ㄱ","ㄴ","ㄷ","ㄹ"],"angles":[{"at":0,"text":"60°"}]}
   points 는 실제 길이 비율대로(y는 아래로 갈수록 커짐), sides[i] 는 i번 점과 다음 점 사이 변의 길이 글자
 모눈 위 도형: {"type":"grid","cols":10,"rows":6,"shapes":[[[1,1],[5,1],[5,4]]]}
 표: {"type":"table","rows":[["요일","월","화"],["시간(분)","30","45"]]}
- 원래 문제가 객관식이면 보기 4~5개짜리 객관식으로, 아니면 주관식으로 만든다. 보기는 choices 배열에 번호 없이 넣고, 정답은 "②"처럼 번호로 쓴다.
- 만든 뒤 직접 풀어 보고 정답이 하나로 딱 정해지는지 확인한다. 애매하면 문제를 고친다.
- 수식은 LaTeX 로 쓰고 $...$ 로 감싼다.
- explanation 은 학생 눈높이의 단계별 풀이.

원래 문제
과목: ${n.subject} / 단원: ${n.unit} / 유형: ${n.type}
문제: ${n.question}
보기: ${(n.choices || []).join(" | ") || "없음"}
정답: ${n.correctAnswer}
${n.figureSpec ? "원래 문제의 그림 설계도: " + (typeof n.figureSpec === "string" ? n.figureSpec : JSON.stringify(n.figureSpec)) : n.figure ? "(원래 문제에는 함께 보낸 그림이 있다)" : ""}

아래 JSON 하나만 출력한다.
{"problems":[{"question":"","figure":null,"choices":[],"correctAnswer":"","explanation":""}]}`;
  const parts = [prompt];
  if (n.figure && /^data:image\/jpeg;base64,/.test(n.figure)) parts.push({ inlineData: { data: n.figure.split(",")[1], mimeType: "image/jpeg" } });
  const out = await askAI(parts, 0.7);
  // 답 모양이 조금 달라도 받아 주기: {problems:[…]} / […] / {problem:{…}} / {question:…}
  const list = Array.isArray(out) ? out : Array.isArray(out?.problems) ? out.problems : out?.problem ? [out.problem] : out?.question ? [out] : [];
  const probs = list.filter((p) => p && p.question).slice(0, count);
  if (!probs.length) throw new Error("AI가 문제를 돌려주지 않았어요: " + JSON.stringify(out).slice(0, 60));
  let saved = 0, lastErr = null;
  for (const p of probs) {
    const spec = p.figure && typeof p.figure === "object" && !Array.isArray(p.figure) ? p.figure : null;
    const pic = spec ? drawFigure(spec) : "";
    try {
      await addNote({
        // 파이어베이스는 [[…]] 처럼 겹친 목록을 저장하지 못해서 설계도는 글자로 바꿔 저장
        figure: pic, figureSpec: pic ? JSON.stringify(spec) : "",
        subject: n.subject, unit: n.unit, type: n.type, question: String(p.question),
        choices: Array.isArray(p.choices) ? p.choices.map((c) => String(c ?? "")) : [], correctAnswer: String(p.correctAnswer ?? ""),
        answerFromAI: true, explanation: String(p.explanation ?? ""), source: "ai", parentId: n.id, wrongCount: 0, status: "wrong"
      });
      saved++;
    } catch (e) { lastErr = e; }
  }
  if (!saved && lastErr) throw lastErr;
  return saved;
}

// ───────── 걸린 시간 기억해서 예상 시간 알려 주기 ─────────
const EST_DEFAULT = { read: 25, similar: 25 };
function estSec(kind) { try { return JSON.parse(localStorage.getItem("odapEst") || "{}")[kind] || EST_DEFAULT[kind]; } catch (_) { return EST_DEFAULT[kind]; } }
function recordSec(kind, sec) {
  try { const m = JSON.parse(localStorage.getItem("odapEst") || "{}"); m[kind] = Math.round((m[kind] || sec) * 0.6 + sec * 0.4); localStorage.setItem("odapEst", JSON.stringify(m)); } catch (_) {}
}
const leftText = (sec) => (sec <= 3 ? "거의 다 됐어요" : sec < 60 ? `약 ${Math.ceil(sec / 5) * 5}초 남음` : `약 ${Math.round(sec / 60)}분 남음`);

// ───────── 뒤에서 비슷한 문제 만들기 (화면을 바꿔도 계속) ─────────
const jobs = { queue: [], running: false, done: 0, made: 0, total: 0, fails: 0, lastErr: null };
// 만들 차례를 휴대폰에 적어 두기 → 앱을 껐다 켜도 이어서 만들기
const JOBKEY = () => "odapJobs_" + (state.nb ? state.nb.id : "");
function saveJobs() { try { localStorage.setItem(JOBKEY(), JSON.stringify(jobs.queue.map((n) => n.id).concat(jobs.current ? [jobs.current] : []))); } catch (_) {} }
function resumeJobs() {
  try {
    const ids = JSON.parse(localStorage.getItem(JOBKEY()) || "[]");
    const notes = ids.map((id) => state.notes.find((n) => n.id === id)).filter(Boolean);
    if (notes.length && !jobs.running) { enqueueSimilar(notes); toast(`멈췄던 비슷한 문제 만들기를 이어서 해요 (${notes.length}문제)`, 3500); }
  } catch (_) {}
}
// 화면이 꺼져 있거나 다른 앱에 가 있으면, 돌아올 때까지 기다리기
const whenVisible = () => document.visibilityState === "visible" ? Promise.resolve()
  : new Promise((r) => document.addEventListener("visibilitychange", function f() { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", f); r(); } }));
function enqueueSimilar(notes) {
  notes.forEach((n) => { if (!jobs.queue.some((q) => q.id === n.id) && jobs.current !== n.id) jobs.queue.push(n); });
  saveJobs();
  jobs.total += notes.length;
  renderJobChip();
  if (!jobs.running) runJobs();
}
async function runJobs() {
  jobs.running = true;
  const tick = setInterval(renderJobChip, 1000);
  while (jobs.queue.length) {
    await whenVisible();
    const n = jobs.queue.shift();
    jobs.current = n.id; saveJobs();
    jobs.started = Date.now();
    renderJobChip();
    try { jobs.made += await makeSimilar(n, SIMILAR_COUNT); recordSec("similar", (Date.now() - jobs.started) / 1000); }
    catch (e) {
      logErr("비슷한 문제 만들기", e);
      // 다른 앱에 가 있는 동안 끊긴 거면, 돌아왔을 때 다시
      if ((document.visibilityState !== "visible" || /network|fetch|abort|offline/i.test(String(e?.message || e))) && !n._retried) {
        n._retried = true; jobs.queue.unshift(n); jobs.current = null; saveJobs(); continue;
      }
      jobs.fails++; jobs.lastErr = e;
    }
    jobs.current = null; saveJobs();
    jobs.done++;
    renderJobChip();
    if (state.view === "list") renderList();
    if (state.view === "print") updatePrintAvail();
    if (state.view === "retry" && !state.retry) updateRetryAvail();
  }
  jobs.running = false;
  clearInterval(tick);
  const made = jobs.made, fails = jobs.fails, err = jobs.lastErr;
  Object.assign(jobs, { done: 0, made: 0, total: 0, fails: 0, lastErr: null });
  renderJobChip();
  const msg = made ? `비슷한 문제 ${made}개를 다 만들었어요` : "비슷한 문제를 만들지 못했어요";
  notifyDone(msg + (fails && made ? ` (${fails}문제는 실패)` : ""));
  if (fails) setTimeout(() => toast(aiErrorText(err), 8000), 3500);
}
function renderJobChip() {
  const chip = $("#jobChip");
  if (!jobs.running && !jobs.queue.length) { chip.classList.add("hidden"); return; }
  const est = estSec("similar"), now = (Date.now() - (jobs.started || Date.now())) / 1000;
  const left = Math.max(0, est - now) + jobs.queue.length * est;
  chip.innerHTML = `<span class="mini-spin"></span>비슷한 문제 만드는 중 ${Math.min(jobs.done + 1, jobs.total)}/${jobs.total} · ${leftText(left)}`;
  chip.classList.remove("hidden");
}
window.addEventListener("beforeunload", (e) => { if (jobs.running) { e.preventDefault(); e.returnValue = ""; } });

// 다 만들면 휴대폰 위쪽 알림으로 알려 주기
let swReg = null;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then((r) => (swReg = r)).catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "openList" && state.user) show("list"); });
}
const canNotify = () => "Notification" in window && "serviceWorker" in navigator;
function askNotifyOnce() {
  try {
    if (!canNotify() || Notification.permission !== "default" || localStorage.getItem("odapAskedNotify")) return;
    localStorage.setItem("odapAskedNotify", "1");
    Notification.requestPermission().catch(() => {});
  } catch (_) {}
}
async function notifyDone(text) {
  toast(text, 3500);
  try {
    if (!canNotify() || Notification.permission !== "granted") return;
    const reg = swReg || (await navigator.serviceWorker.ready);
    await reg.showNotification(NAME, { body: text, icon: "icon-192.png", badge: "favicon.png", tag: "similar-done", renotify: true });
  } catch (_) {}
}

// ───────── 다시 풀기 ─────────
function retryPool() {
  return filtered({ subject: $("#rSubject").value || "all", status: $("#rMastered").checked ? "all" : "wrong", similar: $("#rSimilar").checked, year: $("#rYear").value || "all" });
}
function updateRetryAvail() {
  fillYearSelect($("#rYear"));
  const cur = $("#rSubject").value || "all"; fillSubjectSelect($("#rSubject"));
  $("#rSubject").value = [...$("#rSubject").options].some((o) => o.value === cur) ? cur : "all";
  $("#rAvail").textContent = `풀 수 있는 문제: ${retryPool().length}개`;
}
["#rYear", "#rSubject", "#rSimilar", "#rMastered"].forEach((s) => ($(s).onchange = updateRetryAvail));

$("#btnStartRetry").onclick = () => {
  const pool = retryPool();
  if (!pool.length) { toast("다시 풀 문제가 없어요"); return; }
  // 오래 안 푼 것, 많이 틀린 것을 먼저 고르고 순서는 섞기
  const sorted = pool.slice().sort((a, b) => (a.lastTriedAt || 0) - (b.lastTriedAt || 0) || (b.wrongCount || 0) - (a.wrongCount || 0));
  const picked = shuffle(sorted.slice(0, Math.min(+$("#rCount").value, sorted.length)));
  state.retry = { ids: picked.map((n) => n.id), i: 0, right: 0, answer: "", checked: false };
  $("#retrySetup").classList.add("hidden"); $("#retryPlay").classList.remove("hidden");
  renderRetry();
};

function renderRetry() {
  const r = state.retry, box = $("#retryPlay");
  if (r.i >= r.ids.length) {
    box.innerHTML = `<div class="card center"><h2>다 풀었어요</h2>
      <div class="result-big">${r.right} / ${r.ids.length}</div>
      <p class="muted">맞힌 문제는 한 번 더 맞히면 "익힘"이 돼요.</p>
      <button class="btn primary big" id="btnRetryEnd">처음으로</button></div>`;
    $("#btnRetryEnd").onclick = () => { state.retry = null; show("retry"); };
    return;
  }
  const n = state.notes.find((x) => x.id === r.ids[r.i]);
  if (!n) { r.i++; renderRetry(); return; }
  const hasChoices = n.choices && n.choices.length;
  box.innerHTML = `<div class="progress"><div style="width:${(r.i / r.ids.length) * 100}%"></div></div>
  <div class="card">
    <div class="note-head"><b>${r.i + 1} / ${r.ids.length}</b>
      <span class="tag subj" style="background:${subjColor(n.subject)};color:#fff">${esc(n.subject)}</span>${n.type ? `<span class="tag">${esc(n.type)}</span>` : ""}
      ${n.source === "ai" ? `<span class="tag ai">비슷한 문제</span>` : ""}</div>
    <div class="q">${rich(n.question)}</div>
    ${n.figure ? `<img class="fig" src="${n.figure}">` : ""}
    ${answerBoxHTML(n)}
    <div id="verdict"></div>
    <div class="row" style="margin-top:12px" id="retryBtns">
      <button class="btn primary" id="btnCheck">확인</button>
      <button class="btn ghost" id="btnQuit">그만하기</button>
    </div>
  </div>`;
  typeset(box);
  r.checked = false;
  wireAnswerBox(box, () => { if (!r.checked) $("#btnCheck").click(); });
  $("#btnQuit").onclick = () => { state.retry = null; show("retry"); };
  $("#btnCheck").onclick = () => checkAnswer(n);
}

function checkAnswer(n) {
  const r = state.retry;
  const a = readAnswer($("#retryPlay"), n);
  if (!a) { toast(n.choices && n.choices.length ? "답을 골라 주세요" : "답을 써 주세요"); return; }
  if (a.error) { toast(a.error); return; }
  r.checked = true; $("#retryPlay .ans-box").dataset.locked = "1";
  const given = a.given, auto = judgeAnswer(n, a);
  $("#verdict").innerHTML = `<div class="verdict ${auto ? "ok" : "no"}">
      <h3>${auto ? "맞았어요" : "다시 확인해 봐요"}</h3>
      <div>내 답: ${rich(given)}</div><div><b>정답: ${rich(n.correctAnswer)}</b></div>
      ${n.explanation ? `<details class="exp" ${auto ? "" : "open"}><summary>풀이 보기</summary><p>${rich(n.explanation)}</p></details>` : ""}
    </div>
    <p class="muted small">${auto ? "" : "답을 다르게 썼을 뿐 같은 답이면 '맞았어'를 눌러 주세요."}</p>`;
  $("#retryBtns").innerHTML = `<button class="btn primary" data-res="1">맞았어</button><button class="btn red" data-res="0">틀렸어</button>`;
  $("#retryBtns").querySelector(`[data-res="${auto ? 1 : 0}"]`).focus();
  $("#retryBtns").querySelectorAll("[data-res]").forEach((b) => (b.onclick = () => finishOne(n, b.dataset.res === "1")));
  typeset($("#verdict"));
}

async function finishOne(n, ok) {
  const r = state.retry;
  if (ok) r.right++;
  const data = solvedData(n, ok);
  try { await patchNote(n.id, data); } catch (e) { toast("기록하지 못했어요: " + (e.code || e.message)); }
  if (ok && data.status === "mastered") toast("두 번 연속 맞혀서 익힘이 됐어요");
  r.i++; renderRetry();
}

// ───────── PDF 뽑기 ─────────
function printPool() {
  return filtered({ subject: $("#pSubject").value || "all", status: $("#pStatus").value, similar: $("#pSimilar").checked, year: $("#pYear").value || "all" });
}
function updatePrintAvail() {
  fillYearSelect($("#pYear"));
  const cur = $("#pSubject").value || "all"; fillSubjectSelect($("#pSubject"));
  $("#pSubject").value = [...$("#pSubject").options].some((o) => o.value === cur) ? cur : "all";
  $("#pAvail").textContent = `넣을 수 있는 문제: ${printPool().length}개`;
}
["#pYear", "#pSubject", "#pStatus", "#pSimilar"].forEach((s) => ($(s).onchange = updatePrintAvail));

$("#btnPrint").onclick = () => {
  let list = printPool();
  if (!list.length) { toast("넣을 문제가 없어요"); return; }
  if ($("#pShuffle").checked) list = shuffle(list);
  list = list.slice(0, +$("#pCount").value);
  const space = $("#pSpace").value, title = $("#pTitle").value.trim() || "오답 다시 풀기";
  const subj = ($("#pYear").value === "all" ? "" : $("#pYear").value + "학년도 ") + ($("#pSubject").value === "all" ? "여러 과목" : $("#pSubject").value);
  const d = new Date(), today = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  const items = list.map((n, i) => `<div class="p-item"><div><span class="p-num">${i + 1}.</span>${rich(n.question)}</div>
      ${n.figure ? `<img class="fig" src="${n.figure}">` : ""}
      ${n.choices && n.choices.length ? `<ul>${n.choices.map((c, j) => `<li>${CIRCLED[j]} ${rich(c)}</li>`).join("")}</ul>` : ""}
      <div class="space-${space}"></div></div>`).join("");
  const answers = $("#pAnswers").checked ? `<div class="p-answers"><h2>정답과 풀이</h2>
      ${list.map((n, i) => `<div class="p-ans"><b>${i + 1}. ${rich(n.correctAnswer)}</b>${n.explanation ? `<div>${rich(n.explanation)}</div>` : ""}</div>`).join("")}</div>` : "";
  $("#printArea").innerHTML = `<div class="p-head"><div><div class="p-brand">${esc(NAME)}</div><h1>${esc(title)}</h1></div>
      <div class="p-meta">${esc(subj)} · ${list.length}문제 · ${today}<br>이름: ________________</div></div>
      <div class="p-cols">${items}</div>${answers}<div class="p-foot">${esc(NAME)}${SUB ? " · " + esc(SUB) : ""}</div>`;
  typeset($("#printArea"));
  const imgs = [...$("#printArea").querySelectorAll("img")];
  Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))).then(() => setTimeout(() => window.print(), 300));
};
