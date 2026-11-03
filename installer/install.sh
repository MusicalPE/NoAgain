#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  오답노트 "또싫" 설치 도우미 — 만든 사람: 음악적체육인
#  Google Cloud Shell 에서 실행합니다. (구글 계정만 있으면 됩니다)
#
#    처음 설치  : bash installer/install.sh
#    새 판으로  : bash installer/install.sh update
#
#  하는 일: 내 구글 계정에 새 파이어베이스 프로젝트를 만들고,
#  데이터베이스·규칙·사이트 키·App Check 를 설정한 뒤
#  앱을 https://프로젝트이름.web.app 주소에 올립니다.
# ─────────────────────────────────────────────────────────────
set -uo pipefail
export LANG="${LANG:-C.UTF-8}" LC_ALL="${LC_ALL:-C.UTF-8}" PYTHONIOENCODING=utf-8

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$HOME/.ttosil_install"
MODE="${1:-install}"
FB="npx -y firebase-tools"

c_title() { printf "\n\033[1;35m━━ %s ━━\033[0m\n" "$*"; }
say()     { printf "\033[1;36m▶\033[0m %s\n" "$*"; }
ok()      { printf "\033[1;32m✔\033[0m %s\n" "$*"; }
warn()    { printf "\033[1;33m!\033[0m %s\n" "$*"; }
die()     { printf "\n\033[1;31m✖ %s\033[0m\n" "$*"; echo "   화면을 캡처해서 만든 사람에게 보내 주세요."; exit 1; }
pause()   { echo; read -r -p "   ↳ 다 했으면 Enter 를 눌러 주세요 " _; }
token()   { gcloud auth print-access-token 2>/dev/null; }
jget()    { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

# 구글 API 부르기:  api 방법 주소 [보낼JSON]
api() {
  local method="$1" url="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$url" -H "Authorization: Bearer $(token)" -H "x-goog-user-project: $PROJECT" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$url" -H "Authorization: Bearer $(token)" -H "x-goog-user-project: $PROJECT"
  fi
}
# 파이어베이스 작업이 끝날 때까지 기다리기 → 결과(response) JSON 출력
wait_op() {
  local name="$1" r
  for _ in $(seq 1 60); do
    r=$(api GET "https://firebase.googleapis.com/v1beta1/$name")
    if echo "$r" | grep -q '"done": *true'; then echo "$r"; return 0; fi
    sleep 3
  done
  echo "$r"; return 1
}

c_title "또싫 오답노트 설치 도우미"
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
[ -n "$ACCOUNT" ] || die "구글 계정 로그인이 확인되지 않아요. Cloud Shell 을 다시 열어 주세요."
say "구글 계정: $ACCOUNT"

# ───────────────────────── 새 판으로 바꾸기 ─────────────────────────
if [ "$MODE" = "update" ]; then
  if [ -f "$STATE" ]; then . "$STATE"; fi
  if [ -z "${PROJECT:-}" ]; then
    say "내 프로젝트 목록:"; gcloud projects list --format="value(projectId)" | grep -i "ttosil" || true
    read -r -p "   ↳ 바꿀 프로젝트 이름(ttosil-로 시작)을 적어 주세요: " PROJECT
  fi
  [ -n "${SITE_KEY:-}" ] && [ -n "${APP_ID:-}" ] || {
    say "설정값을 다시 읽어 오는 중"
    APP_ID=$(api GET "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps" | jget "['apps'][0]['appId']")
    SITE_KEY=$(gcloud recaptcha keys list --project "$PROJECT" --format="value(name)" 2>/dev/null | head -1 | sed 's#.*/##')
    [ -n "$SITE_KEY" ] || read -r -p "   ↳ 사이트 키(6L...)를 적어 주세요: " SITE_KEY
  }
  if [ -z "${APP_NAME:-}" ]; then
    read -r -p "   ↳ 앱 이름 (Enter 만 누르면 '또싫'): " APP_NAME; APP_NAME="${APP_NAME:-또싫}"
    read -r -p "   ↳ 긴 이름 (Enter 만 누르면 '또 틀리기 싫어요'): " APP_SUB; APP_SUB="${APP_SUB:-또 틀리기 싫어요}"
  fi
else
# ───────────────────────── 처음 설치 ─────────────────────────
  c_title "1. 앱 이름 정하기"
  echo "   예) 아이 이름이 지민이면  짧은 이름: 지또싫 / 긴 이름: 지민이는 또 틀리기 싫어요"
  read -r -p "   ↳ 아이 이름 (예: 지민, 비워 두면 기본 이름): " KID
  if [ -n "$KID" ]; then
    FIRST=$(KID="$KID" python3 -c 'import os; print(os.environ["KID"][:1])')
    APP_NAME="${FIRST}또싫"; APP_SUB="${KID}이는 또 틀리기 싫어요"
    read -r -p "   ↳ 짧은 이름 [$APP_NAME]: " t; APP_NAME="${t:-$APP_NAME}"
    read -r -p "   ↳ 긴 이름 [$APP_SUB]: " t; APP_SUB="${t:-$APP_SUB}"
  else
    APP_NAME="또싫"; APP_SUB="또 틀리기 싫어요"
  fi
  ok "앱 이름: $APP_NAME ($APP_SUB)"

  c_title "2. 내 파이어베이스 프로젝트 만들기"
  PROJECT="ttosil-$(tr -dc 'a-z0-9' </dev/urandom | head -c 6)"
  say "프로젝트 이름: $PROJECT"
  if ! ERR=$(gcloud projects create "$PROJECT" --name="ttosil" 2>&1); then
    echo "$ERR" | tail -5
    if echo "$ERR" | grep -qi "quota\|limit\|exceeded"; then
      die "만들 수 있는 프로젝트 수를 다 써서 새 프로젝트를 못 만들어요. 안 쓰는 프로젝트를 지우거나(https://console.cloud.google.com/cloud-resource-manager) 다른 구글 계정으로 해 주세요."
    elif echo "$ERR" | grep -qi "terms\|tos"; then
      die "구글 클라우드 약관 동의가 필요해요. https://console.cloud.google.com 에 들어가 동의한 뒤 다시 실행해 주세요."
    else
      die "프로젝트를 만들지 못했어요. 위 영어 문구를 함께 캡처해 주세요."
    fi
  fi
  gcloud config set project "$PROJECT" >/dev/null 2>&1
  ok "프로젝트를 만들었어요"

  say "필요한 기능 켜는 중 (1~2분)"
  gcloud services enable firebase.googleapis.com firestore.googleapis.com firebaserules.googleapis.com \
    firebasehosting.googleapis.com identitytoolkit.googleapis.com firebaseappcheck.googleapis.com \
    recaptchaenterprise.googleapis.com firebasevertexai.googleapis.com generativelanguage.googleapis.com \
    --project "$PROJECT" >/tmp/ttosil_enable.log 2>&1 || { tail -5 /tmp/ttosil_enable.log; die "기능을 켜지 못했어요. 위 영어 문구를 함께 캡처해 주세요."; }
  ok "기능을 켰어요"

  say "파이어베이스 연결 중"
  for try in 1 2 3; do
    R=$(api POST "https://firebase.googleapis.com/v1beta1/projects/$PROJECT:addFirebase" '{}')
    OPN=$(echo "$R" | jget "['name']")
    if [ -n "$OPN" ]; then wait_op "$OPN" >/dev/null && break; fi
    if echo "$R" | grep -qi "terms\|tos\|PERMISSION_DENIED"; then
      warn "파이어베이스 약관 동의가 한 번 필요해요."
      echo "   아래 주소를 열어 약관에 동의만 하고(프로젝트는 만들지 않아도 돼요) 돌아와 주세요."
      echo "   https://console.firebase.google.com/"
      pause
    else
      echo "$R" | head -c 400; echo; sleep 5
    fi
    [ "$try" = 3 ] && die "파이어베이스를 연결하지 못했어요."
  done
  ok "파이어베이스를 연결했어요"

  say "웹 앱 등록 중"
  R=$(api POST "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps" "{\"displayName\":\"$APP_NAME\"}")
  OPN=$(echo "$R" | jget "['name']"); [ -n "$OPN" ] || die "웹 앱을 등록하지 못했어요: $(echo "$R" | head -c 300)"
  APP_ID=$(wait_op "$OPN" | jget "['response']['appId']")
  [ -n "$APP_ID" ] || die "웹 앱 번호를 받지 못했어요."
  ok "웹 앱을 등록했어요"

  c_title "3. 데이터베이스 만들기"
  gcloud firestore databases create --location=asia-northeast3 --project "$PROJECT" >/dev/null 2>&1 \
    && ok "데이터베이스를 만들었어요 (서울)" || warn "데이터베이스가 이미 있거나 만들지 못했어요. 아래에서 다시 확인해요."

  c_title "4. 사이트 키와 App Check (AI 보호)"
  KEYNAME=$(gcloud recaptcha keys create --project "$PROJECT" --display-name="ttosil" --web \
    --domains="$PROJECT.web.app,$PROJECT.firebaseapp.com" --integration-type=score --format="value(name)" 2>/dev/null)
  SITE_KEY="${KEYNAME##*/}"
  [ -n "$SITE_KEY" ] || die "사이트 키를 만들지 못했어요."
  ok "사이트 키: $SITE_KEY"
  PNUM=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)" 2>/dev/null)
  APPCHECK_OK=""
  for try in 1 2 3 4 5; do
    R=$(api PATCH "https://firebaseappcheck.googleapis.com/v1/projects/${PNUM:-$PROJECT}/apps/$APP_ID/recaptchaEnterpriseConfig?updateMask=siteKey" \
        "{\"siteKey\":\"$SITE_KEY\"}")
    if echo "$R" | grep -q "$SITE_KEY"; then APPCHECK_OK=1; break; fi
    [ "$try" = 1 ] && say "방금 켠 기능이 자리 잡을 때까지 잠깐 기다리는 중 (최대 1분)"
    sleep 15
  done
  if [ -n "$APPCHECK_OK" ]; then ok "App Check 에 등록했어요"; else
    warn "App Check 는 직접 등록해 주셔야 해요 (1분이면 돼요)"
    echo "   https://console.firebase.google.com/project/$PROJECT/appcheck/apps"
    echo "   앱 줄의 [등록] > \"Fraud Defense(이전 명칭: reCAPTCHA Enterprise)\" 고르기 > 아래 키 붙여 넣기 > [저장]"
    echo "   붙여 넣을 키:  $SITE_KEY"
    pause
  fi

  c_title "5. 직접 눌러 주셔야 하는 곳 두 군데"
  echo "   구글이 본인이 직접 누르게 해 둔 곳이에요. 주소를 열어 차례로 눌러 주세요."
  echo
  echo "   (1) 구글 로그인 켜기"
  echo "       https://console.firebase.google.com/project/$PROJECT/authentication/providers"
  echo "       [시작하기] > [Google] > 사용 설정 켜기 > 프로젝트 지원 이메일 고르기 > [저장]"
  pause
  echo "   (2) AI 켜기"
  echo "       https://console.firebase.google.com/project/$PROJECT/ailogic"
  echo "       [시작하기] > \"Gemini Developer API\" 고르기 > 끝까지 진행"
  echo "       (중간에 App Check 이야기가 나오면 그대로 진행하면 됩니다. 사이트 키는 이미 등록해 두었어요)"
  pause
