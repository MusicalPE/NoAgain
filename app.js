// 주또싫 (오답노트) — 음악적체육인
import { FIREBASE_CONFIG, RECAPTCHA_SITE_KEY, AI_MODELS, SUBJECTS, SIMILAR_COUNT, APP_NAME, APP_SUBTITLE } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc, query, orderBy, where, arrayUnion, arrayRemove, writeBatch }
  from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
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

// ───────── 파이어베이스 ─────────
if (!FIREBASE_CONFIG.apiKey) {
  $("#view-setup").classList.remove("hidden");
  throw new Error("config.js 가 비어 있습니다");
}
const app = initializeApp(FIREBASE_CONFIG);
if (["localhost", "127.0.0.1"].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
if (RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const auth = getAuth(app);
const db = getFirestore(app);
const ai = getAI(app, { backend: new GoogleAIBackend() });
const notesCol = () => collection(db, "notebooks", state.nb.id, "notes");

// ───────── AI 부르기 ─────────
function parseJSON(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch (_) {
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("AI 답을 읽지 못했어요");
  }
}
async function askAI(parts, temperature = 0.2) {
  let lastErr;
  for (const name of AI_MODELS) {
    try {
      const model = getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: "application/json", temperature } });
      const res = await model.generateContent(parts);
      return parseJSON(res.response.text());
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (!/not found|404|not supported|unsupported|is not available|invalid model/i.test(msg)) break;
    }
  }
  throw lastErr;
}
function aiErrorText(e) {
  const m = String(e?.message || e);
  if (/app.?check|attestation|recaptcha/i.test(m)) return "App Check 설정을 확인해 주세요 (설치안내.txt 5단계)";
  if (/quota|429|exhausted|rate/i.test(m)) return "AI 사용량이 잠깐 넘쳤어요. 1~2분 뒤 다시 해 보세요";
  if (/api.*not.*enabled|403|permission/i.test(m)) return "AI Logic 이 켜져 있는지 확인해 주세요 (설치안내.txt 4단계)";
  return "AI가 답하지 못했어요: " + m.slice(0, 120);
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

// ───────── 문제 카드 ─────────
function choicesHTML(choices) {
  if (!choices || !choices.length) return "";
  return `<ul class="choices">${choices.map((c, i) => `<li>${/^[①-⑩]/.test(c) ? "" : CIRCLED[i] + " "}${rich(c)}</li>`).join("")}</ul>`;
}
function noteCard(n) {
  const parent = n.parentId ? state.notes.find((x) => x.id === n.parentId) : null;
  return `<article class="note" data-id="${n.id}">
    <div class="note-head">
      <span class="tag subj">${esc(n.subject)}</span>
      ${n.unit ? `<span class="tag">${esc(n.unit)}</span>` : ""}
      ${n.type ? `<span class="tag">${esc(n.type)}</span>` : ""}
      ${n.source === "ai" ? `<span class="tag ai">비슷한 문제</span>` : ""}
      ${n.status === "mastered" ? `<span class="tag ok">익힘</span>` : `<span class="tag wrong">${n.wrongCount ? `틀림 ${n.wrongCount}번` : "연습할 문제"}</span>`}
      <span class="muted small" style="margin-left:auto">${(state.nb.members || []).length > 1 && n.addedByName ? esc(n.addedByName) + " · " : ""}${fmtDate(n.createdAt)}</span>
    </div>
    <div class="q">${rich(n.question)}</div>
    ${n.figure ? `<img class="fig" src="${n.figure}" alt="문제 그림">` : ""}
    ${choicesHTML(n.choices)}
    <div class="ans">
      ${n.myAnswer ? `<div class="mine">내 답: ${rich(n.myAnswer)}</div>` : ""}
      <div class="right">정답: ${rich(n.correctAnswer || "(없음)")}${n.answerFromAI ? ` <span class="muted small">(AI가 푼 답)</span>` : ""}</div>
    </div>
    ${n.wrongReason || n.explanation ? `<details class="exp"><summary>틀린 이유와 풀이</summary>
      ${n.wrongReason ? `<p><b>틀린 이유</b><br>${rich(n.wrongReason)}</p>` : ""}
      ${n.explanation ? `<p><b>풀이</b><br>${rich(n.explanation)}</p>` : ""}</details>` : ""}
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
function renderStats() {
  const wrong = state.notes.filter((n) => n.status !== "mastered").length;
  const done = state.notes.length - wrong;
  const bySub = {};
  state.notes.forEach((n) => { if (n.status !== "mastered") bySub[n.subject] = (bySub[n.subject] || 0) + 1; });
  $("#stats").innerHTML = `<div class="stat red"><b>${wrong}</b>아직 틀림</div><div class="stat green"><b>${done}</b>익힘</div>` +
    Object.entries(bySub).map(([s, c]) => `<div class="stat"><b>${c}</b>${esc(s)}</div>`).join("");
}
function filtered({ subject, status, similar, search = "" }) {
  const q = search.trim().toLowerCase();
  return state.notes.filter((n) =>
    (subject === "all" || n.subject === subject) &&
    (status === "all" || (status === "mastered" ? n.status === "mastered" : n.status !== "mastered")) &&
    (similar || n.source !== "ai") &&
    (!q || [n.question, n.unit, n.type].join(" ").toLowerCase().includes(q)));
}
function renderList() {
  renderStats();
  const cur = $("#fSubject").value || "all";
  fillSubjectSelect($("#fSubject")); $("#fSubject").value = [...$("#fSubject").options].some((o) => o.value === cur) ? cur : "all";
  const list = filtered({ subject: $("#fSubject").value, status: $("#fStatus").value, similar: $("#fSimilar").checked, search: $("#fSearch").value });
  const box = $("#noteList");
  if (!state.notes.length) { box.innerHTML = `<div class="empty">아직 모은 오답이 없어요.<br>아래 "찍기"에서 틀린 문제를 찍어 올려 보세요.</div>`; return; }
  box.innerHTML = list.length ? list.map(noteCard).join("") : `<div class="empty">조건에 맞는 문제가 없어요.</div>`;
  typeset(box);
}
["#fSubject", "#fStatus", "#fSimilar"].forEach((s) => ($(s).onchange = renderList));
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
  } else if (act === "similar") {
    busy(true, "비슷한 문제를 만드는 중");
    try { const made = await makeSimilar(n, SIMILAR_COUNT); toast(`비슷한 문제 ${made}개를 만들었어요`); renderList(); }
    catch (err) { toast(aiErrorText(err), 4000); }
    busy(false);
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
    if ($("#mDropFig")?.checked) data.figure = "";
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
      ${isOwner ? `<button class="btn ghost" id="sNew">새 노트 만들기</button>` : `<button class="btn ghost" id="sLeave">이 노트에서 나가기</button>`}
      <button class="btn ghost" id="sClose">닫기</button>
    </div>`);
  $("#sClose").onclick = closeModal;
  $("#sOut").onclick = async () => { closeModal(); state.notes = []; state.retry = null; state.nb = null; await signOut(auth); };
  $("#sInvite").onclick = () => openInvite();
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
    state.photo = { canvas: imageToCanvas(img, 2000) };
    $("#photoImg").src = state.photo.canvas.toDataURL("image/jpeg", 0.85);
    $("#photoPreview").classList.remove("hidden");
    $("#recogResult").innerHTML = ""; state.recog = [];
  } catch (_) { toast("사진을 열지 못했어요"); }
}
$("#inCamera").onchange = (e) => { onPhoto(e.target.files[0]); e.target.value = ""; };
$("#inGallery").onchange = (e) => { onPhoto(e.target.files[0]); e.target.value = ""; };
$("#btnClearPhoto").onclick = () => { state.photo = null; state.recog = []; $("#photoPreview").classList.add("hidden"); $("#recogResult").innerHTML = ""; };

