/**
 * 管理后台接口（仅 is_admin 教师可访问）：
 * - 批量生成激活码 / 列表筛选 / 作废
 * - 教师用户列表（含激活状态与数据规模）
 */
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { ah } = require('../util');

const router = express.Router();

/* 管理员鉴权：token 有效且 is_admin */
router.use(ah(async (req, res, next) => {
  const t = await db.get('SELECT is_admin FROM teachers WHERE id = ?', [req.teacherId]);
  if (!t?.is_admin) return res.status(403).json({ error: '无权访问管理后台' });
  next();
}));

/* 无歧义字符集（去除 0/O/1/I） */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  const bytes = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += CHARSET[bytes[i] % CHARSET.length];
  return s;
}

/* 批量生成激活码
 * 注意：Vercel Serverless 有 60s 上限，而库在东京、单条 INSERT 往返约 150ms，
 * 逐条插入 500 个需要 70s+ 必然超时（浏览器表现为 ERR_CONNECTION_CLOSED）。
 * 这里改为「内存生成去重 + 单条多值 INSERT」，整批只需一次数据库往返。 */
router.post('/codes', ah(async (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body?.count, 10) || 1, 1), 500);
  const batch = String(req.body?.batch || '').trim().slice(0, 50);
  const note = String(req.body?.note || '').trim().slice(0, 200);
  const parsedCredits = parseInt(req.body?.credits, 10);
  const credits = Math.min(Math.max(Number.isFinite(parsedCredits) ? parsedCredits : 1000, 0), 10000000);

  /* 激活后有效天数：0=永久；默认 7 天 */
  const parsedDays = parseInt(req.body?.validDays, 10);
  const validDays = Math.min(Math.max(Number.isFinite(parsedDays) ? parsedDays : 7, 0), 3650);

  /* 可选：码本身的兑换截止日（一般不用，留空=随时可兑） */
  const expiresAt = String(req.body?.expiresAt || '').trim();
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    return res.status(400).json({ error: '兑换截止日格式应为 YYYY-MM-DD' });
  }

  /* 一次生成整批并在内存内去重（32^16 码空间下与库内撞码概率可忽略，
   * 万一撞唯一约束（23505），整批重新生成重试一次） */
  const genBatch = () => {
    const set = new Set();
    while (set.size < count) set.add(genCode());
    return [...set];
  };

  const buildSql = (codes) => {
    /* VALUES ($1,$2,$3,$4,$5,$6),($7,...) —— 占位符由 db 层统一转义 */
    const rows = codes.map(() => '(?,?,?,?,?,?)').join(',');
    return `INSERT INTO activation_codes (code, batch, note, expires_at, credits, valid_days) VALUES ${rows}`;
  };

  let created = genBatch();
  try {
    const params = created.flatMap(c => [c, batch, note, expiresAt, credits, validDays]);
    await db.run(buildSql(created), params);
  } catch (e) {
    if (e.code !== '23505') throw e;
    created = genBatch();
    const params = created.flatMap(c => [c, batch, note, expiresAt, credits, validDays]);
    await db.run(buildSql(created), params);
  }
  res.json({ created, count: created.length, credits, validDays });
}));

/* 激活码列表 + 统计 */
router.get('/codes', ah(async (req, res) => {
  const { status, batch } = req.query;
  const conds = [], args = [];
  if (status && ['unused', 'used', 'revoked'].includes(status)) { conds.push('ac.status = ?'); args.push(status); }
  if (batch) { conds.push('ac.batch = ?'); args.push(String(batch)); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const list = await db.all(`
    SELECT ac.*, t.name AS used_by_name, t.phone AS used_by_phone
    FROM activation_codes ac LEFT JOIN teachers t ON t.id = ac.used_by
    ${where} ORDER BY ac.id DESC LIMIT 500
  `, args);

  const stats = {};
  (await db.all('SELECT status, COUNT(*) n FROM activation_codes GROUP BY status'))
    .forEach(r => { stats[r.status] = r.n; });
  const batches = (await db.all("SELECT DISTINCT batch FROM activation_codes WHERE batch != '' ORDER BY batch DESC")).map(r => r.batch);

  res.json({ list, stats: { unused: 0, used: 0, revoked: 0, ...stats }, batches });
}));

/* 作废（仅限未使用的码） */
router.post('/codes/:id/revoke', ah(async (req, res) => {
  const r = await db.run("UPDATE activation_codes SET status = 'revoked' WHERE id = ? AND status = 'unused'", [req.params.id]);
  if (r.changes === 0) return res.status(409).json({ error: '仅未使用的激活码可作废' });
  res.json({ ok: true });
}));

/* 教师用户列表 */
router.get('/teachers', ah(async (req, res) => {
  const list = await db.all(`
    SELECT t.id, t.name, t.phone, t.activated, t.is_admin, t.credits, t.membership_expires_at, t.activated_at, t.created_at,
      (SELECT COUNT(*) FROM classes c WHERE c.teacher_id = t.id) AS classes,
      (SELECT COUNT(*) FROM students s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = t.id) AS students,
      (SELECT COUNT(*) FROM activation_codes ac WHERE ac.used_by = t.id) AS used_count,
      (SELECT ac.code FROM activation_codes ac WHERE ac.used_by = t.id
         ORDER BY ac.used_at DESC NULLS LAST, ac.id DESC LIMIT 1) AS used_code
    FROM teachers t ORDER BY t.id DESC LIMIT 500
  `);
  res.json(list.map(t => ({ ...t, activated: !!t.activated, is_admin: !!t.is_admin })));
}));

/* 本地日期工具（与 activation.js 同语义：YYYY-MM-DD 本地时区） */
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const datePlus = (base, n) => { const d = new Date(`${base}T00:00:00`); d.setDate(d.getDate() + n); return localDate(d); };

/* 给用户延长会员时长：{ days } —— days>0 从 max(今天, 现到期日) 叠加（同兑换续费语义）；days=0 置为永久。
 * 顺带激活未激活账号，并清激活状态缓存让下一次请求立即生效 */
router.post('/teachers/:id/extend', ah(async (req, res) => {
  const t = await db.get('SELECT id, is_admin, membership_expires_at FROM teachers WHERE id = ?', [req.params.id]);
  if (!t) return res.status(404).json({ error: '用户不存在' });
  if (t.is_admin) return res.status(400).json({ error: '管理员账号无需延期' });
  const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 0, 0), 3650);
  const today = localDate();
  const newExpiry = days > 0
    ? datePlus(t.membership_expires_at && t.membership_expires_at >= today ? t.membership_expires_at : today, days)
    : null;
  await db.run(
    'UPDATE teachers SET activated = 1, activated_at = COALESCE(activated_at, ?), membership_expires_at = ? WHERE id = ?',
    [`${today} ${new Date().toTimeString().slice(0, 8)}`, newExpiry, t.id]
  );
  try { require('../auth').invalidateActivation(t.id); } catch (_) {}
  res.json({ ok: true, days, membership_expires_at: newExpiry || '' });
}));

module.exports = router;
