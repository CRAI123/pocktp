/**
 * 认证与数据归属：
 * - scrypt 密码哈希（Node 内置 crypto，无额外依赖）
 * - HMAC-SHA256 签名 token（7 天有效），中间件鉴权
 * - 登录即注册：手机号未注册时自动创建账号
 * - activatedRequired：未激活账号禁止访问业务接口（管理员豁免）
 * - own.* 归属校验：防止跨教师越权访问
 */
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { ah } = require('./util');

const SECRET = process.env.APP_SECRET || 'teacher-workbench-demo-secret';
const TOKEN_TTL = 7 * 24 * 3600 * 1000;
/** 勾选「记住登录」后的有效期：桌面版下次打开可免密直接进入 */
const REMEMBER_TTL = 180 * 24 * 3600 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return h.length === stored.length && crypto.timingSafeEqual(h, stored);
}

function signToken(teacherId, ttl = TOKEN_TTL) {
  const payload = Buffer.from(JSON.stringify({ tid: teacherId, exp: Date.now() + ttl })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data.tid : null;
  } catch {
    return null;
  }
}

/** 鉴权中间件：通过后在 req.teacherId 挂载教师 ID */
function authRequired(req, res, next) {
  const tid = verifyToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!tid) return res.status(401).json({ error: '未登录或登录已过期' });
  req.teacherId = tid;
  next();
}

/** 本地日期 YYYY-MM-DD（按北京时间，避免 UTC 偏移） */
function localDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 账号是否处于有效会员期：管理员/永久（到期日为空）均有效 */
function membershipActive(t) {
  if (!t || t.is_admin) return true;
  return !t.membership_expires_at || t.membership_expires_at >= localDate();
}

/** 激活校验中间件：需先经 authRequired；未激活或会员到期且非管理员则拒绝
 *  加 60s 内存缓存，避免每次请求都打 Supabase 取一次会员状态 */
const activationCache = new Map(); // tid -> { ts, activated, is_admin, expires }
const ACTIVATION_TTL = 60_000;
const activatedRequired = ah(async (req, res, next) => {
  const tid = req.teacherId;
  const cached = activationCache.get(tid);
  let t;
  if (cached && Date.now() - cached.ts < ACTIVATION_TTL) {
    t = { activated: cached.activated, is_admin: cached.is_admin, membership_expires_at: cached.expires };
  } else {
    t = await db.get('SELECT activated, is_admin, membership_expires_at FROM teachers WHERE id = ?', [tid]);
    if (!t) return res.status(401).json({ error: '账号不存在' });
    activationCache.set(tid, { ts: Date.now(), activated: t.activated, is_admin: t.is_admin, expires: t.membership_expires_at });
  }
  if (!t) return res.status(401).json({ error: '账号不存在' });
  if (!t.activated && !t.is_admin) {
    return res.status(403).json({ error: '账号未激活，请先使用激活码激活', needActivation: true });
  }
  if (!membershipActive(t)) {
    return res.status(403).json({
      error: `会员已于 ${t.membership_expires_at} 到期，请使用新激活码续费`,
      needActivation: true,
      expired: true,
    });
  }
  next();
});

/** 在激活码续费 / 兑换成功后立即清掉缓存，让下一次请求拿到最新状态 */
function invalidateActivation(tid) { activationCache.delete(tid); }

/** 功能权限（课时费与工作量）：默认关闭，由管理员在后台按教师分配
 *  加 60s 内存缓存，避免每次请求都取一次教师记录 */
const featureCache = new Map(); // tid -> { ts, finance }
const FEATURE_TTL = 60_000;
function invalidateFeatures(tid) { featureCache.delete(tid); }

const financeRequired = ah(async (req, res, next) => {
  const tid = req.teacherId;
  const cached = featureCache.get(tid);
  let t;
  if (cached && Date.now() - cached.ts < FEATURE_TTL) {
    t = { finance_enabled: cached.finance, is_admin: cached.admin };
  } else {
    t = await db.get('SELECT finance_enabled, is_admin FROM teachers WHERE id = ?', [tid]);
    if (t) featureCache.set(tid, { ts: Date.now(), finance: t.finance_enabled, admin: t.is_admin });
  }
  if (!t) return res.status(401).json({ error: '账号不存在' });
  if (!t.finance_enabled && !t.is_admin) {
    return res.status(403).json({ error: '未开通「课时费与工作量」功能，请联系管理员开通', featureDenied: 'finance' });
  }
  next();
});

