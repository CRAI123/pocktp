/** 统一 API 请求封装（自动携带登录 token，401 自动跳转登录页） */
const BASE = '/api';
const TOKEN_KEY = 'tw_token';
const TEACHER_KEY = 'tw_teacher';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get teacher() {
    try { return JSON.parse(localStorage.getItem(TEACHER_KEY)); } catch { return null; }
  },
  save(token, teacher) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TEACHER_KEY, JSON.stringify(teacher));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TEACHER_KEY);
  },
};

/** 今天日期 YYYY-MM-DD（本地时区） */
export function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 会员是否有效：管理员、永久（到期日为空）且已激活的账号均有效 */
export function isMembershipActive(t = auth.teacher) {
  if (!t) return false;
  if (t.is_admin) return true;
  if (!t.activated) return false; // 未激活账号不算有效会员
  return !t.membership_expires_at || t.membership_expires_at >= todayStr();
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    auth.clear();
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new Error('登录已过期');
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.needActivation && !location.pathname.startsWith('/activate')) {
      location.href = '/activate'; // 未激活：跳转激活页
    }
    throw new Error(body.error || '账号未激活');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败 (${res.status})`);
  }
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  del: (path) => request(path, { method: 'DELETE' }),
};

/** AI 出题 / 批改 / 历史（每次扣算力，余额不足抛 402） */
export const ai = {
  generate: (params) => api.post('/ai/generate', params),
  grade: (params) => api.post('/ai/grade', params),
  history: (type, limit = 20) => api.get(`/ai/history?type=${encodeURIComponent(type)}&limit=${limit}`),
  /** 举一反三：基于单题生成同类型变式题（默认 3 道，扣 2 算力） */
  similar: (type, question, count = 3) => api.post('/ai/similar', { type, question, count }),
  /** 综合测试：仿中考题型的语/数/英综合卷（subjects=[{subject,count}]，扣 5 算力） */
  exam: (params) => api.post('/ai/exam', params),
  /** 单题重出：按改进提示词重新命制 1 题替换（扣 1 算力） */
  regenerate: (type, question, feedback) => api.post('/ai/regenerate', { type, question, feedback }),
  /** 班主任文案：comment 期末评语（批量）/ notice 家长通知 / weekly 班级周报 / summary 学期总结 */
  write: (type, payload) => api.post('/ai/write', { type, payload }),
  /** 聊天记录解析：todos 提取待办 / moral 提取加减分 / meeting 整理班会纪要 / journal 周记草稿 */
  extract: (scene, text, names = []) => api.post('/ai/extract', { scene, text, names }),
};
