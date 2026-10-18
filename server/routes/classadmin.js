/**
 * 班主任班务模块路由：
 *  座次表 / 值日轮值 / 班委名单 / 家校沟通 / 德育量化 / 班费台账
 *  班会记录 / 班主任周记 / 成绩分析 / 考勤月报
 * 全部经 class/student 归属链按教师隔离（own.* 校验）
 */
const express = require('express');
const db = require('../db');
const { own } = require('../auth');
const { ah } = require('../util');

const router = express.Router();

/* 班级归属校验快捷包装：不通过直接 404 */
async function mustOwnClass(req, res) {
  const cid = req.params.classId;
  if (!(await own.class(req.teacherId, cid))) {
    res.status(404).json({ error: '班级不存在' });
    return null;
  }
  return cid;
}

/* ==================== 座次表 ==================== */

/* 读取班级座次：返回 rows（行数）/ cols（列数）/ grid（二维数组，元素为 {seat_id, student_id, name, disabled} 或 null） */
router.get('/classes/:classId/seats', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [seats, students] = await Promise.all([
    db.all(`SELECT s.id, s.row_idx, s.col_idx, s.student_id, s.disabled, st.name
            FROM seats s LEFT JOIN students st ON st.id = s.student_id
            WHERE s.class_id = ? ORDER BY s.row_idx, s.col_idx`, [cid]),
    db.all('SELECT id, name FROM students WHERE class_id = ? ORDER BY student_no', [cid]),
  ]);
  let rows = 0, cols = 0;
  for (const s of seats) { rows = Math.max(rows, s.row_idx + 1); cols = Math.max(cols, s.col_idx + 1); }
  /* 无布局时按学生数给默认 6 列 */
  if (!rows) { cols = 6; rows = Math.max(2, Math.ceil(students.length / cols)); }
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  for (const s of seats) {
    grid[s.row_idx][s.col_idx] = { seat_id: s.id, student_id: s.student_id, name: s.name || '', disabled: !!Number(s.disabled) };
  }
  res.json({ rows, cols, grid, students });
}));

/* 保存整个座次布局：{ rows, cols, cells: [{row, col, student_id|null, disabled?}] }（事务全量重建） */
router.put('/classes/:classId/seats', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { cells } = req.body || {};
  if (!Array.isArray(cells)) return res.status(400).json({ error: 'cells 必填' });
  /* 校验学生都属于该班 */
  const valid = new Set((await db.all('SELECT id FROM students WHERE class_id = ?', [cid])).map(r => r.id));
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM seats WHERE class_id = ?', [cid]);
    for (const c of cells) {
      const sid = c.student_id && valid.has(Number(c.student_id)) ? Number(c.student_id) : null;
      await tx.run('INSERT INTO seats (class_id, row_idx, col_idx, student_id, disabled) VALUES (?,?,?,?,?)',
        [cid, c.row, c.col, sid, c.disabled ? 1 : 0]);
    }
  });
  res.json({ ok: true });
}));

/* 自动轮换：前后排循环（最后一排移到第一排），每排内不动（保留过道标记） */
router.post('/classes/:classId/seats/rotate', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const seats = await db.all('SELECT row_idx, col_idx, student_id, disabled FROM seats WHERE class_id = ?', [cid]);
  if (!seats.length) return res.status(400).json({ error: '请先编排座次' });
  const maxRow = Math.max(...seats.map(s => s.row_idx));
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM seats WHERE class_id = ?', [cid]);
    for (const s of seats) {
      const newRow = (s.row_idx + 1) % (maxRow + 1);
      await tx.run('INSERT INTO seats (class_id, row_idx, col_idx, student_id, disabled) VALUES (?,?,?,?,?)',
        [cid, newRow, s.col_idx, s.student_id, Number(s.disabled) ? 1 : 0]);
    }
  });
  res.json({ ok: true });
}));

/* ==================== 值日分组 ==================== */

router.get('/classes/:classId/duty-groups', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [groups, students] = await Promise.all([
    db.all('SELECT * FROM duty_groups WHERE class_id = ? ORDER BY sort_order, id', [cid]),
    db.all('SELECT id, name FROM students WHERE class_id = ? ORDER BY student_no', [cid]),
  ]);
  const nameOf = Object.fromEntries(students.map(s => [s.id, s.name]));
  res.json({
    groups: groups.map(g => ({
      ...g,
      members: (JSON.parse(g.member_ids || '[]')).map(id => ({ id, name: nameOf[id] || '?' })),
    })),
    students,
  });
}));