/** 数据归属校验（异步） */
const own = {
  class: async (tid, id) => !!(await db.get('SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?', [id, tid])),
  course: async (tid, id) => !!(await db.get('SELECT 1 FROM courses WHERE id = ? AND teacher_id = ?', [id, tid])),
  student: async (tid, id) => !!(await db.get(
    'SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.teacher_id = ?',
    [id, tid]
  )),
  assignment: async (tid, id) => !!(await db.get(
    'SELECT 1 FROM assignments a JOIN courses co ON co.id = a.course_id WHERE a.id = ? AND co.teacher_id = ?',
    [id, tid]
  )),
  submission: async (tid, id) => !!(await db.get(
    `SELECT 1 FROM submissions s JOIN assignments a ON a.id = s.assignment_id
     JOIN courses co ON co.id = a.course_id WHERE s.id = ? AND co.teacher_id = ?`,
    [id, tid]
  )),
};

/* ---------- 认证路由 ---------- */
const authRouter = express.Router();

authRouter.post('/login', ah(async (req, res) => {
  const { phone, password, name } = req.body || {};
  const remember = req.body?.remember === true || req.body?.remember === 1 || req.body?.remember === '1';
  if (!phone || !password) return res.status(400).json({ error: '手机号与密码必填' });
  const normalized = String(phone).trim();
  if (!/^1\d{10}$/.test(normalized)) return res.status(400).json({ error: '请输入 11 位有效手机号' });

  let teacher = await db.get('SELECT * FROM teachers WHERE phone = ?', [normalized]);
  let isNew = false;

  if (teacher) {
    if (!verifyPassword(password, teacher.salt, teacher.password_hash)) {
      return res.status(401).json({ error: '密码不正确' });
    }
  } else {
    // 无账号 → 直接注册（默认未激活）
    const displayName = (name || '').trim() || `老师${normalized.slice(-4)}`;
    if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    const { salt, hash } = hashPassword(password);
    const { lastInsertRowid } = await db.run(
      'INSERT INTO teachers (name, phone, email, password_hash, salt) VALUES (?,?,?,?,?)',
      [displayName, normalized, `${normalized}@phone.local`, hash, salt]
    );
    teacher = await db.get('SELECT * FROM teachers WHERE id = ?', [lastInsertRowid]);
    isNew = true;
  }

  const ttl = remember ? REMEMBER_TTL : TOKEN_TTL;
  res.json({
    token: signToken(teacher.id, ttl),
    teacher: publicTeacher(teacher),
    isNew,
    remember,
    expires_at: new Date(Date.now() + ttl).toISOString(),
  });
}));

/** 续期：静默延长登录状态（每次打开桌面版调用，免密登录窗口随之前移） */
authRouter.post('/refresh', authRequired, (req, res) => {
  const remember = !!req.body?.remember;
  const ttl = remember ? REMEMBER_TTL : TOKEN_TTL;
  res.json({ token: signToken(req.teacherId, ttl), expires_at: new Date(Date.now() + ttl).toISOString() });
});

authRouter.get('/me', authRequired, ah(async (req, res) => {
  const t = await db.get('SELECT * FROM teachers WHERE id = ?', [req.teacherId]);
  if (!t) return res.status(404).json({ error: '账号不存在' });
  res.json(publicTeacher(t));
}));

/** 返回给前端的教师公开信息 */
function publicTeacher(t) {
  return {
    id: t.id,
    name: t.name,
    phone: t.phone,
    activated: !!t.activated,
    is_admin: !!t.is_admin,
    finance_enabled: !!t.finance_enabled,
    credits: t.credits ?? 0,
    membership_expires_at: t.membership_expires_at || '',
    created_at: t.created_at,
  };
}

module.exports = { authRouter, authRequired, activatedRequired, financeRequired, own, invalidateActivation, invalidateFeatures };
