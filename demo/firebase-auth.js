// 미리보기(?demo)용: 지어낸 가족 한 사람으로 바로 들어옴
import { DEMO_USER } from "./seed.js";
export class GoogleAuthProvider { setCustomParameters() {} addScope() {} }
const auth = { currentUser: null, demo: true };
let cbs = [];
export function getAuth() { return auth; }
export function onAuthStateChanged(a, cb) {
  cbs.push(cb);
  setTimeout(() => { auth.currentUser = DEMO_USER; cb(DEMO_USER); }, 0);
  return () => { cbs = cbs.filter((x) => x !== cb); };
}
export async function signInWithPopup() { return { user: DEMO_USER }; }
export async function signInWithRedirect() {}
export async function getRedirectResult() { return null; }
// 미리보기에서 로그아웃하면 진짜 또싫 첫 화면으로
export async function signOut() { location.href = location.pathname; }