fi

# ───────────────────────── 앱 만들어 올리기 (설치·업데이트 공통) ─────────────────────────
c_title "앱을 만들어 올리는 중"
cfg=$(api GET "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps/$APP_ID/config")
echo "$cfg" | grep -q apiKey || die "앱 설정값을 읽지 못했어요: $(echo "$cfg" | head -c 300)"

BUILD="$(mktemp -d)"; SITE="$BUILD/site"; mkdir -p "$SITE"
for f in index.html app.js figure.js sw.js style.css qrcode.js manifest.webmanifest config.js; do
  cp "$ROOT/$f" "$SITE/" || die "$f 파일이 없어요."
done
cp "$ROOT"/installer/icons/*.png "$SITE/"
cp "$ROOT/파이어베이스-규칙.txt" "$BUILD/firestore.rules"

CFG_JSON="$cfg" SITE_KEY="$SITE_KEY" APP_NAME="$APP_NAME" APP_SUB="$APP_SUB" SITE="$SITE" python3 - <<'PY' || exit 1
import json, os, re
site = os.environ["SITE"]
cfg = json.loads(os.environ["CFG_JSON"])
name, sub = os.environ["APP_NAME"], os.environ["APP_SUB"]
keys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]
block = "export const FIREBASE_CONFIG = {\n" + ",\n".join(f'  {k}: {json.dumps(cfg.get(k, ""))}' for k in keys) + "\n};"
p = os.path.join(site, "config.js"); s = open(p, encoding="utf-8").read()
s = re.sub(r"export const FIREBASE_CONFIG = \{.*?\};", lambda m: block, s, flags=re.S)
s = re.sub(r'export const RECAPTCHA_SITE_KEY = "[^"]*";', f'export const RECAPTCHA_SITE_KEY = {json.dumps(os.environ["SITE_KEY"])};', s)
s = re.sub(r'export const APP_NAME = "[^"]*";', f"export const APP_NAME = {json.dumps(name, ensure_ascii=False)};", s)
s = re.sub(r'export const APP_SUBTITLE = "[^"]*";', f"export const APP_SUBTITLE = {json.dumps(sub, ensure_ascii=False)};", s)
open(p, "w", encoding="utf-8").write(s)
# 화면·홈 화면 이름 바꾸기 (원본 판의 이름이 남지 않게)
for f in ["index.html", "manifest.webmanifest", "app.js", "style.css", "sw.js"]:
    p = os.path.join(site, f); t = open(p, encoding="utf-8").read()
    t = t.replace("주원이는 또 틀리기 싫어요", sub).replace("주또싫", name)
    open(p, "w", encoding="utf-8").write(t)
print("ok")
PY

cat > "$BUILD/firebase.json" <<'JSON'
{
  "hosting": {
    "public": "site",
    "headers": [
      { "source": "**/*.@(html|js|css|webmanifest)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
    ]
  },
  "firestore": { "rules": "firestore.rules" }
}
JSON
echo "{\"projects\":{\"default\":\"$PROJECT\"}}" > "$BUILD/.firebaserc"

