/**
 * AI 出题 / 自动批改（OpenAI 兼容协议 → Claude Kiro 反代）
 *  - POST /api/ai/generate  按类型+年级+难度+关键词批量出题
 *  - POST /api/ai/grade     对单题做自动批改 + 订正建议
 *  - 每次调用扣 AI_COST_PER_CALL 算力；余额不足返回 402
 *  - 主备模型：AI_MODEL → AI_MODEL_BACKUP（主失败 5xx/超时 fallback）
 */
const express = require('express');
const db = require('../db');
const { ah } = require('../util');

const router = express.Router();

const BASE = process.env.AI_BASE_URL || 'https://3hdmx.com';
const KEY = process.env.AI_KEY || '';
const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';
const MODEL_BACKUP = process.env.AI_MODEL_BACKUP || 'claude-opus-5';
const COST = Number(process.env.AI_COST_PER_CALL || 5);

/* 分级计费：按功能实际消耗定价（轻量操作低价，重活高价），余额不足统一 402 */
const COSTS = {
  generate: COST,   // AI 出题（批量生成）
  exam: 2,          // 综合测试（分科独立生成：单次只出一科，三科分开调用共 6，与整卷一次 5 基本持平）
  grade: 1,         // AI 批改（单题，轻量）
  extract: 2,       // 聊天记录解析（提取待办/加减分/整理纪要）
  similar: 2,       // 举一反三（基于单题生成同型变式）
  regenerate: 1,    // 单题重出（按改进提示词重新命制 1 题）
  write: {
    comment: 10,    // AI 期末评语（一次全班）
    notice: 2,      // 家长通知
    weekly: 3,     // 班级周报
    summary: 8,     // 学期总结（长文）
  },
  practice: 2,      // 课堂练习（全科目，按题型数量出题）
};

/* 通用 Chat Completions 调用：主模型失败 fallback 备模型（每次独立超时） */
async function chat(messages, { model = MODEL, maxTokens = 2048, timeoutMs = 90_000 } = {}) {
  if (!KEY) throw Object.assign(new Error('AI_KEY 未配置'), { status: 503 });

  const tryOnce = async (m, ms) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(`${BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, messages, max_tokens: maxTokens }),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!r.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${r.status}`), { status: r.status, raw: data });
      return data;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await tryOnce(model, timeoutMs);
  } catch (e) {
    /* 4xx（除超时 408 / 限流 429）直接抛，不 fallback */
    if (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
    /* 超时 / 5xx / 网络错误 → 用新 controller 重试备模型 */
    return await tryOnce(MODEL_BACKUP, timeoutMs);
  }
}

/* 算力扣减（事务） */
async function charge(teacherId, cost) {
  if (cost <= 0) return { credits: 0 };
  return await db.transaction(async (tx) => {
    const r = await tx.get('SELECT credits FROM teachers WHERE id = ?', [teacherId]);
    const cur = Number(r?.credits || 0);
    if (cur < cost) {
      const e = new Error('算力不足，请续费'); e.status = 402; throw e;
    }
    await tx.run('UPDATE teachers SET credits = credits - ? WHERE id = ?', [cost, teacherId]);
    return { credits: cur - cost };
  });
}

/* 8 个题型的出题 prompt（schema 强约束 → 解析稳定） */
const TYPE_PROMPT = {
  dictation: '看拼音写词语 / 默写汉字（小学语文，词语 2-4 字）',
  pinyin: '给出拼音，让学生写出对应汉字（1-2 个字）',
  fix: '病句修改：给出一个有语病的句子和订正后的句子（病因明确）',
  poem: '古诗默写：给出一句古诗，要求写出上一句或下一句；或给出诗题要求写出全诗关键句',
  sentence: '英语句子填空：根据时态/句型/语法补全（每题 1 空）',
  wordbank: '英语选词填空：给一段短文挖 3 个空 + 6 个候选词',
  reading: '英语阅读理解：给一篇短文（80-150 词）+ 3-5 道选择题（4 选 1），覆盖主旨/细节/推断/词义',
  dictationEn: '英语单词听写：给出中文释义，让学生写出对应英文单词',
  exam: '综合测试卷：仿中考题型结构的语文/数学/英语综合卷（语文含阅读理解与作文、英语含完形填空/阅读理解/书面表达、数学不含画图题）',
};

/* 中考命题新风向指令（任意年级档可选开启） */
const TREND_DIRECTIVE = '- 命题风格：融入最新中考命题新风向——真实情境化设题、跨学科融合、开放性/探究性设问、新材料新题型，避免陈旧套路\n';

/* 年级档描述（用于 AI 选材范围） */
const GRADE_DESC = (g) => {
  if (g === 'zk') return '中考（覆盖 7-9 年级重难点）';
  const n = Number(g);
  if (!n) return g;
  if (n <= 6) return `小学 ${n} 年级`;
  if (n === 7) return '初中 7 年级（初一）';
  if (n === 8) return '初中 8 年级（初二）';
  if (n === 9) return '初中 9 年级（初三）';
  return `${g} 年级`;
};