function recognizePrompt() {
  return `너는 학생의 오답노트를 정리해 주는 친절한 선생님이다. 사진은 학생이 푼 시험지·문제집·학습지다.
학생 학년: ${grade() || "모름(사진을 보고 짐작)"}
할 일
1. 사진 속 문제를 하나하나 찾는다. 잘려서 다 보이지 않는 문제는 빼고, 온전히 보이는 문제만 정리한다.
2. 채점 표시(빗금, X표, 빨간 줄, 세모)가 있으면 그것으로 틀린 문제를 판단한다. 동그라미는 맞은 문제다. 채점 표시가 없으면 학생 답과 정답을 비교해 판단한다.
3. 정답이 사진에 없으면 직접 풀어서 정답을 쓰고 answerFromAI 를 true 로 한다.
4. 수식은 LaTeX 로 쓰고 $...$ 로 감싼다(예: $\\frac{3}{4}+\\frac{1}{8}$). 수식이 아닌 글은 그대로 쓴다.
5. 보기(①②③…)는 question 에 넣지 말고 choices 배열에 앞 번호 없이 넣는다. 정답이 보기 중 하나면 correctAnswer 는 "③" 처럼 번호로 쓴다.
6. 문제에 그림·도형·그래프·표·지도처럼 글로 옮기기 어려운 부분이 있으면 hasFigure 를 true 로 하고, 그 부분이 사진 어디에 있는지 figureBox 에 [ymin, xmin, ymax, xmax] (사진 전체를 0~1000 으로 본 비율)로 적는다. 글로 옮길 수 있는 짧은 표는 question 안에 글로 적는다.
7. wrongReason 은 학생 답을 보고 왜 틀렸을지 학생 눈높이로 한두 문장, explanation 은 학생 눈높이의 단계별 풀이로 쓴다.
8. subject 는 다음 중 하나: ${SUBJECTS.join(", ")}

아래 JSON 하나만 출력한다.
{"problems":[{"number":"문제 번호","subject":"과목","unit":"단원(짐작)","type":"문제 유형(짧게)","question":"문제 글","choices":[],"myAnswer":"학생이 쓴 답, 없으면 빈 문자열","correctAnswer":"정답","answerFromAI":false,"isWrong":true,"wrongReason":"","explanation":"","hasFigure":false,"figureBox":[]}]}`;
}