cd "$BUILD" || exit 1
say "파이어베이스 도구 준비 중 (처음엔 1분쯤)"
$FB hosting:sites:create "$PROJECT" --project "$PROJECT" --non-interactive >/dev/null 2>&1 || true
if ! $FB deploy --only hosting,firestore:rules --project "$PROJECT" --non-interactive; then
  warn "파이어베이스 도구 로그인이 필요해요. 아래에 나오는 주소를 열어 로그인하고, 받은 코드를 붙여 넣어 주세요."
  $FB login --no-localhost
  $FB deploy --only hosting,firestore:rules --project "$PROJECT" --non-interactive || die "앱을 올리지 못했어요."
fi

# 다음 업데이트 때 쓸 정보 기억해 두기 (이 Cloud Shell 에만 저장)
cat > "$STATE" <<EOF
PROJECT="$PROJECT"
APP_ID="$APP_ID"
SITE_KEY="$SITE_KEY"
APP_NAME="$APP_NAME"
APP_SUB="$APP_SUB"
EOF

c_title "끝났어요"
echo "   내 앱 주소:  https://$PROJECT.web.app"
echo
echo "   - 휴대폰에서 이 주소를 열고 [홈 화면에 추가](안드로이드는 [앱 설치])를 누르면 앱처럼 쓸 수 있어요."
echo "   - 처음 몇 분은 AI 보호(App Check)가 자리 잡는 중이라 사진 읽기가 안 될 수 있어요. 5~10분 뒤 다시 해 보세요."
echo "   - 새 판이 나오면 설치 때 받은 링크를 다시 열고, 오른쪽 안내의 \"새 판으로 바꾸기\" 한 줄을 붙여 넣으면 돼요."
echo
