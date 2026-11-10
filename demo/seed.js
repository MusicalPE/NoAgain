// 미리보기(?demo): 지어낸 가족의 오답노트. 이름과 문제는 모두 지어낸 것
export const DEMO_USER = { uid: "demo-mom", displayName: "엄마", email: "", isAnonymous: false };

const DAY = 86400000;
const ago = (d, h = 19) => { const t = new Date(Date.now() - d * DAY); t.setHours(h, 10, 0, 0); return t.getTime(); };

function note(id, o) {
  const at = ago(o.ago || 1);
  return [`notebooks/demo-nb/notes/${id}`, {
    subject: "기타", unit: "", type: "", question: "", choices: [], myAnswer: "", correctAnswer: "",
    answerFromAI: false, wrongReason: "", explanation: "", figure: "", source: "photo", parentId: "",
    status: "wrong", wrongCount: 1, correctStreak: 0, tryCount: 0, lastTriedAt: 0,
    addedBy: "demo-mom", addedByName: "엄마", createdAt: at, updatedAt: at, ...o, ago: undefined
  }];
}

export function seedDocs() {
  const docs = {
    "notebooks/demo-nb": {
      name: "우리 집 오답노트", owner: "demo-mom", members: ["demo-mom", "demo-dad"], names: { "demo-mom": "엄마", "demo-dad": "아빠" },
      grade: "초등 4학년", kid: "하늘", kidAsked: true, inviteCode: "", inviteExpires: 0, aiTrialUsed: 0, createdAt: ago(30)
    },
    "users/demo-mom": { currentNb: "demo-nb" }
  };
  const list = [
    note("n01", { ago: 1, subject: "수학", unit: "분수의 덧셈과 뺄셈", type: "계산",
      question: "다음을 계산하세요. $\\frac{3}{8} + \\frac{4}{8}$", myAnswer: "7/16", correctAnswer: "7/8",
      wrongReason: "분모끼리도 더했어요. 분모가 같을 때는 분자끼리만 더해요.",
      explanation: "분모가 8로 같으니 분자만 더해요. $3 + 4 = 7$ 이므로 $\\frac{7}{8}$ 이에요.", wrongCount: 2, tryCount: 1, lastTriedAt: ago(1, 20) }),
    note("n02", { ago: 1, subject: "수학", unit: "분수의 덧셈과 뺄셈", type: "계산", source: "ai", parentId: "n01", wrongCount: 0,
      question: "다음을 계산하세요. $\\frac{2}{7} + \\frac{3}{7}$", correctAnswer: "5/7",
      explanation: "분모 7은 그대로 두고 분자 $2 + 3 = 5$ 를 더해 $\\frac{5}{7}$ 이에요." }),
    note("n03", { ago: 1, subject: "수학", unit: "분수의 덧셈과 뺄셈", type: "계산", source: "ai", parentId: "n01", wrongCount: 0,
      question: "다음을 계산하세요. $\\frac{9}{10} - \\frac{4}{10}$", correctAnswer: "5/10",
      explanation: "분모가 같으니 분자끼리 빼요. $9 - 4 = 5$ 이므로 $\\frac{5}{10}$ 이에요.", status: "mastered", tryCount: 1, correctStreak: 1, lastTriedAt: ago(0, 8) }),
    note("n04", { ago: 3, subject: "수학", unit: "각도", type: "객관식",
      question: "두 각의 크기의 합이 가장 큰 것은 어느 것인가요?", choices: ["$35° + 50°$", "$60° + 45°$", "$70° + 20°$", "$40° + 55°$"],
      myAnswer: "④", correctAnswer: "②", wrongReason: "④를 계산할 때 $40 + 55 = 105$ 로 잘못 더했어요.",
      explanation: "① 85°, ② 105°, ③ 90°, ④ 95° 이므로 가장 큰 것은 ② 105° 예요." }),
    note("n05", { ago: 4, subject: "국어", unit: "맞춤법", type: "객관식",
      question: "맞춤법이 바른 문장을 고르세요.", choices: ["숙제를 금새 끝냈다.", "오랫만에 친구를 만났다.", "어떻게 된 일인지 궁금하다.", "문을 잘 잠궈라."],
      myAnswer: "②", correctAnswer: "③", wrongReason: "'오랜만에'를 '오랫만에'로 알고 있었어요.",
      explanation: "'금세', '오랜만에', '잠가라'가 바른 말이에요. 바르게 쓴 문장은 ③이에요.", wrongCount: 3, tryCount: 2, lastTriedAt: ago(2, 20) }),
    note("n06", { ago: 6, subject: "과학", unit: "지층과 화석", type: "객관식",
      question: "지층에 대한 설명으로 옳은 것은 무엇인가요?", choices: ["아래에 있는 층이 먼저 쌓였다.", "모든 층의 두께가 같다.", "화석은 화산암에서 많이 발견된다.", "지층은 휘어지지 않는다."],
      myAnswer: "②", correctAnswer: "①", wrongReason: "그림에서 층 두께가 비슷해 보여서 골랐어요.",
      explanation: "지층은 아래부터 차례로 쌓이므로 보통 아래층이 더 오래되었어요." }),
    note("n07", { ago: 8, subject: "사회", unit: "지도 읽기", type: "주관식",
      question: "축척이 1:50,000인 지도에서 2cm는 실제 거리로 몇 km인가요?", myAnswer: "10km", correctAnswer: "1km",
      wrongReason: "cm를 km로 바꿀 때 0을 하나 더 붙였어요.",
      explanation: "2cm × 50,000 = 100,000cm = 1,000m = 1km 예요." }),
    note("n08", { ago: 10, subject: "영어", unit: "시각 묻고 답하기", type: "객관식",
      question: "그림의 시계가 7시 30분을 가리킬 때 알맞은 답은?\nWhat time is it?", choices: ["It's seven thirty.", "It's seven thirteen.", "It's three seventy.", "It's thirty seven."],
      myAnswer: "②", correctAnswer: "①", wrongReason: "thirty와 thirteen을 헷갈렸어요.",
      explanation: "30은 thirty, 13은 thirteen 이에요. 7시 30분은 It's seven thirty." }),
    note("n09", { ago: 13, subject: "수학", unit: "큰 수", type: "주관식",
      question: "35억 2000만을 숫자로 쓰세요.", myAnswer: "352000000", correctAnswer: "3520000000",
      wrongReason: "억의 자리에서 0을 하나 빠뜨렸어요.", explanation: "35억은 3,500,000,000, 2000만은 20,000,000 이므로 합하면 3,520,000,000 이에요.",
      status: "mastered", tryCount: 2, correctStreak: 1, lastTriedAt: ago(5, 20) }),
    note("n10", { ago: 15, subject: "국어", unit: "띄어쓰기", type: "주관식",
      question: "띄어쓰기가 바르게 되도록 고쳐 쓰세요.\n'나는할수있다'", myAnswer: "나는 할수 있다", correctAnswer: "나는 할 수 있다",
      wrongReason: "'수'를 앞말에 붙여 썼어요.", explanation: "'수'는 의존 명사라서 앞말과 띄어 써요. → 나는 할 수 있다", tryCount: 1, lastTriedAt: ago(7, 20) }),
    note("n11", { ago: 18, subject: "과학", unit: "식물의 한살이", type: "객관식",
      question: "씨가 싹 트는 데 꼭 필요한 조건 두 가지는?", choices: ["물, 알맞은 온도", "햇빛, 흙", "바람, 햇빛", "흙, 거름"],
      myAnswer: "②", correctAnswer: "①", wrongReason: "식물이 자라는 데 필요한 조건과 헷갈렸어요.",
      explanation: "씨가 싹 트려면 물과 알맞은 온도가 필요해요. 햇빛은 싹이 튼 뒤 자랄 때 필요해요.",
      status: "mastered", tryCount: 1, correctStreak: 1, lastTriedAt: ago(9, 20), addedBy: "demo-dad", addedByName: "아빠" }),
    note("n12", { ago: 21, subject: "수학", unit: "곱셈과 나눗셈", type: "서술형",
      question: "사탕 252개를 한 봉지에 12개씩 담으면 몇 봉지가 되나요? 식과 답을 쓰세요.", myAnswer: "252 ÷ 12 = 20", correctAnswer: "252 ÷ 12 = 21, 21봉지",
      wrongReason: "나눗셈 몫을 구할 때 마지막 자리를 빼먹었어요.", explanation: "12 × 21 = 252 이므로 21봉지예요.", wrongCount: 2, tryCount: 1, lastTriedAt: ago(4, 20), addedBy: "demo-dad", addedByName: "아빠" })
  ];
  for (const [p, v] of list) { delete v.ago; docs[p] = v; }
  return docs;
}