/* 保存全部分组：{ groups: [{id?, name, member_ids:[...] }] }（事务全量重建） */
router.put('/classes/:classId/duty-groups', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { groups } = req.body || {};
  if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups 必填' });
  const valid = new Set((await db.all('SELECT id FROM students WHERE class_id = ?', [cid])).map(r => r.id));
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM duty_groups WHERE class_id = ?', [cid]);
    for (const [i, g] of groups.entries()) {
      const ids = (g.member_ids || []).map(Number).filter(id => valid.has(id));
      await tx.run('INSERT INTO duty_groups (class_id, name, member_ids, sort_order) VALUES (?,?,?,?)',
        [cid, g.name || `第${i + 1}组`, JSON.stringify(ids), i]);
    }
  });
  res.json({ ok: true });
}));

/* 一键自动分组：{ size = 5 } 按学号顺序均分 */
router.post('/classes/:classId/duty-groups/auto', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const size = Math.max(2, Math.min(12, Number(req.body?.size) || 5));
  const students = await db.all('SELECT id FROM students WHERE class_id = ? ORDER BY student_no', [cid]);
  if (!students.length) return res.status(400).json({ error: '班级暂无学生' });
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM duty_groups WHERE class_id = ?', [cid]);
    for (let i = 0, gi = 0; i < students.length; i += size, gi++) {
      const ids = students.slice(i, i + size).map(s => s.id);
      await tx.run('INSERT INTO duty_groups (class_id, name, member_ids, sort_order) VALUES (?,?,?,?)',
        [cid, `第${gi + 1}组`, JSON.stringify(ids), gi]);
    }
  });
  res.json({ ok: true, count: Math.ceil(students.length / size) });
}));

/* ==================== 班委名单 ==================== */

router.get('/classes/:classId/committees', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [rows, students] = await Promise.all([
    db.all(`SELECT cm.*, s.name AS student_name FROM class_committees cm
            JOIN students s ON s.id = cm.student_id
            WHERE cm.class_id = ? ORDER BY cm.id`, [cid]),
    db.all('SELECT id, name FROM students WHERE class_id = ? ORDER BY student_no', [cid]),
  ]);
  res.json({ committees: rows, students });
}));

router.post('/classes/:classId/committees', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { student_id, role, duty } = req.body || {};
  if (!student_id || !role) return res.status(400).json({ error: 'student_id 与 role 必填' });
  if (!(await own.student(req.teacherId, student_id))) return res.status(403).json({ error: '无权使用该学生' });
  await db.run(`INSERT INTO class_committees (class_id, student_id, role, duty) VALUES (?,?,?,?)
                ON CONFLICT(class_id, student_id, role) DO UPDATE SET duty = excluded.duty`,
    [cid, student_id, role, duty || '']);
  res.status(201).json({ ok: true });
}));

router.delete('/committees/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT cm.id FROM class_committees cm JOIN classes c ON c.id = cm.class_id
                          WHERE cm.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM class_committees WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 家校沟通 ==================== */

/* 家长通讯录：学生 + 家长电话/微信 + 最近沟通时间 */
router.get('/classes/:classId/parents', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const rows = await db.all(`
    SELECT s.id, s.name, s.gender, s.student_no, s.parent_phone, s.parent_wechat,
           (SELECT MAX(h.contacted_at) FROM home_visit_logs h WHERE h.student_id = s.id) AS last_contact,
           (SELECT COUNT(*) FROM home_visit_logs h WHERE h.student_id = s.id) AS contact_count
    FROM students s WHERE s.class_id = ? ORDER BY s.student_no`, [cid]);
  res.json(rows);
}));

router.get('/students/:studentId/visit-logs', ah(async (req, res) => {
  if (!(await own.student(req.teacherId, req.params.studentId))) return res.status(404).json({ error: '学生不存在' });
  res.json(await db.all('SELECT * FROM home_visit_logs WHERE student_id = ? ORDER BY contacted_at DESC, id DESC', [req.params.studentId]));
}));

