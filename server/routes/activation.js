/**
 * 激活码兑换（含续费）：
 * - 码为 16 位大写无歧义字符，输入时允许空格/横杠，自动归一化
 * - 核销为事务：码置为 used + 教师置为已激活，防并发重复使用
 * - 码上的 valid_days = 激活后有效天数（0=永久）；兑换后写教师 membership_expires_at
 * - 未过期续费时，有效期在现有到期日上叠加；已过期则从今天重新起算
 * - 码上的 expires_at 为「兑换截止日」（可选，一般留空）
 */
const express = require('express');
const db = require('../db');
const { ah } = require('../util');

const router = express.Router();

function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const pad2 = n => String(n).padStart(2, '0');
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function datePlus(base, days) {
  const d = base ? new Date(`${base}T00:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return localDate(d);
}

router.post('/redeem', ah(async (req, res) => {
  const code = normalizeCode(req.body?.code);
  if (!code) return res.status(400).json({ error: '请输入激活码' });

  const teacher = await db.get('SELECT * FROM teachers WHERE id = ?', [req.teacherId]);
  if (!teacher) return res.status(404).json({ error: '账号不存在' });
  if (teacher.is_admin) return res.status(400).json({ error: '管理员账号无需激活' });

  const row = await db.get('SELECT * FROM activation_codes WHERE code = ?', [code]);
  if (!row) return res.status(404).json({ error: '激活码不存在，请核对后重试' });
  if (row.status === 'used') return res.status(409).json({ error: '该激活码已被使用' });
  if (row.status === 'revoked') return res.status(410).json({ error: '该激活码已被作废' });
  const today = localDate();
  if (row.expires_at && row.expires_at < today) {
    return res.status(410).json({ error: '该激活码已超过兑换期限' });
  }

  /* 计算新会员到期日：0 天=永久；否则从 max(今天, 现有到期日) 起加 N 天 */
  const validDays = row.valid_days ?? 7;
  const newExpiry = validDays > 0
    ? datePlus(teacher.membership_expires_at && teacher.membership_expires_at >= today ? teacher.membership_expires_at : today, validDays)
    : null;

  const now = `${today} ${new Date().toTimeString().slice(0, 8)}`;
  let newCredits = teacher.credits || 0;
  await db.transaction(async (tx) => {
    const r = await tx.run(
      "UPDATE activation_codes SET status = 'used', used_by = ?, used_at = ? WHERE id = ? AND status = 'unused'",
      [req.teacherId, now, row.id]
    );
    if (r.changes === 0) throw Object.assign(new Error('该激活码刚刚被使用'), { status: 409 });
    const t = await tx.run(
      `UPDATE teachers SET activated = 1, activated_at = COALESCE(activated_at, ?),
         credits = credits + ?, membership_expires_at = ? WHERE id = ?
       RETURNING credits, membership_expires_at`,
      [now, row.credits || 0, newExpiry, req.teacherId]
    );
    newCredits = t.rows?.[0]?.credits ?? newCredits;
  });

  /* 兑换成功后立即清缓存，让下一次请求拿到最新激活状态 */
  try { require('../auth').invalidateActivation(req.teacherId); } catch (_) {}

  const isRenewal = !!teacher.activated;
  const periodText = validDays > 0 ? `有效期至 ${newExpiry}（${validDays} 天）` : '永久有效';
  res.json({
    ok: true,
    renewal: isRenewal,
    credits_gained: row.credits || 0,
    credits: newCredits,
    valid_days: validDays,
    membership_expires_at: newExpiry || '',
    message: `${isRenewal ? '续费成功' : '激活成功'}，${periodText}，${row.credits || 0} 算力已到账`,
  });
}));

module.exports = router;
