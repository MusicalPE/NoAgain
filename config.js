// ─────────────────────────────────────────────
//  오답노트 설정 파일
//  설치안내.txt 의 순서대로 아래 값을 채워 넣으세요.
// ─────────────────────────────────────────────

// 1) 파이어베이스 콘솔 > 프로젝트 설정 > 내 앱(웹) 에서 복사한 값
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBpWX2PJeh-PKpHzrMkmyC1iH5jTXuUiX4",
  authDomain: "no--again.firebaseapp.com",
  projectId: "no--again",
  storageBucket: "no--again.firebasestorage.app",
  messagingSenderId: "227540832273",
  appId: "1:227540832273:web:3d5a96170918f505f8a1b0"
};

// 2) App Check(reCAPTCHA Enterprise) 사이트 키
//    AI 기능을 켜면 App Check 가 자동으로 켜지므로 꼭 넣어야 AI가 동작합니다.
export const RECAPTCHA_SITE_KEY = "6LfyygQuAAAAANi6jh6_u3kexVPJN1zu7d_JcOAA";

// 3) 사용할 AI 모델 이름 (앞에서부터 차례로 시도, 붐비거나 안 되면 다음 모델로)
//    AI_MODELS_FAST : 사진 읽기용 — 빠르면서 직접 풀어도 정확한 모델 먼저
//    AI_MODELS      : 비슷한 문제 만들기용 — 정확한 모델 먼저
export const AI_MODELS_FAST = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"];
export const AI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.5-flash-lite"];

// 기본 앱 이름 (노트에 아이 이름을 정하면 "○○이는 또 틀리기 싫어요"로 바뀝니다)
export const APP_NAME = "또싫";
export const APP_SUBTITLE = "또 틀리기 싫어요";

// 과목 목록 (원하는 대로 바꿔도 됩니다)
export const SUBJECTS = ["국어", "수학", "영어", "사회", "과학", "역사", "도덕", "기타"];

// 과목별 띠지 색 (목록에 없는 과목은 회색)
export const SUBJECT_COLORS = {
  "국어": "#3fbf7f", "수학": "#f5a23a", "영어": "#9b6cf2", "사회": "#4f8ef7",
  "과학": "#f06d8a", "역사": "#c0875a", "도덕": "#2bb3b8", "기타": "#9aa3ad"
};

// 비슷한 문제를 한 번에 몇 개 만들지
export const SIMILAR_COUNT = 2;

// 같이 쓰는 앱: 다른 사람은 사진 읽기를 몇 번까지 앱의 AI로 체험하게 할지
//   체험이 끝나면 [설정]에서 자기 Gemini API 키를 넣어 써요.
//   0 이면 모두 앱의 AI를 쓰고, 키 넣는 칸도 보이지 않아요.
export const AI_TRIAL = 3;
// 체험 횟수와 상관없이 앱의 AI를 쓰는 사람(만든 사람)의 이메일을 SHA-256 으로 바꾼 값
//   이 사람이 만든 노트에 초대받은 가족도 키 없이 써요.
export const FREE_OWNERS = ["c8c382c89009b5a22547b0b08fe70e4e7793616baabe579e606048d94304ef2f"];
