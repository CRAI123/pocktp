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

/* 智能排座：mode = random 随机 / score 按成绩均衡 / gender 男女交错（保留挖空区，直接写入） */
router.post('/classes/:classId/seats/auto', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const mode = ['random', 'score', 'gender'].includes(req.body?.mode) ? req.body.mode : 'random';
  const students = await db.all('SELECT id, name, gender FROM students WHERE class_id = ? ORDER BY student_no, id', [cid]);
  if (!students.length) return res.status(400).json({ error: '班级暂无学生' });

  const seats = await db.all('SELECT row_idx, col_idx, disabled FROM seats WHERE class_id = ?', [cid]);
  let rows = 0, cols = 0;
  for (const s of seats) { rows = Math.max(rows, s.row_idx + 1); cols = Math.max(cols, s.col_idx + 1); }
  if (!rows) { cols = 6; rows = Math.max(2, Math.ceil(students.length / cols)); }

  const disabled = new Set(seats.filter(s => Number(s.disabled)).map(s => `${s.row_idx}-${s.col_idx}`));
  /* 可坐格按传统教室“列优先”顺序 */
  const slots = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++)
      if (!disabled.has(`${r}-${c}`)) slots.push({ row: r, col: c });

  let order;
  if (mode === 'score') {
    const scoreRows = await db.all(`SELECT s.id, AVG(g.score * 100.0 / NULLIF(g.full_score, 0)) AS avg_pct
      FROM students s LEFT JOIN grades g ON g.student_id = s.id
        AND g.course_id IN (SELECT id FROM courses WHERE class_id = ?)
      WHERE s.class_id = ? GROUP BY s.id`, [cid, cid]);
    const avg = Object.fromEntries(scoreRows.map(r => [r.id, r.avg_pct == null ? -1 : Number(r.avg_pct)]));
    const sorted = [...students].sort((a, b) => (avg[b.id] ?? -1) - (avg[a.id] ?? -1));
    /* 高分与低分交替取样，让每列 / 每排成绩更均衡 */
    order = [];
    let i = 0, j = sorted.length - 1;
    while (i <= j) {
      order.push(sorted[i++]);
      if (i <= j) order.push(sorted[j--]);
    }
  } else if (mode === 'gender') {
    const boys = students.filter(s => s.gender !== '女');
    const girls = students.filter(s => s.gender === '女');
    order = [];
    for (let i = 0; i < Math.max(boys.length, girls.length); i++) {
      if (boys[i]) order.push(boys[i]);
      if (girls[i]) order.push(girls[i]);
    }
  } else {
    order = [...students];
    for (let i = order.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [order[i], order[k]] = [order[k], order[i]];
    }
  }

  /* 组装全部格子（挖空区保留），单条多值 INSERT 落库，避免逐条往返 */
  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (disabled.has(`${r}-${c}`)) cells.push([r, c, null, 1]);
  let k = 0;
  for (const slot of slots) {
    const stu = order[k++];
    cells.push([slot.row, slot.col, stu ? stu.id : null, 0]);
  }
  const values = cells.map(() => '(?,?,?,?,?)').join(',');
  const params = cells.flatMap(([r, c, sid, dis]) => [cid, r, c, sid, dis]);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM seats WHERE class_id = ?', [cid]);
    if (cells.length) await tx.run(`INSERT INTO seats (class_id, row_idx, col_idx, student_id, disabled) VALUES ${values}`, params);
  });
  res.json({ ok: true, rows, cols, seated: Math.min(order.length, slots.length), unslotted: Math.max(0, order.length - slots.length) });
}));

/* ==================== 座位方案（多套布局保存 / 切换） ==================== */

router.get('/classes/:classId/seat-plans', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const rows = await db.all(`SELECT id, name, created_at, layout FROM seat_plans WHERE class_id = ? ORDER BY id DESC`, [cid]);
  res.json(rows.map(r => {
    let layout = [];
    try { layout = JSON.parse(r.layout || '[]'); } catch { /* 忽略脏数据 */ }
    return { id: r.id, name: r.name, created_at: r.created_at, student_count: layout.filter(c => c.student_id).length };
  }));
}));

