# 전체 시험 (기능 수정 때): 화면을 실제로 띄워 새 기능과 기존 기능을 한 번씩 밟아 보기
#   python3 tests/full.py          (먼저 node tests/check.mjs 가 통과해야 함)
# 파이어베이스·AI 는 가짜(시험용)로 바꿔 끼워서, 진짜 노트·AI 사용량은 건드리지 않아요.
# 필요한 것: python 의 playwright (+ chromium)
import asyncio, json, os, sys, traceback
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE = os.path.join(ROOT, 'tests', 'sample.png')

FIRESTORE = r'''
const trialDone = location.search.includes("trialdone");
const store = window.__store = { bank: [], notes: [
 {id:"a",subject:"수학",unit:"분수의 덧셈과 뺄셈",type:"문장제",question:"우체국에서 병원까지 $\frac{13}{5}$ km, 병원에서 동물원까지 $\frac{4}{5}$ km 입니다. 우체국에서 동물원까지는?",choices:[],myAnswer:"3 2/5",correctAnswer:"$3\frac{2}{5}$ km",explanation:"13/5+4/5=17/5",wrongReason:"",figure:"",source:"photo",answerFromAI:true,aiJudged:true,status:"wrong",wrongCount:1,createdAt:Date.parse("2026-10-20"),parentId:""},
 {id:"b",subject:"과학",unit:"식물",type:"개념",question:"식물이 빛을 받아 양분을 만드는 과정은?",choices:["호흡","광합성","증산","발아"],myAnswer:"①",correctAnswer:"②",explanation:"광합성",figure:"",source:"ai",parentId:"a",status:"wrong",wrongCount:0,createdAt:Date.parse("2026-03-05")},
 {id:"c",subject:"국어",unit:"낱말",type:"맞춤법",question:"바르게 쓴 것을 고르세요.",choices:["설겆이","설거지"],myAnswer:"①",correctAnswer:"②",figure:"",source:"photo",status:"wrong",wrongCount:1,createdAt:Date.parse("2026-04-10")}]};
store.nbs = [{id:"nb1",name:"시험 노트",owner:"u1",members:["u1","u2"],names:{u1:"시험",u2:"아이"},grade:location.search.includes("middle")?"중학교 2학년":"초등 4학년",kid:"지민",kidAsked:true,aiTrialUsed:trialDone?3:0,createdAt:1}];
let n = 0;
export const getFirestore=()=>({});export const collection=(...a)=>a.join("/");export const doc=(...a)=>a.join("/");
export const query=(c)=>c;export const orderBy=()=>0;export const where=()=>0;export const limit=()=>0;
export const arrayUnion=(...a)=>({__u:a});export const arrayRemove=(...a)=>({__r:a});
export const writeBatch=()=>({set(){},update(){},delete(){},commit:async()=>{}});
const rows=(l)=>({empty:!l.length,docs:l.map(x=>({id:x.id,data:()=>({...x})}))});
export const getDocs=async(c)=>{ if(/bank$/.test(c)) return rows(store.bank); if(/notebooks$/.test(c)) return rows(store.nbs); if(/users\/u1\/notes/.test(c)) return rows([]); return rows(store.notes); };
export const getDoc=async()=>({exists:()=>false,data:()=>({})});export const setDoc=async()=>{};
export const addDoc=async(c,d)=>{const id="n"+(n++); (/bank$/.test(c)?store.bank:store.notes).push({id,...d}); return {id};};
export const updateDoc=async(p,d)=>{const id=String(p).split("/").pop(); const x=store.notes.find(v=>v.id===id); if(x) Object.assign(x,d);};
export const deleteDoc=async(p)=>{const id=String(p).split("/").pop(); store.notes=store.notes.filter(v=>v.id!==id);};
'''
AI = r'''
export const getAI=()=>({});export class GoogleAIBackend{};
export const getGenerativeModel=(a,o)=>({generateContent:async(parts)=>{const p=String(parts[0]); window.__ai=(window.__ai||0)+1; (window.__prompts=window.__prompts||[]).push(p); let out;
if(p.includes("해답지(정답")) out={answers:[{i:1,found:true,answer:window.__key||"$2\\frac{3}{5}$",explanation:""}]};
else if(p.includes("다른 사람이 쓴 답은 보여 주지 않는다")) out={work:"x",correctAnswer:window.__alt||"$3\\frac{2}{5}$"};
else if(p.includes("연습 문제를 내 주는")) out={skill:"분모가 같은 분수 거리 문장제",problems:[
  {question:"집에서 학교까지 $\\frac{13}{5}$ km, 학교에서 공원까지 $\\frac{4}{5}$ km 입니다. 집에서 공원까지는?",choices:[],explanation:"13/5+4/5=17/5",correctAnswer:"$3\\frac{2}{5}$"},
  {question:"둘째 문제",choices:[],explanation:"x",correctAnswer:"2"}],
  template:{vars:{a:[6,20],b:[1,8],d:[3,9]},when:["b<d","a>d"],question:"집에서 학교까지 {a/d|frac} km, 학교에서 공원까지 {b/d} km 입니다. 집에서 공원까지는?",explanation:"{a/d|frac} + {b/d} = {(a+b)/d|mixed}",answer:"(a+b)/d",format:"mixed",example:{a:13,b:4,d:5}}};
else if(p.includes("problems")) out={rotate:0,problems:[{number:"3",subject:"수학",unit:"분수의 덧셈과 뺄셈",type:"문장제",question:"우체국에서 병원까지 $\\frac{13}{5}$ km 입니다. 몇 km 입니까?",choices:[],myAnswer:"2",studentWork:"",graded:true,isWrong:true,explanation:"$\\frac{13}{5}=2\\frac{3}{5}$",correctAnswer:"$2\\frac{3}{5}$",wrongReason:"분수를 자연수로 썼어요",keyPoint:"",hasFigure:false}]};
else out={explanation:"다시 쓴 풀이",correctAnswer:"$3\\frac{2}{5}$",studentCorrect:true,wrongReason:"",keyPoint:"k",figure:null};
return {response:{text:()=>JSON.stringify(out)}};}});
'''
STUB = {
  'firebase-app.js': 'export const initializeApp=()=>({});',
  'firebase-app-check.js': 'export const initializeAppCheck=()=>({});export class ReCaptchaEnterpriseProvider{};export const getToken=()=>new Promise(()=>{});',
  'firebase-auth.js': 'export const getAuth=()=>({});export class GoogleAuthProvider{};export const signInWithPopup=async()=>{};export const signInWithRedirect=async()=>{};export const signOut=async()=>{};export const onAuthStateChanged=(a,cb)=>setTimeout(()=>cb(location.hash==="#out"?null:{uid:"u1",displayName:"시험",email:"t@example.com"}),50);',
  'firebase-firestore.js': FIRESTORE,
  'firebase-ai.js': AI,
}