router.post('/students/:studentId/visit-logs', ah(async (req, res) => {
  if (!(await own.student(req.teacherId, req.params.studentId))) return res.status(404).json({ error: '学生不存在' });
  const { contact_type, content, contacted_at } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content 必填' });
  const info = await db.run(
    'INSERT INTO home_visit_logs (student_id, contact_type, content, contacted_at) VALUES (?,?,?,?)',
    [req.params.studentId, contact_type || '电话', content, contacted_at || new Date().toISOString().slice(0, 10)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/visit-logs/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT h.id FROM home_visit_logs h
                          JOIN students s ON s.id = h.student_id JOIN classes c ON c.id = s.class_id
                          WHERE h.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM home_visit_logs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 德育量化 ==================== */

/* 班级德育总览：排行榜（总分明细）+ 最近记录 */
router.get('/classes/:classId/moral', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [ranking, recent] = await Promise.all([
    db.all(`
      SELECT s.id AS student_id, s.name, s.student_no,
             COALESCE(SUM(m.score), 0) AS total,
             COUNT(m.id) AS record_count
      FROM students s LEFT JOIN moral_scores m ON m.student_id = s.id
      WHERE s.class_id = ? GROUP BY s.id, s.name, s.student_no
      ORDER BY total DESC, s.student_no`, [cid]),
    db.all(`
      SELECT m.*, s.name AS student_name FROM moral_scores m
      JOIN students s ON s.id = m.student_id
      WHERE s.class_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 50`, [cid]),
  ]);
  res.json({ ranking, recent });
}));

/* 批量加减分：{ items: [{student_id, score, reason, category, date}] } */
router.post('/classes/:classId/moral', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items 必填' });
  const valid = new Set((await db.all('SELECT id FROM students WHERE class_id = ?', [cid])).map(r => r.id));
  const today = new Date().toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    for (const i of items) {
      if (!valid.has(Number(i.student_id))) continue;
      if (!Number(i.score) || !i.reason) continue;
      await tx.run('INSERT INTO moral_scores (student_id, score, reason, category, date) VALUES (?,?,?,?,?)',
        [i.student_id, Number(i.score), i.reason, i.category || '课堂表现', i.date || today]);
    }
  });
  res.json({ ok: true });
}));

router.delete('/moral-scores/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT m.id FROM moral_scores m
                          JOIN students s ON s.id = m.student_id JOIN classes c ON c.id = s.class_id
                          WHERE m.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM moral_scores WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 班费台账 ==================== */

router.get('/classes/:classId/funds', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [records, sum] = await Promise.all([
    db.all('SELECT * FROM class_funds WHERE class_id = ? ORDER BY date DESC, id DESC LIMIT 200', [cid]),
    db.get(`SELECT
        COALESCE(SUM(CASE WHEN type = '收入' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = '支出' THEN amount ELSE 0 END), 0) AS expense
      FROM class_funds WHERE class_id = ?`, [cid]),
  ]);
  res.json({ records, income: sum.income, expense: sum.expense, balance: +(sum.income - sum.expense).toFixed(2) });
}));

router.post('/classes/:classId/funds', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { type, amount, item, date, remark } = req.body || {};
  if (!amount || !item) return res.status(400).json({ error: 'amount 与 item 必填' });
  const info = await db.run(
    'INSERT INTO class_funds (class_id, type, amount, item, date, remark) VALUES (?,?,?,?,?,?)',
    [cid, type === '收入' ? '收入' : '支出', Math.abs(Number(amount)), item,
     date || new Date().toISOString().slice(0, 10), remark || '']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/funds/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT f.id FROM class_funds f JOIN classes c ON c.id = f.class_id
                          WHERE f.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM class_funds WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 班会记录 ==================== */

router.get('/classes/:classId/meetings', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  res.json(await db.all('SELECT * FROM class_meetings WHERE class_id = ? ORDER BY meeting_date DESC, id DESC', [cid]));
}));

