// 미리보기(?demo)용: AI는 부르지 않고 안내만 함
export class GoogleAIBackend {}
export function getAI() { return { demo: true }; }
export function getGenerativeModel() {
  return {
    async generateContent() {
      throw new Error("미리보기에서는 AI를 쓰지 않아요. 내 노트를 만들면 사진 읽기를 3번 무료로 써 볼 수 있어요.");
    }
  };
}
