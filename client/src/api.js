/** 统一 API 请求封装（自动携带登录 token，401 自动跳转登录页） */
const BASE = '/api';
const TOKEN_KEY = 'tw_token';
const TEACHER_KEY = 'tw_teacher';
const REMEMBER_KEY = 'tw_remember';
const LAST_PHONE_KEY = 'tw_last_phone';

/* 勾选「记住登录」→ localStorage（关掉应用仍保留）；否则仅 sessionStorage */
const store = {
  get(k) {
    try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return localStorage.getItem(k); }
  },
  set(k, v, persist) {
    const keep = persist ? localStorage : sessionStorage;
    const drop = persist ? sessionStorage : localStorage;
    try { keep.setItem(k, v); drop.removeItem(k); } catch { try { localStorage.setItem(k, v); } catch {} }
  },
  del(k) {
    try { localStorage.removeItem(k); } catch {}
    try { sessionStorage.removeItem(k); } catch {}
  },
};

export const auth = {
  get token() { return store.get(TOKEN_KEY); },
  get teacher() {
    try { return JSON.parse(store.get(TEACHER_KEY)); } catch { return null; }
  },
  /** 是否「记住登录」（下次打开免密进入） */
  get remember() {
    try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
  },
  /** 上次登录的手机号，用于登录页预填 */
  get lastPhone() {
    try { return localStorage.getItem(LAST_PHONE_KEY) || ''; } catch { return ''; }
  },
  save(token, teacher, remember = auth.remember) {
    try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch {}
    store.set(TOKEN_KEY, token, remember);
    store.set(TEACHER_KEY, JSON.stringify(teacher), remember);
    if (teacher?.phone) { try { localStorage.setItem(LAST_PHONE_KEY, teacher.phone); } catch {} }
  },
  clear() {
    store.del(TOKEN_KEY);
    store.del(TEACHER_KEY);
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

/** 课时费与工作量：默认不开放，由管理员在后台按教师分配（管理员可用） */
export function canUseFinance(t = auth.teacher) {
  return !!t && (!!t.finance_enabled || !!t.is_admin);
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
  /** 综合测试：分科独立生成（subjects=[{subject,count,qtypes?}]，扣 2 算力/次） */
  exam: (params) => api.post('/ai/exam', params),
  /** 课堂练习：全科目（subject+topic+knowledge+items 题型清单+prompt 确认后的描述词，扣 2 算力） */
  practice: (params) => api.post('/ai/practice', params),
  /** 单题重出：按改进提示词重新命制 1 题替换（扣 1 算力） */
  regenerate: (type, question, feedback) => api.post('/ai/regenerate', { type, question, feedback }),
  /** 班主任文案：comment 期末评语（批量）/ notice 家长通知 / weekly 班级周报 / summary 学期总结 */
  write: (type, payload) => api.post('/ai/write', { type, payload }),
  /** 聊天记录解析：todos 提取待办 / moral 提取加减分 / meeting 整理班会纪要 / journal 周记草稿 */
  extract: (scene, text, names = []) => api.post('/ai/extract', { scene, text, names }),
  /** AI 工具集：备课助手 / 作业提效 / 作文评语 / 资料库检索 */
  lessonPlan: (params) => api.post('/ai/lesson-plan', params),
  homework: (params) => api.post('/ai/homework', params),
  essayComment: (params) => api.post('/ai/essay-comment', params),
  materialSearch: (query, items) => api.post('/ai/material-search', { query, items }),
  /** AI 开关与自选模型（只允许服务端已配置的模型） */
  settings: () => api.get('/ai/settings'),
  saveSettings: (params) => api.put('/ai/settings', params),
};
