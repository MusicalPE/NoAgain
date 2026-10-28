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
export const RECAPTCHA_SITE_KEY = "";

// 3) 사용할 AI 모델 이름 (앞에서부터 차례로 시도)
//    콘솔 AI Logic 화면에서 쓸 수 있는 모델 이름을 확인해 맨 앞에 두면 됩니다.
export const AI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];

// 앱 이름 (화면 위쪽과 시험지에 나옵니다)
export const APP_NAME = "주또싫";
export const APP_SUBTITLE = "주원이는 또 틀리기 싫어요";

// 과목 목록 (원하는 대로 바꿔도 됩니다)
export const SUBJECTS = ["국어", "수학", "영어", "사회", "과학", "역사", "도덕", "기타"];

// 비슷한 문제를 한 번에 몇 개 만들지
export const SIMILAR_COUNT = 2;