results = []
def step(name, ok, detail=''):
  results.append((name, ok, detail))
  print(('  통과  ' if ok else '  실패  ') + name + (f' — {detail}' if detail else ''), flush=True)

async def open_page(b, url, stub=True):
  pg = await b.new_page(viewport={'width': 390, 'height': 844})
  pg.errs = []
  pg.on('pageerror', lambda e: pg.errs.append(str(e)))
  pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
  pg.keyhits = []
  async def route(r):
    u = r.request.url
    if stub and 'gstatic.com/firebasejs' in u:
      for k, v in STUB.items():
        if u.endswith(k): return await r.fulfill(body=v, content_type='application/javascript')
    if 'generativelanguage.googleapis.com' in u:
      pg.keyhits.append(r.request.headers.get('x-goog-api-key'))
      if ':generateContent' in u:
        out = {"explanation": "키로 쓴 풀이", "correctAnswer": "$3\\frac{2}{5}$", "studentCorrect": True, "wrongReason": "", "keyPoint": "", "figure": None}
        return await r.fulfill(body=json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(out)}]}}]}), content_type='application/json', headers={'access-control-allow-origin': '*'})
      return await r.fulfill(body='{"models":[]}', content_type='application/json', headers={'access-control-allow-origin': '*'})
    if u.startswith('http://app/'):
      path = os.path.join(ROOT, u[len('http://app/'):].split('?')[0].split('#')[0])
      if path.endswith('/') or os.path.isdir(path): path = os.path.join(path, 'index.html')
      if not os.path.exists(path): return await r.fulfill(status=404, body='')
      body = open(path, 'rb').read()
      if path.endswith('config.js'): body = body.replace(b'apiKey: ""', b'apiKey: "x"')
      ct = {'js': 'application/javascript', 'mjs': 'application/javascript', 'css': 'text/css', 'html': 'text/html', 'png': 'image/png', 'webmanifest': 'application/json'}.get(path.rsplit('.', 1)[-1], 'application/octet-stream')
      return await r.fulfill(body=body, content_type=ct)
    return await r.abort()  # 바깥 주소(글꼴·KaTeX 등)는 막기
  await pg.route('**/*', route)
  await pg.add_init_script('window.print=()=>{window.__printed=(window.__printed||0)+1}; try{localStorage.clear()}catch(e){}')
  await pg.goto(url); await pg.wait_for_timeout(1800)
  if await pg.is_visible('#kName'):
    await pg.fill('#kName', '지민'); await pg.click('#kOk'); await pg.wait_for_timeout(300)
  return pg

