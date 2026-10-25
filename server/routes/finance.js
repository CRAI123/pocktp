/**
 * 运营台账路由：课时记录（课时费统计 / 教师工作量统计）
 * 数据按 teacher_id 隔离，班级归属走 own.class 校验
 */
const express = require('express');
const db = require('../db');
const { own, financeRequired } = require('../auth');
const { ah } = require('../util');

const router = express.Router();
const MONTH_RE = /^\d{4}-\d{2}$/;

/* 功能权限：课时费与工作量默认关闭，由管理员在后台分配后才能访问
 * 限定在 /lesson-logs 路径上，避免影响同挂载点下的其他业务路由 */
router.use('/lesson-logs', financeRequired);

/* 课时记录列表 + 本月汇总（按班级分组）+ 近 12 月趋势；month=all 时返回全部记录（供台账导出） */
router.get('/lesson-logs', ah(async (req, res) => {
  const all = req.query.month === 'all';
  const month = MONTH_RE.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const { class_id, course_id } = req.query;
  const conds = ['l.teacher_id = ?'];
  const params = [req.teacherId];
  if (!all) { conds.push('l.date LIKE ?'); params.push(`${month}-%`); }
  if (class_id) { conds.push('l.class_id = ?'); params.push(class_id); }
  if (course_id) { conds.push('l.course_id = ?'); params.push(course_id); }

  const [rows, byClass, months] = await Promise.all([
    db.all(`SELECT l.*, c.name AS class_name, co.name AS course_name, co.subject
            FROM lesson_logs l
            LEFT JOIN classes c ON c.id = l.class_id
            LEFT JOIN courses co ON co.id = l.course_id
            WHERE ${conds.join(' AND ')}
            ORDER BY l.date DESC, l.id DESC LIMIT 3000`, params),
    db.all(`SELECT COALESCE(c.name, '未分班') AS class_name, COUNT(*) AS count,
                   COALESCE(SUM(l.hours), 0) AS hours, COALESCE(SUM(l.hours * l.rate), 0) AS fee
            FROM lesson_logs l LEFT JOIN classes c ON c.id = l.class_id
            WHERE l.teacher_id = ? AND l.date LIKE ?
            GROUP BY c.id, c.name ORDER BY hours DESC`, [req.teacherId, `${month}-%`]),
    db.all(`SELECT substring(l.date, 1, 7) AS month, COALESCE(SUM(l.hours), 0) AS hours,
                   COALESCE(SUM(l.hours * l.rate), 0) AS fee, COUNT(*) AS count
            FROM lesson_logs l WHERE l.teacher_id = ?
            GROUP BY substring(l.date, 1, 7) ORDER BY month DESC LIMIT 12`, [req.teacherId]),
  ]);

  const hours = rows.reduce((s, r) => s + Number(r.hours), 0);
  const fee = rows.reduce((s, r) => s + Number(r.hours) * Number(r.rate), 0);
  res.json({
    month,
    rows,
    summary: {
      count: rows.length,
      hours: +hours.toFixed(2),
      fee: +fee.toFixed(2),
      byClass: byClass.map(b => ({ ...b, hours: +Number(b.hours).toFixed(2), fee: +Number(b.fee).toFixed(2) })),
    },
    months: months.reverse().map(m => ({ ...m, hours: +Number(m.hours).toFixed(2), fee: +Number(m.fee).toFixed(2) })),
  });
}));

/* 新增课时记录：{ class_id?, course_id?, date, hours, rate, note } */
router.post('/lesson-logs', ah(async (req, res) => {
  const { class_id, course_id, date, hours, rate, note } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date 必填' });
  if (class_id && !(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  if (course_id) {
    const co = await db.get('SELECT id FROM courses WHERE id = ? AND teacher_id = ?', [course_id, req.teacherId]);
    if (!co) return res.status(403).json({ error: '课程不存在' });
  }
  const info = await db.run(
    'INSERT INTO lesson_logs (teacher_id, class_id, course_id, date, hours, rate, note) VALUES (?,?,?,?,?,?,?)',
    [req.teacherId, class_id || null, course_id || null, date,
      Math.max(0, Number(hours) || 0), Math.max(0, Number(rate) || 0), note || '']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* 修改课时记录 */
router.put('/lesson-logs/:id', ah(async (req, res) => {
  const row = await db.get('SELECT id FROM lesson_logs WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  const { class_id, course_id, date, hours, rate, note } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date 必填' });
  if (class_id && !(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  await db.run(
    'UPDATE lesson_logs SET class_id = ?, course_id = ?, date = ?, hours = ?, rate = ?, note = ? WHERE id = ?',
    [class_id || null, course_id || null, date, Math.max(0, Number(hours) || 0), Math.max(0, Number(rate) || 0), note || '', req.params.id]
  );
  res.json({ ok: true });
}));

router.delete('/lesson-logs/:id', ah(async (req, res) => {
  const row = await db.get('SELECT id FROM lesson_logs WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM lesson_logs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