router.post('/classes/:classId/meetings', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { title, content, meeting_date } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title 必填' });
  const info = await db.run(
    'INSERT INTO class_meetings (class_id, title, content, meeting_date) VALUES (?,?,?,?)',
    [cid, title, content || '', meeting_date || new Date().toISOString().slice(0, 10)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/meetings/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT m.id FROM class_meetings m JOIN classes c ON c.id = m.class_id
                          WHERE m.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  const { title, content, meeting_date } = req.body || {};
  await db.run('UPDATE class_meetings SET title=?, content=?, meeting_date=? WHERE id=?',
    [title, content || '', meeting_date, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/meetings/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT m.id FROM class_meetings m JOIN classes c ON c.id = m.class_id
                          WHERE m.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM class_meetings WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 班主任周记 ==================== */

router.get('/journals', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM weekly_journals WHERE teacher_id = ? ORDER BY week_start DESC', [req.teacherId]));
}));

/* 保存某周周记（upsert） */
router.put('/journals/:weekStart', ah(async (req, res) => {
  const { content } = req.body || {};
  await db.run(`INSERT INTO weekly_journals (teacher_id, week_start, content) VALUES (?,?,?)
                ON CONFLICT(teacher_id, week_start) DO UPDATE SET content = excluded.content`,
    [req.teacherId, req.params.weekStart, content || '']);
  res.json({ ok: true });
}));

router.delete('/journals/:id', ah(async (req, res) => {
  await db.run('DELETE FROM weekly_journals WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 成绩分析 ==================== */

/* 某班某次考试分析：均分/最高/最低/排名/分数段分布（按该班全部课程成绩汇总） */
router.get('/classes/:classId/grade-analysis', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const exam = String(req.query.exam || '').trim();
  /* 该班出现过的考试名列表 */
  const exams = await db.all(`
    SELECT DISTINCT g.exam_name, MAX(g.exam_date) AS latest FROM grades g
    JOIN students s ON s.id = g.student_id
    WHERE s.class_id = ? GROUP BY g.exam_name ORDER BY latest DESC`, [cid]);
  if (!exam) return res.json({ exams, analysis: null });

  const rows = await db.all(`
    SELECT s.id AS student_id, s.name, s.student_no,
       SUM(g.score) AS total, AVG(g.score) AS avg_score, COUNT(g.id) AS subjects
    FROM grades g JOIN students s ON s.id = g.student_id
    WHERE s.class_id = ? AND g.exam_name = ?
    GROUP BY s.id, s.name, s.student_no
    ORDER BY total DESC`, [cid, exam]);
  if (!rows.length) return res.json({ exams, analysis: null });

  const totals = rows.map(r => Number(r.total));
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  /* 分数段分布（按总分）：0-59 / 60-69 / 70-79 / 80-89 / 90+（按单科满分 100 的科目数等比放大） */
  const subjects = Math.max(...rows.map(r => r.subjects));
  const full = 100 * subjects;
  const bands = [
    { label: '优秀(≥90%)', min: full * 0.9, n: 0 },
    { label: '良好(80-89%)', min: full * 0.8, n: 0 },
    { label: '中等(70-79%)', min: full * 0.7, n: 0 },
    { label: '及格(60-69%)', min: full * 0.6, n: 0 },
    { label: '待提高(<60%)', min: 0, n: 0 },
  ];
  for (const t of totals) {
    const b = bands.find(b => t >= b.min) || bands[bands.length - 1];
    b.n++;
  }
  /* 各科均分 */
  const perSubject = await db.all(`
    SELECT co.name AS course_name, co.subject, AVG(g.score) AS avg_score,
           MAX(g.score) AS max_score, MIN(g.score) AS min_score, COUNT(g.id) AS cnt
    FROM grades g JOIN students s ON s.id = g.student_id JOIN courses co ON co.id = g.course_id
    WHERE s.class_id = ? AND g.exam_name = ?
    GROUP BY co.name, co.subject ORDER BY co.subject`, [cid, exam]);

  res.json({
    exams,
    analysis: {
      exam_name: exam,
      student_count: rows.length,
      subjects,
      avg_total: +avg.toFixed(1),
      max_total: Math.max(...totals),
      min_total: Math.min(...totals),
      ranking: rows.map((r, i) => ({ rank: i + 1, ...r, total: Number(r.total), avg_score: +Number(r.avg_score).toFixed(1) })),
      bands,
      perSubject: perSubject.map(s => ({ ...s, avg_score: +Number(s.avg_score).toFixed(1) })),
    },
  });
}));

/* ==================== 考勤月报 ==================== */

/* 某月考勤统计：按学生汇总 出勤/迟到/缺勤/请假 天数；query: month=YYYY-MM */
router.get('/classes/:classId/attendance-monthly', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const rows = await db.all(`
    SELECT s.id AS student_id, s.name, s.student_no,
           COUNT(a.id) FILTER (WHERE a.status = '出勤') AS present,
           COUNT(a.id) FILTER (WHERE a.status = '迟到') AS late,
           COUNT(a.id) FILTER (WHERE a.status = '缺勤') AS absent,
           COUNT(a.id) FILTER (WHERE a.status = '请假') AS leave
    FROM students s
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date LIKE ?
    WHERE s.class_id = ?
    GROUP BY s.id, s.name, s.student_no ORDER BY s.student_no`, [`${month}-%`, cid]);
  res.json({ month, rows });
}));

module.exports = router;