const SYSTEM_GENERATE = (type, grade, difficulty, count, keyword, trend = false) => `你是${GRADE_DESC(grade)}出题专家，正在生成【${TYPE_PROMPT[type] || type}】专项练习题。
要求：
- 难度：${difficulty}（easy=基础、medium=中等、hard=拔高）
${trend ? TREND_DIRECTIVE : ''}- 数量：${count} 题
- 主题/关键词：${keyword || '不限'}
- 题目符合课标、考点清晰、无错别字 / 拼写错误
- 严格返回 JSON，不要任何解释或 markdown 代码块包装

JSON Schema（按题型使用对应字段，未列出字段可不填）:
{
  "questions": [
    {
      "id": "ai-唯一标识",
      "word": "dictation 题用，看拼音写词语的词语",
      "pinyin": "pinyin / dictation 题用",
      "sentence": "fix/sentence 题用，题干",
      "stem": "reading 题用，选择题题干",
      "passage": "wordbank/reading 题用，挖空用 ____1____ ____2____ ____3____（wordbank）；reading 不挖空，给完整短文",
      "choices": ["wordbank 候选词数组；reading 每题的 4 个选项"],
      "blanks": [{"index": 0, "answer": "..."}],
      "answer": "正确答案（dictation/pinyin/fix/sentence/dictationEn/poem 用）；reading 题用选项字母 A/B/C/D",
      "chinese": "dictationEn 题用，中文释义",
      "explanation": "一句话解析",
      "hint": "sentence/wordbank 用，一两个词提示",
      "topic": "${keyword || '综合'}"
    }
  ]
}`;