/* 保存当前座次为方案：{ name } */
router.post('/classes/:classId/seat-plans', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: '方案名称必填' });
  const seats = await db.all('SELECT row_idx, col_idx, student_id, disabled FROM seats WHERE class_id = ? ORDER BY row_idx, col_idx', [cid]);
  if (!seats.length) return res.status(400).json({ error: '请先编排座次' });
  const layout = seats.map(s => ({ row: s.row_idx, col: s.col_idx, student_id: s.student_id || null, disabled: Number(s.disabled) ? 1 : 0 }));
  const info = await db.run('INSERT INTO seat_plans (class_id, name, layout) VALUES (?,?,?)', [cid, name, JSON.stringify(layout)]);
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* 应用方案：用方案布局覆盖当前座次 */
router.post('/seat-plans/:id/apply', ah(async (req, res) => {
  const plan = await db.get(`SELECT p.id, p.layout, p.class_id FROM seat_plans p
                              JOIN classes c ON c.id = p.class_id
                              WHERE p.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!plan) return res.status(404).json({ error: '方案不存在' });
  let layout = [];
  try { layout = JSON.parse(plan.layout || '[]'); } catch { return res.status(400).json({ error: '方案数据损坏' }); }
  if (!layout.length) return res.status(400).json({ error: '方案为空' });
  /* 学生必须仍属于该班（学生被删/转班时跳过） */
  const valid = new Set((await db.all('SELECT id FROM students WHERE class_id = ?', [plan.class_id])).map(r => r.id));
  const cells = layout.map(c => [plan.class_id, c.row, c.col, valid.has(Number(c.student_id)) ? Number(c.student_id) : null, c.disabled ? 1 : 0]);
  const values = cells.map(() => '(?,?,?,?,?)').join(',');
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM seats WHERE class_id = ?', [plan.class_id]);
    await tx.run(`INSERT INTO seats (class_id, row_idx, col_idx, student_id, disabled) VALUES ${values}`, cells.flat());
  });
  res.json({ ok: true });
}));

router.delete('/seat-plans/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT p.id FROM seat_plans p JOIN classes c ON c.id = p.class_id
                          WHERE p.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '方案不存在' });
  await db.run('DELETE FROM seat_plans WHERE id = ?', [req.params.id]);
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

/** 线性插值分位数（p: 0~1），输入需升序 */
function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base] + (sorted[base + 1] !== undefined ? rest * (sorted[base + 1] - sorted[base]) : 0);
}

/** 把一组分数算成箱线图 + 及格/优秀率（单科满分按 100 计） */
function scoreStats(scores) {
  const sorted = [...scores].map(Number).sort((a, b) => a - b);
  const n = sorted.length;
  const round1 = v => +Number(v).toFixed(1);
  if (!n) return { cnt: 0, avg_score: 0, max_score: 0, min_score: 0, pass_rate: 0, excellent_rate: 0, box: null };
  const pass = sorted.filter(v => v >= 60).length;
  const excellent = sorted.filter(v => v >= 85).length;
  return {
    cnt: n,
    avg_score: round1(sorted.reduce((a, b) => a + b, 0) / n),
    max_score: sorted[n - 1],
    min_score: sorted[0],
    pass_rate: round1((pass / n) * 100),
    excellent_rate: round1((excellent / n) * 100),
    box: {
      min: sorted[0],
      q1: round1(quantile(sorted, 0.25)),
      median: round1(quantile(sorted, 0.5)),
      q3: round1(quantile(sorted, 0.75)),
      max: sorted[n - 1],
    },
  };
}

/* 某班某次考试分析：均分/最高/最低/四分位/及格率/排名/分数段分布（按该班全部课程成绩汇总） */
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

  const totals = rows.map(r => Number(r.total)).sort((a, b) => a - b);
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
  const passCount = totals.filter(t => t >= full * 0.6).length;
  const excellentCount = totals.filter(t => t >= full * 0.9).length;
  const lowCount = totals.length - passCount;

  /* 各科成绩明细 → 均分/箱线图/及格率（单科满分按 100） */
  const subjRows = await db.all(`
    SELECT co.id AS course_id, co.name AS course_name, co.subject, g.score
    FROM grades g JOIN students s ON s.id = g.student_id JOIN courses co ON co.id = g.course_id
    WHERE s.class_id = ? AND g.exam_name = ?
    ORDER BY co.subject, co.name`, [cid, exam]);
  const byCourse = new Map();
  for (const r of subjRows) {
    if (!byCourse.has(r.course_id)) byCourse.set(r.course_id, { course_id: r.course_id, course_name: r.course_name, subject: r.subject, scores: [] });
    byCourse.get(r.course_id).scores.push(r.score);
  }
  const perSubject = [...byCourse.values()].map(c => ({ course_id: c.course_id, course_name: c.course_name, subject: c.subject, ...scoreStats(c.scores) }));

  /* 年级对比：同一教师名下同年级其它班级、同名考试的学科均分 */
  const clsRow = await db.get('SELECT grade FROM classes WHERE id = ?', [cid]);
  const grade = String(clsRow?.grade || '');
  const gradeSet = grade ? await db.all(`
    SELECT c.id AS class_id, c.name AS class_name, co.subject, AVG(g.score) AS avg_score, COUNT(g.id) AS cnt
    FROM grades g JOIN students s ON s.id = g.student_id
    JOIN classes c ON c.id = s.class_id JOIN courses co ON co.id = g.course_id
    WHERE c.teacher_id = ? AND c.grade = ? AND g.exam_name = ?
    GROUP BY c.id, c.name, co.subject ORDER BY c.id, co.subject`, [req.teacherId, grade, exam]) : [];

  res.json({
    exams,
    analysis: {
      exam_name: exam,
      student_count: rows.length,
      subjects,
      avg_total: +avg.toFixed(1),
      max_total: Math.max(...totals),
      min_total: Math.min(...totals),
      quartiles: {
        p25: +quantile(totals, 0.25).toFixed(1),
        p50: +quantile(totals, 0.5).toFixed(1),
        p75: +quantile(totals, 0.75).toFixed(1),
      },
      pass_rate: +((passCount / totals.length) * 100).toFixed(1),
      excellent_rate: +((excellentCount / totals.length) * 100).toFixed(1),
      low_rate: +((lowCount / totals.length) * 100).toFixed(1),
      ranking: rows.map((r, i) => ({ rank: i + 1, ...r, total: Number(r.total), avg_score: +Number(r.avg_score).toFixed(1) })),
      bands,
      perSubject,
      grade_compare: { grade, current_class_id: Number(cid), classes: gradeSet.map(r => ({ ...r, avg_score: +Number(r.avg_score).toFixed(1) })) },
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

/* ==================== 奖励券 / 心愿瓶 / 兑换 ==================== */

/* 奖励兑换总览：可兑换项 + 学生积分余额 + 兑换记录 */
router.get('/classes/:classId/rewards', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [rewards, redemptions, students] = await Promise.all([
    db.all('SELECT * FROM class_rewards WHERE class_id = ? ORDER BY id', [cid]),
    db.all(`SELECT r.*, s.name AS student_name FROM reward_redemptions r
            JOIN students s ON s.id = r.student_id
            WHERE r.class_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 200`, [cid]),
    db.all(`SELECT s.id, s.name, s.student_no, COALESCE(SUM(m.score), 0) AS total
            FROM students s LEFT JOIN moral_scores m ON m.student_id = s.id
            WHERE s.class_id = ? GROUP BY s.id, s.name, s.student_no
            ORDER BY total DESC, s.student_no`, [cid]),
  ]);
  /* 学生已用积分、每个奖励已兑次数均由记录派生，不额外存字段 */
  const usedByStudent = {}, usedByReward = {};
  for (const r of redemptions) {
    usedByStudent[r.student_id] = (usedByStudent[r.student_id] || 0) + Number(r.cost);
    if (r.reward_id) usedByReward[r.reward_id] = (usedByReward[r.reward_id] || 0) + 1;
  }
  res.json({
    rewards: rewards.map(w => ({ ...w, used_count: usedByReward[w.id] || 0 })),
    students: students.map(s => {
      const total = Number(s.total);
      const used = usedByStudent[s.id] || 0;
      return { ...s, total, used, balance: total - used };
    }),
    redemptions,
  });
}));

router.post('/classes/:classId/rewards', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { name, type, cost, stock, remark } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '奖励名称必填' });
  const info = await db.run(
    'INSERT INTO class_rewards (class_id, name, type, cost, stock, remark) VALUES (?,?,?,?,?,?)',
    [cid, String(name).trim(), type || '奖励券',
     Math.max(1, Math.min(9999, Number(cost) || 10)),
     Math.max(0, Number(stock) || 0), remark || '']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/rewards/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT w.id FROM class_rewards w JOIN classes c ON c.id = w.class_id
                          WHERE w.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM class_rewards WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* 兑换：校验学生归属 + 积分余额 + 库存，写入成本快照 */
router.post('/classes/:classId/redemptions', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { student_id, reward_id, remark } = req.body || {};
  if (!student_id || !reward_id) return res.status(400).json({ error: '请选择学生与奖励' });
  const [stu, reward] = await Promise.all([
    db.get('SELECT id, name FROM students WHERE id = ? AND class_id = ?', [student_id, cid]),
    db.get('SELECT * FROM class_rewards WHERE id = ? AND class_id = ?', [reward_id, cid]),
  ]);
  if (!stu) return res.status(404).json({ error: '学生不存在' });
  if (!reward) return res.status(404).json({ error: '奖励不存在' });

  const [sum, used, stockUsed] = await Promise.all([
    db.get('SELECT COALESCE(SUM(score), 0) AS total FROM moral_scores WHERE student_id = ?', [student_id]),
    db.get('SELECT COALESCE(SUM(cost), 0) AS used FROM reward_redemptions WHERE student_id = ?', [student_id]),
    db.get('SELECT COUNT(*) AS c FROM reward_redemptions WHERE reward_id = ?', [reward_id]),
  ]);
  const balance = Number(sum.total) - Number(used.used);
  if (balance < Number(reward.cost)) {
    return res.status(400).json({ error: `${stu.name} 可用积分 ${balance}，不足 ${reward.cost} 积分` });
  }
  if (Number(reward.stock) > 0 && Number(stockUsed.c) >= Number(reward.stock)) {
    return res.status(400).json({ error: '该奖励已兑完，请补充库存' });
  }

  const info = await db.run(
    `INSERT INTO reward_redemptions (class_id, student_id, reward_id, reward_name, cost, remark) VALUES (?,?,?,?,?,?)`,
    [cid, student_id, reward_id, reward.name, Number(reward.cost), remark || '']
  );
  res.status(201).json({ id: info.lastInsertRowid, balance: balance - Number(reward.cost) });
}));

router.put('/redemptions/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT r.id FROM reward_redemptions r JOIN classes c ON c.id = r.class_id
                          WHERE r.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  const status = req.body?.status === '已兑换' ? '已兑换' : '待兑换';
  await db.run('UPDATE reward_redemptions SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/redemptions/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT r.id FROM reward_redemptions r JOIN classes c ON c.id = r.class_id
                          WHERE r.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM reward_redemptions WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 电子奖状 ==================== */

router.get('/classes/:classId/certificates', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [rows, students] = await Promise.all([
    db.all(`SELECT ct.*, s.name AS student_name FROM class_certificates ct
            JOIN students s ON s.id = ct.student_id
            WHERE ct.class_id = ? ORDER BY ct.awarded_at DESC, ct.id DESC`, [cid]),
    db.all('SELECT id, name FROM students WHERE class_id = ? ORDER BY student_no', [cid]),
  ]);
  res.json({ certificates: rows, students });
}));

/* 颁发奖状：{ student_ids: [...], title, reason, issuer, awarded_at } */
router.post('/classes/:classId/certificates', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { student_ids, student_id, title, reason, issuer, awarded_at } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: '奖项名称必填' });
  const ids = (Array.isArray(student_ids) && student_ids.length ? student_ids : [student_id])
    .map(Number).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: '请选择学生' });
  const valid = new Set((await db.all('SELECT id FROM students WHERE class_id = ?', [cid])).map(r => r.id));
  const chosen = ids.filter(id => valid.has(id)).slice(0, 100);
  if (!chosen.length) return res.status(400).json({ error: '请选择学生' });
  await db.transaction(async (tx) => {
    for (const sid of chosen) {
      await tx.run(
        `INSERT INTO class_certificates (class_id, student_id, title, reason, issuer, awarded_at) VALUES (?,?,?,?,?,?)`,
        [cid, sid, String(title).trim(), reason || '', issuer || '',
         awarded_at || new Date().toISOString().slice(0, 10)]
      );
    }
  });
  res.status(201).json({ ok: true, count: chosen.length });
}));

router.delete('/certificates/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT ct.id FROM class_certificates ct JOIN classes c ON c.id = ct.class_id
                          WHERE ct.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM class_certificates WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 谈话记录 ==================== */

router.get('/classes/:classId/talks', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [rows, students] = await Promise.all([
    db.all(`SELECT t.*, s.name AS student_name FROM class_talks t
            JOIN students s ON s.id = t.student_id
            WHERE t.class_id = ? ORDER BY t.talked_at DESC, t.id DESC`, [cid]),
    db.all('SELECT id, name FROM students WHERE class_id = ? ORDER BY student_no', [cid]),
  ]);
  res.json({ talks: rows, students });
}));

router.post('/classes/:classId/talks', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { student_id, topic, outline, content, follow_up, talked_at, status } = req.body || {};
  if (!student_id || !topic || !String(topic).trim()) return res.status(400).json({ error: '学生与谈话主题必填' });
  if (!(await own.student(req.teacherId, student_id))) return res.status(403).json({ error: '无权使用该学生' });
  const info = await db.run(
    `INSERT INTO class_talks (class_id, student_id, topic, outline, content, follow_up, talked_at, status) VALUES (?,?,?,?,?,?,?,?)`,
    [cid, student_id, String(topic).trim(), outline || '', content || '', follow_up || '',
     talked_at || new Date().toISOString().slice(0, 10), status || '无需跟进']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/talks/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT t.id FROM class_talks t JOIN classes c ON c.id = t.class_id
                          WHERE t.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  const { topic, outline, content, follow_up, talked_at, status } = req.body || {};
  await db.run(
    'UPDATE class_talks SET topic=?, outline=?, content=?, follow_up=?, talked_at=?, status=? WHERE id=?',
    [topic, outline || '', content || '', follow_up || '', talked_at, status || '无需跟进', req.params.id]
  );
  res.json({ ok: true });
}));

router.delete('/talks/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT t.id FROM class_talks t JOIN classes c ON c.id = t.class_id
                          WHERE t.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM class_talks WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 班级日志 ==================== */

router.get('/classes/:classId/logs', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : '';
  const rows = month
    ? await db.all('SELECT * FROM class_logs WHERE class_id = ? AND log_date LIKE ? ORDER BY log_date DESC, id DESC', [cid, `${month}-%`])
    : await db.all('SELECT * FROM class_logs WHERE class_id = ? ORDER BY log_date DESC, id DESC LIMIT 300', [cid]);
  res.json(rows);
}));

router.post('/classes/:classId/logs', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { title, content, category, log_date } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: '日志标题必填' });
  const info = await db.run(
    'INSERT INTO class_logs (class_id, title, content, category, log_date) VALUES (?,?,?,?,?)',
    [cid, String(title).trim(), content || '', category || '班级事件',
     log_date || new Date().toISOString().slice(0, 10)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/logs/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT l.id FROM class_logs l JOIN classes c ON c.id = l.class_id
                          WHERE l.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  const { title, content, category, log_date } = req.body || {};
  await db.run('UPDATE class_logs SET title=?, content=?, category=?, log_date=? WHERE id=?',
    [title, content || '', category || '班级事件', log_date, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/logs/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT l.id FROM class_logs l JOIN classes c ON c.id = l.class_id
                          WHERE l.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM class_logs WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 请假条 ==================== */

/* 列出日期区间（含首尾），最多 60 天，用于批准后补记考勤 */
function eachDate(start, end, max = 60) {
  const out = [];
  const s = new Date(`${start}T00:00:00`), e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return out;
  const p = n => String(n).padStart(2, '0');
  for (let d = new Date(s); d <= e && out.length < max; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out;
}

router.get('/classes/:classId/leaves', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [rows, students] = await Promise.all([
    db.all(`SELECT l.*, s.name AS student_name FROM leave_requests l
            JOIN students s ON s.id = l.student_id
            WHERE l.class_id = ? ORDER BY l.start_date DESC, l.id DESC LIMIT 300`, [cid]),
    db.all('SELECT id, name FROM students WHERE class_id = ? ORDER BY student_no', [cid]),
  ]);
  res.json({ leaves: rows, students });
}));

router.post('/classes/:classId/leaves', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { student_id, type, start_date, end_date, reason } = req.body || {};
  if (!student_id || !start_date || !end_date) return res.status(400).json({ error: '学生与起止日期必填' });
  if (end_date < start_date) return res.status(400).json({ error: '结束日期不能早于开始日期' });
  if (!(await own.student(req.teacherId, student_id))) return res.status(403).json({ error: '无权使用该学生' });
  const info = await db.run(
    'INSERT INTO leave_requests (class_id, student_id, type, start_date, end_date, reason) VALUES (?,?,?,?,?,?)',
    [cid, student_id, type || '事假', start_date, end_date, reason || '']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* 审批：批准时自动把区间内尚无考勤记录的日期补记为「请假」（不覆盖老师已点过的考勤） */
router.put('/leaves/:id', ah(async (req, res) => {
  const row = await db.get(`SELECT l.* FROM leave_requests l JOIN classes c ON c.id = l.class_id
                            WHERE l.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  const status = ['待审批', '已批准', '已驳回'].includes(req.body?.status) ? req.body.status : row.status;
  await db.run('UPDATE leave_requests SET status = ? WHERE id = ?', [status, req.params.id]);
  let filled = 0;
  if (status === '已批准') {
    const dates = eachDate(row.start_date, row.end_date);
    await db.transaction(async (tx) => {
      for (const d of dates) {
        const r = await tx.run(
          `INSERT INTO attendance (student_id, date, status, remark) VALUES (?,?, '请假', '请假条')
           ON CONFLICT(student_id, date) DO NOTHING`,
          [row.student_id, d]
        );
        filled += r.changes;
      }
    });
  }
  res.json({ ok: true, status, attendance_filled: filled });
}));

router.delete('/leaves/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT l.id FROM leave_requests l JOIN classes c ON c.id = l.class_id
                          WHERE l.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  await db.run('DELETE FROM leave_requests WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 错题本（登记 → 订正 → 复测） ==================== */

router.get('/classes/:classId/wrong-questions', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { status, student_id } = req.query;
  const conds = ['q.class_id = ?'];
  const params = [cid];
  if (status) { conds.push('q.status = ?'); params.push(status); }
  if (student_id) { conds.push('q.student_id = ?'); params.push(student_id); }
  const [rows, students] = await Promise.all([
    db.all(`SELECT q.*, s.name AS student_name, s.student_no, co.name AS course_name
            FROM wrong_questions q
            JOIN students s ON s.id = q.student_id
            LEFT JOIN courses co ON co.id = q.course_id
            WHERE ${conds.join(' AND ')}
            ORDER BY q.created_at DESC, q.id DESC LIMIT 300`, params),
    db.all('SELECT id, name, student_no FROM students WHERE class_id = ? ORDER BY student_no', [cid]),
  ]);
  const summary = {
    total: rows.length,
    pending: rows.filter(r => r.status === '待订正').length,
    corrected: rows.filter(r => r.status === '已订正').length,
    retested: rows.filter(r => r.status === '已复测').length,
    retest_avg: (() => {
      const s = rows.filter(r => r.retest_score != null).map(r => Number(r.retest_score));
      return s.length ? +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
    })(),
  };
  res.json({ items: rows, students, summary });
}));

router.post('/classes/:classId/wrong-questions', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const { student_id, course_id, subject, source, knowledge, stem, answer } = req.body || {};
  if (!student_id || !String(stem || '').trim()) return res.status(400).json({ error: '学生与题干必填' });
  const stu = await db.get('SELECT id FROM students WHERE id = ? AND class_id = ?', [student_id, cid]);
  if (!stu) return res.status(403).json({ error: '该学生不属于本班级' });
  const info = await db.run(
    `INSERT INTO wrong_questions (class_id, student_id, course_id, subject, source, knowledge, stem, answer)
     VALUES (?,?,?,?,?,?,?,?)`,
    [cid, student_id, course_id || null, subject || '', source || '', knowledge || '', String(stem).trim(), answer || '']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* 查找并校验归属（错题 → 班级 → 教师） */
async function ownWrong(req, res) {
  const row = await db.get(`SELECT q.* FROM wrong_questions q JOIN classes c ON c.id = q.class_id
                            WHERE q.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!row) { res.status(404).json({ error: '记录不存在' }); return null; }
  return row;
}

router.put('/wrong-questions/:id', ah(async (req, res) => {
  const row = await ownWrong(req, res); if (!row) return;
  const { subject, source, knowledge, stem, answer, status } = req.body || {};
  const st = ['待订正', '已订正', '已复测'].includes(status) ? status : row.status;
  await db.run(
    'UPDATE wrong_questions SET subject=?, source=?, knowledge=?, stem=?, answer=?, status=? WHERE id=?',
    [subject ?? row.subject, source ?? row.source, knowledge ?? row.knowledge, stem ?? row.stem, answer ?? row.answer, st, row.id]
  );
  res.json({ ok: true, status: st });
}));

/* 复测：记录得分与备注，状态置为「已复测」 */
router.put('/wrong-questions/:id/retest', ah(async (req, res) => {
  const row = await ownWrong(req, res); if (!row) return;
  const { retest_score, retest_note, retest_at } = req.body || {};
  const score = retest_score === '' || retest_score == null ? null : Number(retest_score);
  if (score != null && Number.isNaN(score)) return res.status(400).json({ error: '复测得分需为数字' });
  await db.run(
    'UPDATE wrong_questions SET retest_score=?, retest_note=?, retest_at=?, status=? WHERE id=?',
    [score, retest_note || '', retest_at || new Date().toISOString().slice(0, 10), '已复测', row.id]
  );
  res.json({ ok: true });
}));

router.delete('/wrong-questions/:id', ah(async (req, res) => {
  const row = await ownWrong(req, res); if (!row) return;
  await db.run('DELETE FROM wrong_questions WHERE id = ?', [row.id]);
  res.json({ ok: true });
}));

/* ==================== 数据备份点（误删找回） ==================== */

/* 学生可恢复字段（不含 id / class_id） */
const BK_STUDENT_FIELDS = ['name', 'gender', 'student_no', 'parent_phone', 'parent_wechat', 'school',
  'current_class', 'status', 'cohort', 'university', 'major', 'fee', 'destination'];

const nowCN = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/* 生成快照：学生 / 成绩 / 考勤 / 德育 / 班费 / 错题 */
router.post('/classes/:classId/backups', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const [students, grades, attendance, moral, funds, wrong] = await Promise.all([
    db.all('SELECT * FROM students WHERE class_id = ? ORDER BY id', [cid]),
    db.all(`SELECT g.* FROM grades g JOIN students s ON s.id = g.student_id WHERE s.class_id = ? ORDER BY g.id`, [cid]),
    db.all(`SELECT a.* FROM attendance a JOIN students s ON s.id = a.student_id WHERE s.class_id = ? ORDER BY a.id`, [cid]),
    db.all(`SELECT m.* FROM moral_scores m JOIN students s ON s.id = m.student_id WHERE s.class_id = ? ORDER BY m.id`, [cid]),
    db.all('SELECT * FROM class_funds WHERE class_id = ? ORDER BY id', [cid]),
    db.all('SELECT * FROM wrong_questions WHERE class_id = ? ORDER BY id', [cid]),
  ]);
  const counts = {
    students: students.length, grades: grades.length, attendance: attendance.length,
    moral: moral.length, funds: funds.length, wrong: wrong.length,
  };
  const payload = { version: 1, students, grades, attendance, moral, funds, wrong };
  const info = await db.run(
    'INSERT INTO class_backups (class_id, teacher_id, name, counts, payload) VALUES (?,?,?,?,?)',
    [cid, req.teacherId, String(req.body?.name || '').trim() || `自动备份 ${nowCN()}`,
      JSON.stringify(counts), JSON.stringify(payload)]
  );
  res.status(201).json({ id: info.lastInsertRowid, counts });
}));

router.get('/classes/:classId/backups', ah(async (req, res) => {
  const cid = await mustOwnClass(req, res); if (!cid) return;
  const rows = await db.all(
    `SELECT id, name, counts, created_at FROM class_backups WHERE class_id = ? ORDER BY id DESC LIMIT 50`, [cid]
  );
  res.json(rows.map(r => ({ ...r, counts: typeof r.counts === 'string' ? JSON.parse(r.counts) : r.counts })));
}));

router.delete('/backups/:id', ah(async (req, res) => {
  const r = await db.get(`SELECT b.id FROM class_backups b JOIN classes c ON c.id = b.class_id
                          WHERE b.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '备份不存在' });
  await db.run('DELETE FROM class_backups WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* 恢复到备份点：按姓名匹配现有学生（找不到则重建），先清空该班相关记录再写回 */
router.post('/backups/:id/restore', ah(async (req, res) => {
  const bk = await db.get(`SELECT b.* FROM class_backups b JOIN classes c ON c.id = b.class_id
                           WHERE b.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!bk) return res.status(404).json({ error: '备份不存在' });
  let p;
  try { p = JSON.parse(bk.payload); } catch { return res.status(400).json({ error: '备份内容已损坏' }); }
  const cid = bk.class_id;
  const courseIds = new Set((await db.all('SELECT id FROM courses WHERE teacher_id = ?', [req.teacherId])).map(c => c.id));

  const result = await db.transaction(async (tx) => {
    const existing = await tx.all('SELECT id, name, student_no FROM students WHERE class_id = ?', [cid]);
    const byKey = new Map();
    const byName = new Map();
    existing.forEach(s => {
      byName.set(String(s.name).trim(), s.id);
      if (s.student_no) byKey.set(`${String(s.name).trim()}|${String(s.student_no).trim()}`, s.id);
    });

    /* 学生：优先姓名+学号，其次姓名，命中则复用；未命中的稍后新建并回填映射 */
    const idMap = new Map();
    for (const orig of (Array.isArray(p.students) ? p.students : [])) {
      const name = String(orig.name || '').trim();
      if (!name) continue;
      const key = `${name}|${String(orig.student_no || '').trim()}`;
      const hit = byKey.get(key) || byName.get(name);
      if (hit) idMap.set(Number(orig.id), hit);
    }

    /* 新建学生：逐条插入以取得新 id（数量有限，仅备份恢复时发生） */
    const created = [];
    for (const orig of (Array.isArray(p.students) ? p.students : [])) {
      const name = String(orig.name || '').trim();
      if (!name) continue;
      if (idMap.has(Number(orig.id))) continue;
      const cols = BK_STUDENT_FIELDS.filter(f => orig[f] !== undefined && orig[f] !== null);
      const info = await tx.run(
        `INSERT INTO students (class_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`,
        [cid, ...cols.map(f => (f === 'fee' ? Number(orig[f]) || 0 : String(orig[f])))]
      );
      idMap.set(Number(orig.id), info.lastInsertRowid);
      created.push(name);
    }
    const mapId = (oldId) => idMap.get(Number(oldId));

    /* 清空该班相关记录（学生本身保留/补建，不删除） */
    const curIds = (await tx.all('SELECT id FROM students WHERE class_id = ?', [cid])).map(r => r.id);
    if (curIds.length) {
      const ph = curIds.map(() => '?').join(',');
      await tx.run(`DELETE FROM grades WHERE student_id IN (${ph})`, curIds);
      await tx.run(`DELETE FROM attendance WHERE student_id IN (${ph})`, curIds);
      await tx.run(`DELETE FROM moral_scores WHERE student_id IN (${ph})`, curIds);
    }
    await tx.run('DELETE FROM class_funds WHERE class_id = ?', [cid]);
    await tx.run('DELETE FROM wrong_questions WHERE class_id = ?', [cid]);

    /* 成绩：课程已删除的跳过（外键约束） */
    let grades = 0;
    for (const g of (Array.isArray(p.grades) ? p.grades : [])) {
      const sid = mapId(g.student_id);
      if (!sid || !courseIds.has(Number(g.course_id))) continue;
      await tx.run('INSERT INTO grades (student_id, course_id, exam_name, score, full_score, exam_date) VALUES (?,?,?,?,?,?)',
        [sid, g.course_id, g.exam_name, Number(g.score) || 0, Number(g.full_score) || 100, g.exam_date || '']);
      grades++;
    }

    /* 考勤：同学生同日期已存在则更新 */
    let att = 0;
    for (const a of (Array.isArray(p.attendance) ? p.attendance : [])) {
      const sid = mapId(a.student_id);
      if (!sid) continue;
      await tx.run(`INSERT INTO attendance (student_id, date, status, remark) VALUES (?,?,?,?)
        ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, remark = excluded.remark`,
        [sid, a.date, a.status || '出勤', a.remark || '']);
      att++;
    }

    let moral = 0;
    for (const m of (Array.isArray(p.moral) ? p.moral : [])) {
      const sid = mapId(m.student_id);
      if (!sid) continue;
      await tx.run('INSERT INTO moral_scores (student_id, score, reason, category, date) VALUES (?,?,?,?,?)',
        [sid, Number(m.score) || 0, m.reason || '', m.category || '课堂表现', m.date || '']);
      moral++;
    }

    let funds = 0;
    for (const f of (Array.isArray(p.funds) ? p.funds : [])) {
      await tx.run('INSERT INTO class_funds (class_id, type, amount, item, date, remark) VALUES (?,?,?,?,?,?)',
        [cid, f.type || '支出', Number(f.amount) || 0, f.item || '', f.date || '', f.remark || '']);
      funds++;
    }

    let wrong = 0;
    for (const w of (Array.isArray(p.wrong) ? p.wrong : [])) {
      const sid = mapId(w.student_id);
      if (!sid) continue;
      await tx.run(`INSERT INTO wrong_questions (class_id, student_id, course_id, subject, source, knowledge, stem, answer, status,
          retest_score, retest_note, retest_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [cid, sid, courseIds.has(Number(w.course_id)) ? w.course_id : null, w.subject || '', w.source || '',
         w.knowledge || '', w.stem || '', w.answer || '', w.status || '待订正',
         w.retest_score == null ? null : Number(w.retest_score), w.retest_note || '', w.retest_at || null]);
      wrong++;
    }

    return { students: created.length, grades, attendance: att, moral, funds, wrong };
  });

  res.json({ ok: true, restored: result });
}));

module.exports = router;