async def safe(name, fn):
  try: await fn()
  except Exception as e: step(name, False, (str(e).splitlines() or ['오류'])[0][:160])

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()

    # 1. 로그인 화면
    async def t1():
      pg = await open_page(b, 'http://app/#out')
      step('로그인 화면', await pg.is_visible('#btnLogin'))
      await pg.close()
    await safe('로그인 화면', t1)

    pg = await open_page(b, 'http://app/')
    S = lambda js: pg.evaluate(js)

    # 2. 목록
    async def t2():
      cnt = await pg.locator('.note').count()
      stats = await pg.locator('#stats').inner_text()
      step('로그인 뒤 오답 목록·통계', cnt >= 3 and '전체' in stats, f'문제 {cnt}개')
    await safe('로그인 뒤 오답 목록·통계', t2)

    # 3. 설정 열고 닫기
    async def t3():
      await pg.click('#btnSettings'); await pg.wait_for_timeout(300)
      txt = await pg.inner_text('#modalBox'); await pg.click('#sClose'); await pg.wait_for_timeout(200)
      step('설정 열기·닫기 (판 번호 표시)', '판 ' in txt and not await pg.is_visible('#sClose'))
    await safe('설정 열기·닫기', t3)

    # 4. 사진 읽기 → 보기 → 고치기 → 저장
    async def t4():
      before = await S('window.__store.notes.length')
      await pg.click('#tabs [data-view=capture]'); await pg.wait_for_timeout(300)
      await pg.set_input_files('#inGallery', SAMPLE); await pg.wait_for_timeout(1500)
      await pg.click('#btnRecognize'); await pg.wait_for_timeout(3500)
      view = await pg.inner_text('.recog [data-view]')
      step('사진 읽기 → 결과 보기', '우체국' in view and '정답' in view)
      await pg.click('.recog-edit summary'); await pg.fill('.recog [name=unit]', '분수(고침)'); await pg.wait_for_timeout(500)
      await pg.click('#btnSaveRecog'); await pg.wait_for_timeout(2500)
      after = await S('window.__store.notes.filter(x=>x.source==="photo" && x.unit==="분수(고침)").length')
      step('고친 내용으로 저장', after == 1, f'노트 {before}→{await S("window.__store.notes.length")}')
    await safe('사진 읽기·저장', t4)

    # 7. 비슷한 문제: 처음엔 AI + 은행 저장, 두 번째는 은행에서 (AI 안 부름)
    async def t7():
      await pg.click('#tabs [data-view=list]'); await pg.wait_for_timeout(300)
      await S('window.__ai=0')
      n0 = await S('window.__store.notes.length')
      await pg.locator('.note[data-id="a"] [data-act=similar]').click(); await pg.wait_for_timeout(3500)
      n1 = await S('window.__store.notes.length'); bank = await S('window.__store.bank.map(x=>x.kind)')
      step('비슷한 문제 만들기 (AI) + 문제 은행 저장', n1 > n0 and 'tpl' in bank, f'문제 +{n1-n0}, 은행 {bank}')
      await S('window.__ai=0')
      await pg.locator('.note[data-id="a"] [data-act=similar]').click(); await pg.wait_for_timeout(2500)
      n2 = await S('window.__store.notes.length'); ai = await S('window.__ai')
      fb = await S('window.__store.notes.filter(x=>x.fromBank).map(x=>x.question)')
      step('같은 유형은 은행에서 바로 (AI 안 씀)', n2 > n1 and ai == 0 and all('{' not in q.replace('\\frac{', '').replace('}{', '') or '$' in q for q in fb), f'은행 문제 {len(fb)}개, AI 호출 {ai}번')
    await safe('비슷한 문제·문제 은행', t7)

    # 6. 다시 풀기
    async def t6():
      await pg.click('#tabs [data-view=retry]'); await pg.wait_for_timeout(300)
      await pg.click('#btnStartRetry'); await pg.wait_for_timeout(400)
      box = pg.locator('#retryBtns').locator('xpath=..').locator('.ans-box')
      mode = await box.get_attribute('data-mode')
      if mode == 'choice': await box.locator('[data-ch="1"]').click()
      elif mode == 'frac': await box.locator('.fw').fill('2'); await box.locator('.fn').fill('3'); await box.locator('.fd').fill('5')
      else: await box.locator('.answer-in').fill('2')
      await pg.click('#btnCheck'); await pg.wait_for_timeout(500)
      v = await pg.inner_text('#verdict')
      step('다시 풀기 (답 쓰고 확인)', len(v.strip()) > 0, v.strip().split('\n')[0][:30])
      if await pg.is_visible('#btnQuit'): await pg.click('#btnQuit'); await pg.wait_for_timeout(300)
    await safe('다시 풀기', t6)

    # 5. 맞은 답 바로잡기 (단위 빼고 비교)
    async def t5():
      await pg.click('#tabs [data-view=list]'); await pg.wait_for_timeout(400)
      a = pg.locator('.note[data-id="a"]')
      txt = await a.locator('[data-act=fixok]').inner_text()
      await a.locator('[data-act=fixok]').click(); await pg.wait_for_timeout(500)
      st = await S('window.__store.notes.find(x=>x.id==="a").status')
      step('맞은 답 바로잡기 (3 2/5 = 3 2/5 km)', '정답과 같아요' in txt and st == 'mastered')
    await safe('맞은 답 바로잡기', t5)

    # 8. 뽑기(PDF)
    async def t8():
      await pg.click('#tabs [data-view=print]'); await pg.wait_for_timeout(300)
      await pg.click('#btnPrint'); await pg.wait_for_timeout(1200)
      items = await pg.locator('#printArea .p-item').count()
      step('시험지 뽑기 (PDF)', items > 0, f'문제 {items}개')
    await safe('시험지 뽑기', t8)

    # 9. 지우기
    async def t9():
      await pg.click('#tabs [data-view=list]'); await pg.wait_for_timeout(300)
      n0 = await S('window.__store.notes.length')
      await pg.locator('.note[data-id="c"] [data-act=del]').click(); await pg.wait_for_timeout(600)
      step('문제 지우기', await S('window.__store.notes.length') == n0 - 1)
    await safe('문제 지우기', t9)
    # 9-1. 식 읽는 규칙이 AI 안내에 들어가는지
    async def t9a():
      ps = await S('window.__prompts||[]')
      step('식 읽는 규칙(16÷2(2+2)=2)이 AI 안내에 들어감', len(ps) > 0 and all('16÷2(2+2) = 16÷8 = 2' in x for x in ps if ('problems' in x or '연습 문제' in x)), f'안내 {len(ps)}개')
    await safe('식 읽는 규칙', t9a)

    # 9-2. 카드에서 해답지 사진으로 정답 넣기
    async def t9b():
      await S('window.__key="$3\\frac{2}{5}$"')
      b0 = pg.locator('.note[data-id="b"] [data-act=key]')
      async with pg.expect_file_chooser() as fc: await b0.click()
      await (await fc.value).set_files(SAMPLE); await pg.wait_for_timeout(2500)
      nb = await S('(()=>{const x=window.__store.notes.find(v=>v.id==="b"); return [x.correctAnswer,x.answerFromKey]})()')
      txt = await pg.locator('.note[data-id="b"] .right').inner_text()
      step('카드에서 해답지 사진으로 정답 넣기', nb[1] is True and '해답지' in txt, str(nb))
    await safe('카드 해답지', t9b)
    errs1 = list(pg.errs); await pg.close()

    # 9-3. 사진 읽기 화면에서 해답지로 한꺼번에 다시 채점
    async def t9c():
      pr = await open_page(b, 'http://app/')
      await pr.click('#tabs [data-view=capture]'); await pr.wait_for_timeout(300)
      await pr.set_input_files('#inGallery', SAMPLE); await pr.wait_for_timeout(1200)
      await pr.click('#btnRecognize'); await pr.wait_for_timeout(3000)
      await pr.evaluate('window.__key="$2$"')
      async with pr.expect_file_chooser() as fc: await pr.click('#btnRecogKey')
      await (await fc.value).set_files(SAMPLE); await pr.wait_for_timeout(2000)
      head = await pr.locator('.recog .note-head').first.inner_text()
      step('사진 읽기 화면: 해답지로 다시 채점', '정답은 해답지' in head and '맞은 문제' in head, head.replace('\n', ' ')[:60])
      errs1.extend(pr.errs); await pr.close()
    await safe('읽기 화면 해답지', t9c)

    # 9-4. 중학생 노트: 두 번 풀어 답이 다르면 "확실하지 않아요"
    async def t9d():
      pm = await open_page(b, 'http://app/?middle')
      await pm.evaluate('window.__alt="5"')
      await pm.locator('.note[data-id="a"] [data-act=similar]').click(); await pm.wait_for_timeout(4000)
      uns = await pm.evaluate('window.__store.notes.filter(x=>x.answerUnsure).length')
      bank = await pm.evaluate('window.__store.bank.length')
      vis = await pm.locator('.unsure').count()
      step('중학생: 두 번 푼 답이 다르면 확실하지 않음 표시', uns > 0 and vis > 0, f'표시 {vis}개')
      step('중학생: 확인 안 된 문제 틀은 은행에 넣지 않음', bank == 0, f'은행 {bank}개')
      # 연습 문제 하나를 풀어 답을 보이게 한 뒤 정답 고르기
      card = pm.locator('.note:has(.unsure)').first; cid = await card.get_attribute('data-id')
      box = card.locator('.ans-box'); mode = await box.get_attribute('data-mode')
      if mode == 'choice': await box.locator('[data-ch="0"]').click()
      elif mode == 'frac': await box.locator('.fw').fill('1'); await box.locator('.fn').fill('1'); await box.locator('.fd').fill('2')
      else: await box.locator('.answer-in').fill('1')
      await card.locator('[data-act=check]').click(); await pm.wait_for_timeout(800)
      c2 = pm.locator(f'.note[data-id="{cid}"]')
      await c2.locator('[data-act=pickans][data-v="1"]').click(); await pm.wait_for_timeout(800)
      st = await pm.evaluate(f'(()=>{{const x=window.__store.notes.find(v=>v.id==="{cid}"); return [x.answerUnsure,x.correctAnswer]}})()')
      step('확실하지 않을 때 정답 고르기', st[0] is False and st[1] == '5', str(st))
      errs1.extend(pm.errs); await pm.close()
    await safe('중학생 두 번 확인', t9d)

    # 10. 무료 체험 끝 → AI 키 넣기 → 내 키로 AI 부르기
    async def t10():
      pk = await open_page(b, 'http://app/?trialdone')
      await pk.locator('.note[data-id="b"] [data-act=resolve]').click(); await pk.wait_for_timeout(400)
      h = await pk.inner_text('#modalBox h2') if await pk.is_visible('#kKey') else ''
      step('무료 체험 끝나면 AI 키 창', 'AI 키' in h)
      await pk.fill('#kKey', 'AIzaSyTEST_0123456789abcdefghijklmnopq'); await pk.click('#kSave'); await pk.wait_for_timeout(800)
      await pk.locator('.note[data-id="b"] [data-act=resolve]').click(); await pk.wait_for_timeout(2500)
      step('내 AI 키로 AI 부르기', len(pk.keyhits) >= 2 and all(k and k.startswith('AIza') for k in pk.keyhits), f'키 요청 {len(pk.keyhits)}번')
      errs1.extend(pk.errs); await pk.close()
    await safe('AI 키', t10)

    # 11. 미리보기(?demo)
    async def t11():
      pd = await open_page(b, 'http://app/?demo', stub=False)
      cnt = await pd.locator('.note').count()
      step('미리보기(?demo) 화면', cnt > 0, f'문제 {cnt}개')
      errs1.extend(pd.errs); await pd.close()
    await safe('미리보기', t11)

    step('화면 오류(자바스크립트) 없음', not errs1, '; '.join(errs1)[:200])
    await b.close()

  bad = [r for r in results if not r[1]]
  print(f"\n전체 시험: {len(results)-len(bad)}/{len(results)} 통과" + (f", 실패 {len(bad)}건" if bad else ""))
  sys.exit(1 if bad else 0)

asyncio.run(main())