/* ===== POST /api/ai/generate ===== */
router.post('/generate', ah(async (req, res) => {
  const { type, grade = '3', difficulty = 'medium', count = 10, keyword = '', trend = false } = req.body || {};
  if (!type || !TYPE_PROMPT[type]) return res.status(400).json({ error: 'type 不合法' });
  const n = Math.max(1, Math.min(30, Number(count) || 10));
  const result = await chat([
    { role: 'system', content: SYSTEM_GENERATE(type, grade, difficulty, n, keyword, !!trend) },
    { role: 'user', content: `请生成 ${n} 道题。` },
  ], { maxTokens: 4096 });
  const text = result.choices?.[0]?.message?.content || '';
  /* 兼容模型偶发加 ```json 包装：剥离 + 容错解析 */
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(clean); } catch (e1) {
    /* fallback：从文本中抓第一个 { 到最后一个 } */
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { parsed = JSON.parse(clean.slice(first, last + 1)); } catch (e2) {
        console.error('[ai/generate] JSON 解析失败', { raw: clean.slice(0, 500), e1: e1.message, e2: e2.message });
        return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
      }
    } else {
      return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
    }
  }
  /* 注入元信息 + 生成新 id 避免与静态题冲突
   * reading 类型特殊处理：AI 返回 { passages: [{ passage, questions: [...] }] }
   * 展平为 questions 数组，每题带 groupIndex 用于前端识别"同组共用短文" */
  let questions;
  if (type === 'reading' && Array.isArray(parsed.passages)) {
    questions = [];
    parsed.passages.slice(0, Math.ceil(n / 3)).forEach((pg, gi) => {
      const subs = (pg.questions || []).slice(0, 5);
      subs.forEach((sq, qi) => {
        questions.push({
          id: `ai-reading-${Date.now()}-${gi}-${qi}`,
          grade, difficulty, topic: keyword || '阅读理解',
          passage: pg.passage,
          stem: sq.stem,
          choices: sq.choices || [],
          answer: sq.answer,
          explanation: sq.explanation || '',
          groupIndex: gi,
          groupSize: subs.length,
        });
      });
    });
  } else {
    questions = (parsed.questions || []).slice(0, n).map((q, i) => ({
      id: `ai-${type}-${Date.now()}-${i}`,
      grade, difficulty, topic: keyword || 'AI 生成',
      ...q,
    }));
  }
  if (!questions.length) return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
  const cost = COSTS.generate;
  const charged = await charge(req.teacherId, cost);
  /* 写入历史记录（异步，不阻塞响应） */
  db.run(
    `INSERT INTO ai_history (teacher_id, type, grade, difficulty, count, keyword, questions, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [req.teacherId, type, String(grade), difficulty, questions.length, keyword || '', JSON.stringify(questions), cost]
  ).catch(err => console.warn('[ai] history save failed:', err.message));
  res.json({ questions, cost, credits: charged.credits, usage: result.usage });
}));

/* ===== GET /api/ai/history?type=xxx&limit=20 ===== 拉取该教师某题型最近出题记录 */
router.get('/history', ah(async (req, res) => {
  const type = String(req.query.type || '').trim();
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  if (!type) return res.status(400).json({ error: 'type 必填' });
  const rows = await db.all(
    `SELECT id, type, grade, difficulty, count, keyword, questions, cost, created_at
     FROM ai_history WHERE teacher_id = $1 AND type = $2
     ORDER BY created_at DESC LIMIT $3`,
    [req.teacherId, type, limit]
  );
  /* questions 字段是 JSONB，pg 自动解析为对象/数组（get/all 已统一 parseInt int8） */
  res.json({ history: rows.map(r => ({ ...r, questions: typeof r.questions === 'string' ? JSON.parse(r.questions) : r.questions })) });
}));

/* ===== POST /api/ai/grade ===== */
router.post('/grade', ah(async (req, res) => {
  const { type, question, userAnswer } = req.body || {};
  if (!question || userAnswer == null) return res.status(400).json({ error: '缺少 question 或 userAnswer' });
  const expected = question.answer ?? '';
  const prompt = `题型：${TYPE_PROMPT[type] || type}
题目：${question.sentence || question.passage || question.word || question.pinyin || question.id}
正确答案：${Array.isArray(expected) ? expected.join(' / ') : expected}
学生作答：${String(userAnswer)}

请判断对错并给出简明反馈。严格返回 JSON（不要 markdown 包装）：
{
  "correct": true或false,
  "score": 0到100的整数,
  "diagnosis": "一句话指出对/错的关键点（病因 / 失分点）",
  "suggestion": "学习建议（10-30 字）"
}`;
  const result = await chat([{ role: 'user', content: prompt }], { maxTokens: 400, model: MODEL_BACKUP });
  const text = result.choices?.[0]?.message?.content || '';
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(clean); } catch {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { parsed = JSON.parse(clean.slice(first, last + 1)); } catch { /* fallthrough */ }
    }
  }
  if (!parsed || typeof parsed !== 'object') parsed = { correct: null, score: null, diagnosis: text.slice(0, 200), suggestion: '' };
  const cost = COSTS.grade;
  const charged = await charge(req.teacherId, cost);
  res.json({ ...parsed, cost, credits: charged.credits, usage: result.usage });
}));

/* ===== 文案生成：期末评语 / 家长通知 / 班级周报 / 学期总结 ===== */
const WRITE_PROMPT = {
  comment: (p) => {
    const list = (p.students || []).map((s, i) =>
      `${i + 1}. ${s.name}${s.gender ? `（${s.gender}）` : ''}${s.tags ? `：${s.tags}` : ''}`).join('\n');
    return {
      system: `你是资深班主任，正在为以下学生撰写期末操行评语。
要求：
- 每名学生 80-120 字，第二人称"你"，口吻亲切、具体、有画面感
- 既肯定闪光点，也委婉指出一个可努力的方向
- 严禁千篇一律，结合给出的特点关键词展开
- 严格返回 JSON，不要任何解释或 markdown 包装

JSON Schema: {"items": [{"name": "学生姓名", "text": "评语内容"}]}`,
      user: `学生名单：\n${list}`,
      json: true, maxTokens: 4096,
    };
  },
  notice: (p) => ({
    system: `你是中小学班主任，需要写一则发布在家长群的通知。
要求：200-400 字，称呼得体（如"各位家长好"），事项清晰，语气礼貌，落款"班主任"。
只返回通知正文纯文本，不要解释、不要 markdown。`,
    user: `通知要点：${p.points}`,
    json: false, maxTokens: 1200,
  }),
  weekly: (p) => ({
    system: `你是中小学班主任，需要写一份班级周报（发家长群）。
要求：300-500 字，包含【本周回顾】【表扬与进步】【温馨提示】【下周安排】四个板块，语气温暖积极。
只返回周报正文纯文本，不要解释、不要 markdown。`,
    user: `本周要点：${p.points}`,
    json: false, maxTokens: 1500,
  }),
  summary: (p) => ({
    system: `你是中小学班主任，需要撰写学期工作总结。
要求：600-900 字，结构清晰（班级概况 / 主要工作 / 成效与不足 / 下学期展望），文风务实。
只返回总结正文纯文本，不要解释、不要 markdown。`,
    user: `学期工作要点：${p.points}`,
    json: false, maxTokens: 2500,
  }),
};

/* ===== POST /api/ai/write { type, payload } ===== */
router.post('/write', ah(async (req, res) => {
  const { type, payload = {} } = req.body || {};
  const builder = WRITE_PROMPT[type];
  if (!builder) return res.status(400).json({ error: 'type 不合法' });
  /* 入参校验 */
  if (type === 'comment') {
    if (!Array.isArray(payload.students) || !payload.students.length) {
      return res.status(400).json({ error: 'students 必填' });
    }
    payload.students = payload.students.slice(0, 60); // 单次上限 60 人
  } else if (!String(payload.points || '').trim()) {
    return res.status(400).json({ error: '要点 points 必填' });
  }
  const cost = COSTS.write[type] ?? COSTS.generate;
  const spec = builder(payload);
  const result = await chat([
    { role: 'system', content: spec.system },
    { role: 'user', content: spec.user },
  ], { maxTokens: spec.maxTokens });
  const text = result.choices?.[0]?.message?.content || '';
  let out;
  if (spec.json) {
    /* 剥离 ```json 包装 + 容错截取解析 */
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch (e1) {
      const first = clean.indexOf('{');
      const last = clean.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try { parsed = JSON.parse(clean.slice(first, last + 1)); } catch (e2) {
          return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
        }
      } else {
        return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
      }
    }
    const items = Array.isArray(parsed.items) ? parsed.items.filter(it => it && it.text) : [];
    if (!items.length) return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
    out = { items };
  } else {
    if (!text.trim()) return res.status(502).json({ error: 'AI 返回为空' });
    out = { text: text.trim() };
  }
  const charged = await charge(req.teacherId, cost);
  /* 写入历史：keyword 记要点或学生名单（截 200） */
  const keyword = type === 'comment'
    ? (payload.students || []).map(s => s.name).join('、').slice(0, 200)
    : String(payload.points || '').slice(0, 200);
  db.run(
    `INSERT INTO ai_history (teacher_id, type, grade, difficulty, count, keyword, questions, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [req.teacherId, `write-${type}`, '', '', out.items?.length || 1, keyword,
     JSON.stringify(out.items || [{ text: out.text }]), cost]
  ).catch(err => console.warn('[ai] history save failed:', err.message));
  res.json({ ...out, cost, credits: charged.credits, usage: result.usage });
}));

/* ===== 聊天记录解析：从家长群/速记中提取待办、加减分，或整理成纪要/周记草稿 ===== */

/* 今天日期 YYYY-MM-DD（服务器本地时区，用于相对时间推算） */
const todayStrCN = () => {
  const p = n => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const EXTRACT_PROMPT = {
  todos: (today) => ({
    system: `你是班主任助理，从家长群/同事聊天记录中提取需要老师跟进的待办事项。
要求：
- 只提取明确需要老师做的事（回复家长、准备材料、处理矛盾、通知事项、会议等），寒暄闲聊忽略
- 每条 title 20 字以内；due_date 从相对时间推算为 YYYY-MM-DD（今天是 ${today}，"明天"就是 ${today} 的次日），推算不出留空字符串；priority 按紧迫程度取 高/中/低
- 最多 15 条，按重要性排序；严格返回 JSON，不要 markdown 包装

JSON Schema: {"items": [{"title": "待办事项", "due_date": "YYYY-MM-DD 或空串", "priority": "高|中|低"}]}`,
    user: '', json: true,
  }),
  moral: (names) => ({
    system: `你是班主任助理，从聊天记录中提取学生表扬/批评事件，用于德育量化记录。
要求：
- 正面事件（表扬、进步、获奖、帮助他人）score 为正整数 1-5；负面事件（违纪、拖欠、冲突）score 为负整数 -1 至 -5
- student_name 必须从下面的班级名单中选（用完整姓名）；记录中提到的人名与名单对不上就填记录里的原名
- reason 15 字以内概括事由；最多 20 条；严格返回 JSON，不要 markdown 包装

班级学生名单：${names.join('、')}

JSON Schema: {"items": [{"student_name": "学生姓名", "score": 1或-2等整数, "reason": "事由"}]}`,
    user: '', json: true,
  }),
  meeting: () => ({
    system: `你是班主任助理，把原始班会速记/群聊记录整理成规范的班会记录。
要求：纯文本，300-600 字，包含【时间】【主题】【主要内容】【决议与安排】（缺省项可省略），语言正式简洁。不要解释、不要 markdown。`,
    user: '', json: false,
  }),
  journal: () => ({
    system: `你是班主任，根据本周聊天记录、备忘、班级大事整理一篇班主任周记草稿。
要求：纯文本 300-500 字，第一人称，写实记录本周班级工作与学生情况，可分条目。不要解释、不要 markdown。`,
    user: '', json: false,
  }),
};

/* ===== POST /api/ai/extract { scene, text, names? } ===== */
router.post('/extract', ah(async (req, res) => {
  const { scene, text = '', names = [] } = req.body || {};
  const builder = EXTRACT_PROMPT[scene];
  if (!builder) return res.status(400).json({ error: 'scene 不合法' });
  const raw = String(text).trim();
  if (!raw) return res.status(400).json({ error: '聊天记录 text 必填' });
  if (raw.length > 8000) return res.status(400).json({ error: '记录过长，请分段粘贴（8000 字以内）' });

  const spec = scene === 'todos'
    ? builder(todayStrCN())
    : scene === 'moral'
      ? builder(Array.isArray(names) ? names.slice(0, 80) : [])
      : builder();
  const user = `记录内容：\n${raw}`;
  const result = await chat([
    { role: 'system', content: spec.system },
    { role: 'user', content: user },
  ], { maxTokens: scene === 'todos' || scene === 'moral' ? 1500 : 1600 });

  const textOut = result.choices?.[0]?.message?.content || '';
  const cost = COSTS.extract;
  let out;
  if (spec.json) {
    const clean = textOut.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch (e1) {
      const first = clean.indexOf('{');
      const last = clean.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try { parsed = JSON.parse(clean.slice(first, last + 1)); } catch (e2) {
          return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
        }
      } else {
        return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
      }
    }
    out = { items: Array.isArray(parsed.items) ? parsed.items.filter(it => it && (it.title || it.student_name)) : [] };
  } else {
    if (!textOut.trim()) return res.status(502).json({ error: 'AI 返回为空' });
    out = { text: textOut.trim() };
  }
  const charged = await charge(req.teacherId, cost);
  db.run(
    `INSERT INTO ai_history (teacher_id, type, grade, difficulty, count, keyword, questions, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [req.teacherId, `extract-${scene}`, '', '', out.items?.length || 1, raw.slice(0, 200),
     JSON.stringify(out.items || [{ text: out.text }]), cost]
  ).catch(err => console.warn('[ai] history save failed:', err.message));
  res.json({ ...out, cost, credits: charged.credits, usage: result.usage });
}));