$("#btnRecognize").onclick = async () => {
  if (!state.photo) return;
  busy(true, "사진 속 문제를 읽는 중 (10~30초)");
  try {
    const b64 = state.photo.canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    const out = await askAI([recognizePrompt(), { inlineData: { data: b64, mimeType: "image/jpeg" } }]);
    const probs = Array.isArray(out.problems) ? out.problems : [];
    state.recog = probs.map((p) => ({
      ...p,
      subject: SUBJECTS.includes(p.subject) ? p.subject : "기타",
      choices: Array.isArray(p.choices) ? p.choices.map(String) : [],
      figure: p.hasFigure ? cropToDataURL(state.photo.canvas, p.figureBox) : "",
      keep: p.isWrong !== false
    }));
    renderRecog();
    if (!probs.length) toast("문제를 찾지 못했어요. 더 가까이, 밝게 찍어 보세요", 3500);
  } catch (e) { toast(aiErrorText(e), 4500); }
  busy(false);
};

function renderRecog() {
  const box = $("#recogResult");
  if (!state.recog.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<p class="muted">문제 ${state.recog.length}개를 찾았어요. 틀린 문제에는 미리 체크해 두었어요. 내용을 확인하고 고칠 곳은 고쳐 주세요.</p>` +
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
  busy(true, "저장하는 중");
  let saved = 0, made = 0, aiFail = null;
  try {
    for (const p of picks) {
      const note = await addNote({
        subject: p.subject, unit: p.unit || "", type: p.type || "", question: p.question, choices: p.choices || [],
        myAnswer: p.myAnswer || "", correctAnswer: p.correctAnswer || "", answerFromAI: !!p.answerFromAI,
        wrongReason: p.wrongReason || "", explanation: p.explanation || "", figure: p.figure || "", source: "photo",
        status: p.isWrong === false ? "mastered" : "wrong", wrongCount: p.isWrong === false ? 0 : 1
      });
      saved++;
      if (withSimilar && !aiFail) {
        busy(true, `비슷한 문제를 만드는 중 (${saved}/${picks.length})`);
        try { made += await makeSimilar(note, SIMILAR_COUNT); } catch (e) { aiFail = e; }
      }
    }
    toast(`${saved}문제를 저장했어요` + (made ? `, 비슷한 문제 ${made}개도 만들었어요` : ""), 3000);
    if (aiFail) setTimeout(() => toast(aiErrorText(aiFail), 4500), 3100);
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
- 그림이 꼭 있어야 풀 수 있는 문제는 만들지 않는다. 필요한 정보는 글이나 수치로 설명한다.
- 원래 문제가 객관식이면 보기 4~5개짜리 객관식으로, 아니면 주관식으로 만든다. 보기는 choices 배열에 번호 없이 넣고, 정답은 "②"처럼 번호로 쓴다.
- 만든 뒤 직접 풀어 보고 정답이 하나로 딱 정해지는지 확인한다. 애매하면 문제를 고친다.
- 수식은 LaTeX 로 쓰고 $...$ 로 감싼다.
- explanation 은 학생 눈높이의 단계별 풀이.

원래 문제
과목: ${n.subject} / 단원: ${n.unit} / 유형: ${n.type}
문제: ${n.question}
보기: ${(n.choices || []).join(" | ") || "없음"}
정답: ${n.correctAnswer}
${n.figure ? "(원래 문제에는 함께 보낸 그림이 있다)" : ""}

아래 JSON 하나만 출력한다.
{"problems":[{"question":"","choices":[],"correctAnswer":"","explanation":""}]}`;
  const parts = [prompt];
  if (n.figure) parts.push({ inlineData: { data: n.figure.split(",")[1], mimeType: "image/jpeg" } });
  const out = await askAI(parts, 0.7);
  const probs = (Array.isArray(out.problems) ? out.problems : []).filter((p) => p && p.question).slice(0, count);
  for (const p of probs) {
    await addNote({
      subject: n.subject, unit: n.unit, type: n.type, question: String(p.question),
      choices: Array.isArray(p.choices) ? p.choices.map(String) : [], correctAnswer: String(p.correctAnswer ?? ""),
      answerFromAI: true, explanation: String(p.explanation ?? ""), source: "ai", parentId: n.id, wrongCount: 0, status: "wrong"
    });
  }
  return probs.length;
}

// ───────── 다시 풀기 ─────────
function retryPool() {
  return filtered({ subject: $("#rSubject").value || "all", status: $("#rMastered").checked ? "all" : "wrong", similar: $("#rSimilar").checked });
}
function updateRetryAvail() {
  const cur = $("#rSubject").value || "all"; fillSubjectSelect($("#rSubject"));
  $("#rSubject").value = [...$("#rSubject").options].some((o) => o.value === cur) ? cur : "all";
  $("#rAvail").textContent = `풀 수 있는 문제: ${retryPool().length}개`;
}
["#rSubject", "#rSimilar", "#rMastered"].forEach((s) => ($(s).onchange = updateRetryAvail));

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
      <span class="tag subj">${esc(n.subject)}</span>${n.type ? `<span class="tag">${esc(n.type)}</span>` : ""}
      ${n.source === "ai" ? `<span class="tag ai">비슷한 문제</span>` : ""}</div>
    <div class="q">${rich(n.question)}</div>
    ${n.figure ? `<img class="fig" src="${n.figure}">` : ""}
    ${hasChoices
      ? `<div class="choice-btns">${n.choices.map((c, i) => `<button data-ch="${i}">${CIRCLED[i]} ${rich(c)}</button>`).join("")}</div>`
      : `<input class="answer-in" id="ansIn" placeholder="답을 써 주세요" autocomplete="off">`}
    <div id="verdict"></div>
    <div class="row" style="margin-top:12px" id="retryBtns">
      <button class="btn primary" id="btnCheck">확인</button>
      <button class="btn ghost" id="btnQuit">그만하기</button>
    </div>
  </div>`;
  typeset(box);
  r.answer = ""; r.checked = false; r.choiceIdx = -1;
  box.querySelectorAll("[data-ch]").forEach((b) => (b.onclick = () => {
    if (r.checked) return;
    box.querySelectorAll("[data-ch]").forEach((x) => x.classList.remove("sel")); b.classList.add("sel");
    r.choiceIdx = +b.dataset.ch; r.answer = CIRCLED[r.choiceIdx];
  }));
  const inp = $("#ansIn"); if (inp) { inp.focus(); inp.onkeydown = (e) => { if (e.key === "Enter" && !r.checked) $("#btnCheck").click(); }; }
  $("#btnQuit").onclick = () => { state.retry = null; show("retry"); };
  $("#btnCheck").onclick = () => checkAnswer(n);
}

function checkAnswer(n) {
  const r = state.retry;
  if (!$("#ansIn") && r.choiceIdx < 0) { toast("답을 골라 주세요"); return; }
  const given = $("#ansIn") ? $("#ansIn").value.trim() : r.answer;
  if (!given) { toast("답을 써 주세요"); return; }
  r.checked = true;
  const right = normAnswer(n.correctAnswer);
  const cands = [given];
  if (r.choiceIdx >= 0) { cands.push(String(r.choiceIdx + 1), n.choices[r.choiceIdx]); }
  const auto = !!right && cands.some((c) => normAnswer(c) === right);
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
  const data = { tryCount: (n.tryCount || 0) + 1, lastTriedAt: Date.now() };
  if (ok) {
    r.right++;
    data.correctStreak = (n.correctStreak || 0) + 1;
    if (data.correctStreak >= 2) data.status = "mastered";
  } else {
    data.correctStreak = 0; data.status = "wrong"; data.wrongCount = (n.wrongCount || 0) + 1;
  }
  try { await patchNote(n.id, data); } catch (e) { toast("기록하지 못했어요: " + (e.code || e.message)); }
  if (ok && data.status === "mastered") toast("두 번 연속 맞혀서 익힘이 됐어요");
  r.i++; renderRetry();
}

// ───────── PDF 뽑기 ─────────
function printPool() {
  return filtered({ subject: $("#pSubject").value || "all", status: $("#pStatus").value, similar: $("#pSimilar").checked });
}
function updatePrintAvail() {
  const cur = $("#pSubject").value || "all"; fillSubjectSelect($("#pSubject"));
  $("#pSubject").value = [...$("#pSubject").options].some((o) => o.value === cur) ? cur : "all";
  $("#pAvail").textContent = `넣을 수 있는 문제: ${printPool().length}개`;
}
["#pSubject", "#pStatus", "#pSimilar"].forEach((s) => ($(s).onchange = updatePrintAvail));

$("#btnPrint").onclick = () => {
  let list = printPool();
  if (!list.length) { toast("넣을 문제가 없어요"); return; }
  if ($("#pShuffle").checked) list = shuffle(list);
  list = list.slice(0, +$("#pCount").value);
  const space = $("#pSpace").value, title = $("#pTitle").value.trim() || "오답 다시 풀기";
  const subj = $("#pSubject").value === "all" ? "여러 과목" : $("#pSubject").value;
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
