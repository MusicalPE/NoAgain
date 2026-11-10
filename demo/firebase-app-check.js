// 미리보기(?demo)용: 앱 확인은 하지 않음
export class ReCaptchaEnterpriseProvider { constructor(k) { this.key = k; } }
export function initializeAppCheck() { return { demo: true }; }
export async function getToken() { return { token: "" }; }