/* ===== POST /api/ai/similar  举一反三：基于单题生成同类型变式题 ===== */
router.post('/similar', ah(async (req, res) => {
  const { type, question, count = 3 } = req.body || {};
  if (!type || !TYPE_PROMPT[type]) return res.status(400).json({ error: 'type 不合法' });
  if (!question || typeof question !== 'object') return res.status(400).json({ error: 'question 必填' });
  const n = Math.max(1, Math.min(5, Number(count) || 3));
  /* 去掉内部字段后作为参考原题 */
  const original = { ...question };
  delete original.id; delete original.groupIndex; delete original.groupSize; delete original.grade; delete original.difficulty; delete original.topic;
  const prompt = `题型：${TYPE_PROMPT[type] || type}
参考原题（JSON）：
${JSON.stringify(original, null, 2)}

请"举一反三"：生成 ${n} 道与原题同类型、同结构、同考点的变式题——考查知识点一致，但素材/词语/情境/数据不同，难度相当，可直接用于替换练习。字段结构与原题保持一致（原题有的字段都要给）。严格返回 JSON，不要 markdown 包装：
{"questions": [ {…与原题同结构…} ]}`;
  const result = await chat([{ role: 'user', content: prompt }], { maxTokens: 2500 });
  const text = result.choices?.[0]?.message?.content || '';
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(clean); } catch (e1) {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { parsed = JSON.parse(clean.slice(first, last + 1)); } catch { /* fallthrough */ }
    }
  }
  let questions = Array.isArray(parsed?.questions) ? parsed.questions : (Array.isArray(parsed?.items) ? parsed.items : []);
  questions = questions.filter(q2 => q2 && typeof q2 === 'object').slice(0, n).map((q2, i) => ({
    id: `ai-similar-${Date.now()}-${i}`,
    grade: question.grade || '', difficulty: question.difficulty || 'medium',
    topic: `举一反三${question.topic ? ` · ${question.topic}` : ''}`,
    ...q2,
  }));
  if (!questions.length) return res.status(502).json({ error: 'AI 返回解析失败', raw: clean.slice(0, 500) });
  const cost = COSTS.similar;
  const charged = await charge(req.teacherId, cost);
  const preview = String(question.sentence || question.word || question.pinyin || question.stem || question.chinese || question.passage || '').slice(0, 150);
  db.run(
    `INSERT INTO ai_history (teacher_id, type, grade, difficulty, count, keyword, questions, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [req.teacherId, `similar-${type}`, String(question.grade || ''), 'medium', questions.length,
     `举一反三 · ${preview}`, JSON.stringify(questions), cost]
  ).catch(err => console.warn('[ai] history save failed:', err.message));
  res.json({ questions, cost, credits: charged.credits, usage: result.usage });
}));

/* ===== 综合测试（仿中考题型的语/数/英综合卷，数学不含画图题） ===== */

/* 各学科命题范围与题型结构说明（题型覆盖中考完整结构：阅读 + 作文） */
const EXAM_SUBJECT_DESC = {
  chinese: '语文（积累与运用=字词/病句/文学常识/语言表达，四选一选择题；古诗文默写=上下句填空/理解性默写；现代文阅读理解=给一篇 200-400 字短文后设 2-3 问（赏析/作用分析/主旨概括/信息筛选）；名著阅读；作文=命题/材料/话题作文，必须给出作文题目、文体与写作要求含建议字数）',
  math: '数学（选择题=概念辨析/运算求解；填空题=计算/代数求值/几何计算/统计填空；解答题=计算、方程与不等式、函数、几何证明、统计概率、实际应用、跨学科材料阅读；严禁画图题、作图题、尺规作图题、识图题，几何内容一律以文字描述图形让学生计算或证明）',
  english: '英语（选择题=单项选择/语法/交际用语；完形填空=给一篇 150-250 词留空短文，各题 A-D 选项列于文后，答案按题号依次给出；阅读理解=给一篇 150-300 词短文后设 2-3 问（细节理解/词义猜测/推理判断/主旨大意）；书面表达=英语作文，必须给出题目、要点提示与词数要求）',
};
const EXAM_SUBJ_KEY = { '语文': 'chinese', '数学': 'math', '英语': 'english' };
const EXAM_QTYPES = ['选择题', '填空题', '解答题', '简答题', '阅读理解', '完形填空', '作文题'];
/* 各题型默认分值（中考风格） */
const EXAM_POINTS = { '选择题': 3, '填空题': 3, '解答题': 6, '简答题': 4, '阅读理解': 4, '完形填空': 10, '作文题': 40 };

const SYSTEM_EXAM = (grade, difficulty, parts, trend, keyword) => `你是${GRADE_DESC(grade)}资深中考命题专家，深谙历年中考真题的题型结构、难度梯度与评分标准，请命制一份仿中考题型结构的综合测试卷。
包含以下部分（语文、数学、英语各自独立成一个部分，按顺序命题）：
${parts.map(p => {
  if (p.qtypes.length) {
    const tally = {};
    p.qtypes.forEach(t => { tally[t] = (tally[t] || 0) + 1; });
    return `- ${EXAM_SUBJECT_DESC[p.subject]}，共 ${p.qtypes.length} 题，题型与数量严格为：${Object.entries(tally).map(([t, n]) => `${t}×${n}`).join('、')}，不得增减题型`;
  }
  return `- ${EXAM_SUBJECT_DESC[p.subject]}，共 ${p.count} 题`;
}).join('\n')}
命题总要求：
- 题型结构完整仿中考：语文=积累运用选择/古诗文默写/现代文阅读理解/名著阅读/作文；数学=选择/填空/解答；英语=单选/完形填空/阅读理解/书面表达
- 难度：${difficulty}（easy=基础、medium=中等、hard=拔高）；${grade === 'zk' || Number(grade) >= 7 ? '选材、设问方式与难度梯度贴合中考真题风格' : '知识与难度严格符合该年级课标，仅题型结构仿中考'}
${trend ? TREND_DIRECTIVE + '- 每个学科至少 1 道新题型（真实情境化 / 跨学科融合 / 开放性设问 / 新材料）\n' : ''}- 主题/关键词：${keyword || '不限'}
- 数学严禁出现需要画图、作图、识图的题目；几何内容一律以文字描述图形，让学生计算或证明
- 题目符合课标、表述准确严谨、无错别字；选择题正确答案唯一且干扰项有质量；填空题答案简洁唯一
- 阅读理解/完形填空必须把阅读材料原文放入 passage 字段，材料语言规范、难度适配年级、有考查价值；设问覆盖不同能力层级（信息筛选/理解分析/赏析评价/推断探究）
- 作文题 stem 必须包含：作文题目 + 写作要求（文体、角度、字数建议）；answer 给出审题指导、参考立意与高分范文要点（80 字以内）
- 分值参考：选择/填空 2-3 分，阅读理解/简答 4-6 分，解答题 6-10 分，完形填空 10 分，作文 40-60 分
- 题干/选项/材料/解析中如需引用，一律使用中文引号「」，JSON 字符串内禁止出现未转义的英文双引号
- 严格返回 JSON，不要任何解释或 markdown 代码块包装

JSON Schema:
{
  "questions": [
    {
      "subject": "语文|数学|英语",
      "qtype": "选择题|填空题|解答题|简答题|阅读理解|完形填空|作文题",
      "passage": "仅阅读理解/完形填空/材料题填写阅读材料原文（完形填空的文后选项也放这里），其余题型填空字符串",
      "stem": "题干；作文题=题目与写作要求（含字数建议）；填空题空格用 ____ 表示",
      "choices": ["仅选择题：4 个选项内容，不含 A. 前缀"],
      "answer": "选择题填 A/B/C/D；完形填空按题号依次给出如 1.A 2.B 3.C；作文题给审题指导与范文要点；其余填参考答案（解答题给关键步骤与结果）",
      "explanation": "一句话解析",
      "points": 3
    }
  ]
}`;

/* 修复字符串内未转义的英文双引号（模型输出中文内容时的常见病）：
 * 状态机逐字符扫描——字符串外遇 " 进入字符串；字符串内遇 " 时，
 * 若其后紧跟结构符（, } ] :）则视为闭合引号，否则为内层引号，转义之 */
function repairInnerQuotes(s) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && inStr) { out += ch + (s[i + 1] || ''); i++; continue; }
    if (ch === '"') {
      if (!inStr) { inStr = true; out += ch; continue; }
      if (/^\s*[,}\]:]/.test(s.slice(i + 1))) { inStr = false; out += ch; }
      else { out += '\\"'; }
      continue;
    }
    out += ch;
  }
  return out;
}

/* AI 返回文本的容错 JSON 解析：剥离 ```json 包装 → 截取首个 { 到末个 } → 内层引号修复 */
function parseJsonLoose(text) {
  const clean = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  const sliced = first >= 0 && last > first ? clean.slice(first, last + 1) : clean;
  try { return JSON.parse(sliced); } catch { /* fallthrough */ }
  try { return JSON.parse(repairInnerQuotes(sliced)); } catch (e) {
    console.warn('[parseJsonLoose] 修复后仍失败:', e.message);
  }
  return null;
}

/* ===== POST /api/ai/exam  生成综合测试卷（分科调用，每科可带 qtypes 题型约束，扣 2 算力/次） ===== */
router.post('/exam', ah(async (req, res) => {
  const { grade = '9', difficulty = 'medium', keyword = '', trend = true } = req.body || {};
  /* subjects: [{ subject: 'chinese'|'math'|'english', count, qtypes? }]
   * qtypes = 题型约束数组（每个元素一题，同题型重复出现表示多题，如 ['选择题','选择题','填空题']），
   * 用于精练模式（同类型只留一题）与整卷模式（仿中考题型结构）的精确控制 */
  const raw = Array.isArray(req.body?.subjects) ? req.body.subjects : [];
  const parts = raw
    .filter(p => p && EXAM_SUBJECT_DESC[p.subject])
    .map(p => ({
      subject: p.subject,
      count: Math.max(0, Math.min(25, Number(p.count) || 0)),
      qtypes: Array.isArray(p.qtypes) ? p.qtypes.filter(t => EXAM_QTYPES.includes(t)).slice(0, 25) : [],
    }))
    .map(p => ({ ...p, count: p.qtypes.length ? p.qtypes.length : p.count }))
    .filter(p => p.count > 0);
  const total = parts.reduce((s, p) => s + p.count, 0);
  if (!parts.length) return res.status(400).json({ error: '请至少选择一个学科并设置题量' });
  if (total > 25) return res.status(400).json({ error: '单次生成最多 25 题，更多题量会自动分批' });

  const result = await chat([
    { role: 'system', content: SYSTEM_EXAM(grade, difficulty, parts, !!trend, keyword) },
    { role: 'user', content: `请生成综合测试卷，共 ${total} 道题。` },
  ], { maxTokens: 8000 });
  const parsed = parseJsonLoose(result.choices?.[0]?.message?.content);
  const rawQs = Array.isArray(parsed?.questions) ? parsed.questions : [];
  if (!rawQs.length) {
    console.error('[ai/exam] 解析失败 len=%d finish=%s',
      String(result.choices?.[0]?.message?.content || '').length, result.choices?.[0]?.finish_reason);
    return res.status(502).json({ error: 'AI 返回解析失败' });
  }

  /* 归一化：学科映射回 key、按科限量（qtypes 模式按题型配额取题）、注入元信息 */
  const byKey = { chinese: [], math: [], english: [] };
  rawQs.forEach(q => {
    if (!q || typeof q !== 'object' || !String(q.stem || '').trim()) return;
    const k = EXAM_SUBJ_KEY[q.subject] || parts[0].subject;
    byKey[k].push(q);
  });
  const norm = (q, subject) => {
    const choices = Array.isArray(q.choices) ? q.choices.map(c => String(c).trim()).filter(Boolean).slice(0, 4) : [];
    const qtype = EXAM_QTYPES.includes(q.qtype) ? q.qtype : (choices.length >= 2 ? '选择题' : '填空题');
    const passage = String(q.passage || '').trim();
    const pts = Number(q.points);
    const maxPts = qtype === '作文题' ? 60 : 20;
    return {
      id: `ai-exam-${Date.now()}-${questions.length}`,
      grade, difficulty, topic: keyword || '综合测试',
      subject,
      qtype,
      stem: String(q.stem).trim(),
      ...(passage ? { passage } : {}),
      ...(qtype === '选择题' ? { choices, answer: String(q.answer || 'A').trim().toUpperCase().slice(0, 1) } : { answer: String(q.answer ?? '').trim() }),
      explanation: String(q.explanation || '').trim(),
      points: pts > 0 ? Math.min(maxPts, pts) : (EXAM_POINTS[qtype] || 3),
    };
  };
  const questions = [];
  for (const p of parts) {
    if (p.qtypes.length) {
      /* qtypes 模式：按题型配额取题（AI 超出配额的多余题丢弃、不足则有多少取多少） */
      const need = {};
      p.qtypes.forEach(t => { need[t] = (need[t] || 0) + 1; });
      for (const [t, n] of Object.entries(need)) {
        byKey[p.subject].filter(q => (EXAM_QTYPES.includes(q.qtype) ? q.qtype : '填空题') === t).slice(0, n)
          .forEach(q => questions.push(norm(q, p.subject)));
      }
    } else {
      byKey[p.subject].slice(0, p.count).forEach(q => questions.push(norm(q, p.subject)));
    }
  }
  if (!questions.length) return res.status(502).json({ error: 'AI 返回解析失败' });

  const cost = COSTS.exam;
  const charged = await charge(req.teacherId, cost);
  db.run(
    `INSERT INTO ai_history (teacher_id, type, grade, difficulty, count, keyword, questions, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [req.teacherId, 'exam', String(grade), difficulty, questions.length,
     keyword || parts.map(p => `${EXAM_SUBJECT_DESC[p.subject].slice(0, 2)}${p.count}`).join('/'),
     JSON.stringify(questions), cost]
  ).catch(err => console.warn('[ai] history save failed:', err.message));
  res.json({ questions, cost, credits: charged.credits, usage: result.usage });
}));

/* ===== POST /api/ai/practice  课堂练习（全科目：科目+课题+知识点+题型清单，扣 2 算力） ===== */
router.post('/practice', ah(async (req, res) => {
  const { subject, grade, topic, knowledge = '', prompt = '' } = req.body || {};
  /* items: [{ qtype, count }] —— 题型自由（选择/填空/判断/简答/论述/计算…），非语数英白名单 */
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const items = rawItems
    .map(i => ({ qtype: String(i?.qtype || '').trim().slice(0, 12), count: Math.max(0, Math.min(10, Number(i?.count) || 0)) }))
    .filter(i => i.qtype && i.count > 0);
  const total = items.reduce((s, i) => s + i.count, 0);
  if (!String(subject || '').trim()) return res.status(400).json({ error: '请选择科目' });
  if (!String(topic || '').trim()) return res.status(400).json({ error: '请填写本节课课题' });
  if (!items.length) return res.status(400).json({ error: '请至少设置一种题型与数量' });
  if (total > 10) return res.status(400).json({ error: '课堂练习最多 10 题，适合 5-10 分钟课堂检测' });

  const sys = `你是${String(subject).trim()}资深教师与命题专家，深谙${GRADE_DESC(String(grade || '7'))}课程标准与课堂教学节奏。请为课堂练习命题：紧扣课题与知识点、题干表述规范、难度适合课堂 5-10 分钟即时检测；选择题给 4 个选项；论述/简答题答案给评分要点；每题附简要解析。`;
  const user = `【课题】《${String(topic).trim()}》
【科目】${String(subject).trim()}
【年级】${GRADE_DESC(String(grade || '7'))}
【知识点】${String(knowledge || '本节课核心内容')}
【题型与数量】${items.map(i => `${i.qtype}×${i.count}`).join('、')}（不得增减题型与数量）
【老师确认的命题描述词】
${String(prompt || '').trim() || '（无补充要求）'}

请严格按题型与数量命制，返回 JSON（不要 markdown 包装，字符串内引用一律用「」）：
{"questions": [{"qtype":"题型","stem":"题干","choices":["选项A","选项B","选项C","选项D"],"answer":"答案（选择题为字母，论述/简答为评分要点）","explanation":"简要解析","points":分值}]}`;

  const result = await chat([
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ], { maxTokens: 6000 });
  const parsed = parseJsonLoose(result.choices?.[0]?.message?.content);
  const rawQs = Array.isArray(parsed?.questions) ? parsed.questions : [];

  /* 归一化（qtype 保留用户/模型原值，不套语数英白名单；按题型配额限量） */
  const questions = [];
  const tally = {};
  items.forEach(i => { tally[i.qtype] = (tally[i.qtype] || 0) + i.count; });
  for (const q of rawQs) {
    if (!q || typeof q !== 'object' || !String(q.stem || '').trim()) continue;
    const t = String(q.qtype || '').trim().slice(0, 12);
    if (!t || !tally[t]) continue;          // 非约定题型丢弃
    if (tally[t] <= 0) continue;
    tally[t]--;
    const choices = Array.isArray(q.choices) ? q.choices.map(c => String(c).trim()).filter(Boolean).slice(0, 4) : [];
    const pts = Number(q.points);
    questions.push({
      id: `ai-practice-${Date.now()}-${questions.length}`,
      grade: String(grade || ''), subject: String(subject).trim(),
      topic: String(topic).trim(), qtype: t,
      stem: String(q.stem).trim(),
      ...(choices.length ? { choices } : {}),
      answer: String(q.answer ?? '').trim(),
      explanation: String(q.explanation || '').trim(),
      points: pts > 0 ? Math.min(20, pts) : (/选择|填空|判断/.test(t) ? 3 : /论述|计算|应用/.test(t) ? 6 : 4),
    });
  }
  if (!questions.length) return res.status(502).json({ error: 'AI 返回解析失败' });

  const cost = COSTS.practice;
  const charged = await charge(req.teacherId, cost);
  db.run(
    `INSERT INTO ai_history (teacher_id, type, grade, difficulty, count, keyword, questions, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [req.teacherId, 'practice', String(grade || ''), 'medium', questions.length,
     `${String(subject).trim()}·${String(topic).trim()}`,
     JSON.stringify(questions), cost]
  ).catch(err => console.warn('[ai] history save failed:', err.message));
  res.json({ questions, cost, credits: charged.credits, requested: total, usage: result.usage });
}));

/* ===== POST /api/ai/regenerate  单题重出：按改进提示词重新命制 1 题替换（扣 1 算力） ===== */
router.post('/regenerate', ah(async (req, res) => {
  const { type, question, feedback = '' } = req.body || {};
  if (!type || !TYPE_PROMPT[type]) return res.status(400).json({ error: 'type 不合法' });
  if (!question || typeof question !== 'object') return res.status(400).json({ error: 'question 必填' });
  const fb = String(feedback).trim().slice(0, 200);
  if (!fb) return res.status(400).json({ error: '请填写改进提示词' });

  /* 去掉内部字段后作为参考原题 */
  const original = { ...question };
  delete original.id; delete original.groupIndex; delete original.groupSize;
  delete original.grade; delete original.difficulty; delete original.topic;
  const prompt = `题型：${TYPE_PROMPT[type] || type}
参考原题（JSON）：
${JSON.stringify(original, null, 2)}

老师对这道题不满意，改进要求：${fb}

请按改进要求重新命制 1 道题替换原题——保持学科、题型、字段结构、年级与难度不变，仅按改进要求调整素材/情境/考点/表述。严格返回 JSON，不要 markdown 包装：
{"question": {…与原题同结构…}}`;
  const result = await chat([{ role: 'user', content: prompt }], { maxTokens: 2500 });
  const parsed = parseJsonLoose(result.choices?.[0]?.message?.content);
  const q = parsed?.question;
  if (!q || typeof q !== 'object') return res.status(502).json({ error: 'AI 返回解析失败' });

  /* 清洗并继承原题上下文（学科/题型不信任 AI 改动，强制沿用原题） */
  const out = {
    id: `ai-regen-${Date.now()}`,
    grade: question.grade || '', difficulty: question.difficulty || 'medium',
    topic: `单题重出${question.topic ? ` · ${question.topic}` : ''}`,
    ...q,
    ...(question.subject ? { subject: question.subject } : {}),
    ...(question.qtype ? { qtype: question.qtype } : {}),
  };
  if (!String(out.stem || out.sentence || out.word || out.passage || out.pinyin || '').trim()) {
    return res.status(502).json({ error: 'AI 返回解析失败' });
  }
  const cost = COSTS.regenerate;
  const charged = await charge(req.teacherId, cost);
  const preview = String(out.stem || out.sentence || out.word || out.passage || out.pinyin || '').slice(0, 150);
  db.run(
    `INSERT INTO ai_history (teacher_id, type, grade, difficulty, count, keyword, questions, cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [req.teacherId, `regen-${type}`, String(question.grade || ''), question.difficulty || 'medium', 1,
     `单题重出 · ${fb.slice(0, 60)} · ${preview.slice(0, 60)}`, JSON.stringify([out]), cost]
  ).catch(err => console.warn('[ai] history save failed:', err.message));
  res.json({ question: out, cost, credits: charged.credits, usage: result.usage });
}));

module.exports = router;
