/**
 * 语文备考模块路由（按教师隔离）：
 *  古诗文必背检查 / 作文素材与训练 / 好题本 / 复习要点 / 作业登记 / 特殊学生任务 / 高考备考
 * 班级与学生复用班务模块（classes / students），分组标记存在 students.cp_group
 */
const express = require('express');
const db = require('../db');
const { own } = require('../auth');
const { ah } = require('../util');

const router = express.Router();

/* 本地日期 YYYY-MM-DD（与前端 todayStr 对齐） */
const todayStr = () => new Date().toLocaleDateString('sv-SE');

/** 班级归属校验：传了 class_id 时必须是本教师的班级 */
async function checkClass(req, res, classId) {
  if (classId === undefined || classId === null || classId === '') return true;
  if (!(await own.class(req.teacherId, classId))) {
    res.status(403).json({ error: '无权使用该班级' });
    return false;
  }
  return true;
}

const str = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ==================== 总览：各模块计数 + 古诗文过关率 ==================== */
router.get('/summary', ah(async (req, res) => {
  const tid = req.teacherId;
  const [poems, materials, trainings, good, points, homework, special, exams, texts] = await Promise.all([
    db.all('SELECT status FROM cp_poems WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_essay_materials WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_essay_trainings WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_good_questions WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_review_points WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_homework_logs WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_special_tasks WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_exam_questions WHERE teacher_id = ?', [tid]),
    db.get('SELECT COUNT(*) n FROM cp_text_questions WHERE teacher_id = ?', [tid]),
  ]);
  const pass = poems.filter(p => p.status === '默写过关').length;
  const rec = poems.filter(p => p.status === '背诵').length;
  const un = poems.filter(p => !p.status || p.status === '未查').length;
  res.json({
    poems: { total: poems.length, pass, rec, un, rate: poems.length ? Math.round(pass / poems.length * 100) : 0 },
    materials: materials.n, trainings: trainings.n, good: good.n, points: points.n,
    homework: homework.n, special: special.n, exams: exams.n, texts: texts.n,
  });
}));

/* ==================== 今天要处理：到期的特殊学生任务 ==================== */
router.get('/today', ah(async (req, res) => {
  const t = todayStr();
  const rows = await db.all(`
    SELECT s.*, c.name AS class_name FROM cp_special_tasks s
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.teacher_id = ? AND (
      (s.repeat_mode = '每日' AND s.done_date <> ?) OR
      (s.repeat_mode <> '每日' AND s.done = 0 AND s.date <> '' AND s.date <= ?)
    ) ORDER BY s.id
  `, [req.teacherId, t, t]);
  res.json({ today: t, items: rows });
}));

/* ==================== 学生（复用班级成员 + 备考分组） ==================== */
router.get('/students', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT s.id, s.name, s.student_no, s.cp_group, s.class_id, c.name AS class_name
    FROM students s JOIN classes c ON c.id = s.class_id
    WHERE c.teacher_id = ? ORDER BY c.id, s.student_no, s.id
  `, [req.teacherId]);
  res.json(rows);
}));

router.put('/students/:id/group', ah(async (req, res) => {
  if (!(await own.student(req.teacherId, req.params.id))) return res.status(404).json({ error: '学生不存在' });
  await db.run('UPDATE students SET cp_group = ? WHERE id = ?', [str(req.body?.cp_group, 20), req.params.id]);
  res.json({ ok: true });
}));

/* ==================== 古诗文必背检查 ==================== */
router.get('/poems', ah(async (req, res) => {
  res.json(await db.all(`
    SELECT p.*, c.name AS class_name FROM cp_poems p
    LEFT JOIN classes c ON c.id = p.class_id
    WHERE p.teacher_id = ? ORDER BY p.id
  `, [req.teacherId]));
}));

router.post('/poems', ah(async (req, res) => {
  const { title, author, status, class_id, unmem } = req.body || {};
  if (!str(title)) return res.status(400).json({ error: '篇目必填' });
  if (!(await checkClass(req, res, class_id))) return;
  const info = await db.run(
    'INSERT INTO cp_poems (teacher_id, title, author, status, class_id, unmem) VALUES (?,?,?,?,?,?)',
    [req.teacherId, str(title, 100), str(author, 60), str(status, 10) || '未查', class_id || null, str(unmem, 500)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* 行内更新：状态 / 未背过班级 / 未背过学生 */
router.patch('/poems/:id', ah(async (req, res) => {
  const row = await db.get('SELECT * FROM cp_poems WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  if (!row) return res.status(404).json({ error: '篇目不存在' });
  const b = req.body || {};
  if (b.class_id !== undefined && !(await checkClass(req, res, b.class_id))) return;
  const next = {
    status: b.status !== undefined ? str(b.status, 10) : row.status,
    author: b.author !== undefined ? str(b.author, 60) : row.author,
    unmem: b.unmem !== undefined ? str(b.unmem, 500) : row.unmem,
    class_id: b.class_id !== undefined ? (b.class_id || null) : row.class_id,
  };
  await db.run('UPDATE cp_poems SET status=?, author=?, unmem=?, class_id=? WHERE id=?',
    [next.status, next.author, next.unmem, next.class_id, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/poems/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_poems WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 作文素材 ==================== */
router.get('/materials', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM cp_essay_materials WHERE teacher_id = ? ORDER BY id DESC', [req.teacherId]));
}));

router.post('/materials', ah(async (req, res) => {
  const { type, content, theme } = req.body || {};
  if (!str(content)) return res.status(400).json({ error: '素材内容必填' });
  const info = await db.run(
    'INSERT INTO cp_essay_materials (teacher_id, type, content, theme) VALUES (?,?,?,?)',
    [req.teacherId, str(type, 30) || '课本素材', str(content, 1000), str(theme, 200)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/materials/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_essay_materials WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 作文训练题目与解析范文 ==================== */
router.get('/trainings', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM cp_essay_trainings WHERE teacher_id = ? ORDER BY date DESC, id DESC', [req.teacherId]));
}));

router.post('/trainings', ah(async (req, res) => {
  const { name, target, fanwen, date } = req.body || {};
  if (!str(name)) return res.status(400).json({ error: '训练题目必填' });
  const info = await db.run(
    'INSERT INTO cp_essay_trainings (teacher_id, name, target, fanwen, date) VALUES (?,?,?,?,?)',
    [req.teacherId, str(name, 200), str(target, 60), str(fanwen, 8000), str(date, 10) || todayStr()]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/trainings/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_essay_trainings WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 好题本 ==================== */
router.get('/good', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM cp_good_questions WHERE teacher_id = ? ORDER BY id DESC', [req.teacherId]));
}));

router.post('/good', ah(async (req, res) => {
  const { subject, q, a, master } = req.body || {};
  if (!str(subject) || !str(q)) return res.status(400).json({ error: '考点与题目必填' });
  const info = await db.run(
    'INSERT INTO cp_good_questions (teacher_id, subject, q, a, master) VALUES (?,?,?,?,?)',
    [req.teacherId, str(subject, 100), str(q, 8000), str(a, 8000), str(master, 10) || '未掌握']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.patch('/good/:id', ah(async (req, res) => {
  await db.run('UPDATE cp_good_questions SET master = ? WHERE id = ? AND teacher_id = ?',
    [str(req.body?.master, 10) || '未掌握', req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

router.delete('/good/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_good_questions WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 复习要点 ==================== */
router.get('/points', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM cp_review_points WHERE teacher_id = ? ORDER BY id DESC', [req.teacherId]));
}));

router.post('/points', ah(async (req, res) => {
  const { section, content, note } = req.body || {};
  if (!str(content)) return res.status(400).json({ error: '复习要点必填' });
  const info = await db.run(
    'INSERT INTO cp_review_points (teacher_id, section, content, note, date) VALUES (?,?,?,?,?)',
    [req.teacherId, str(section, 30) || '信息类阅读', str(content, 2000), str(note, 500), todayStr()]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/points/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_review_points WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 作业登记 ==================== */
router.get('/homework', ah(async (req, res) => {
  res.json(await db.all(`
    SELECT h.*, c.name AS class_name FROM cp_homework_logs h
    LEFT JOIN classes c ON c.id = h.class_id
    WHERE h.teacher_id = ? ORDER BY h.date DESC, h.id DESC
  `, [req.teacherId]));
}));

router.post('/homework', ah(async (req, res) => {
  const { class_id, name, date, should_count, done_count, absent_names } = req.body || {};
  if (!str(name)) return res.status(400).json({ error: '作业名必填' });
  if (!(await checkClass(req, res, class_id))) return;
  const info = await db.run(`
    INSERT INTO cp_homework_logs (teacher_id, class_id, name, date, should_count, done_count, absent_names)
    VALUES (?,?,?,?,?,?,?)
  `, [req.teacherId, class_id || null, str(name, 100), str(date, 10) || todayStr(),
    num(should_count), num(done_count), str(absent_names, 1000)]);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/homework/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_homework_logs WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 特殊学生任务 ==================== */
router.get('/special', ah(async (req, res) => {
  res.json(await db.all(`
    SELECT s.*, c.name AS class_name FROM cp_special_tasks s
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.teacher_id = ? ORDER BY s.id DESC
  `, [req.teacherId]));
}));

router.post('/special', ah(async (req, res) => {
  const { content, target, scope_type, class_id, group_name, repeat_mode, date } = req.body || {};
  if (!str(content)) return res.status(400).json({ error: '任务内容必填' });
  if (!(await checkClass(req, res, class_id))) return;
  const info = await db.run(`
    INSERT INTO cp_special_tasks (teacher_id, content, target, scope_type, class_id, group_name, repeat_mode, date)
    VALUES (?,?,?,?,?,?,?,?)
  `, [req.teacherId, str(content, 300), str(target, 60), str(scope_type, 10) || 'all',
    class_id || null, str(group_name, 20), str(repeat_mode, 10) || '每日', str(date, 10) || todayStr()]);
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* 标记完成：每日任务记 done_date，单次任务置 done=1 */
router.patch('/special/:id/done', ah(async (req, res) => {
  const row = await db.get('SELECT * FROM cp_special_tasks WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  if (!row) return res.status(404).json({ error: '任务不存在' });
  if (row.repeat_mode === '每日') {
    await db.run('UPDATE cp_special_tasks SET done_date = ? WHERE id = ?', [todayStr(), req.params.id]);
  } else {
    await db.run('UPDATE cp_special_tasks SET done = 1 WHERE id = ?', [req.params.id]);
  }
  res.json({ ok: true });
}));

router.delete('/special/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_special_tasks WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 高考真题 ==================== */
router.get('/exams', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM cp_exam_questions WHERE teacher_id = ? ORDER BY year DESC, id DESC', [req.teacherId]));
}));

router.post('/exams', ah(async (req, res) => {
  const { section, year, title, q, a } = req.body || {};
  if (!str(title)) return res.status(400).json({ error: '题名必填' });
  const info = await db.run(
    'INSERT INTO cp_exam_questions (teacher_id, section, year, title, q, a) VALUES (?,?,?,?,?,?)',
    [req.teacherId, str(section, 30) || '信息类阅读', num(year) || new Date().getFullYear(), str(title, 200), str(q, 8000), str(a, 8000)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/exams/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_exam_questions WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 五册课本原创题目 ==================== */
router.get('/texts', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM cp_text_questions WHERE teacher_id = ? ORDER BY id DESC', [req.teacherId]));
}));

router.post('/texts', ah(async (req, res) => {
  const { volume, piece, q, a } = req.body || {};
  if (!str(q)) return res.status(400).json({ error: '原创题目必填' });
  const info = await db.run(
    'INSERT INTO cp_text_questions (teacher_id, volume, piece, q, a) VALUES (?,?,?,?,?)',
    [req.teacherId, str(volume, 20) || '必修 上', str(piece, 100), str(q, 8000), str(a, 8000)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/texts/:id', ah(async (req, res) => {
  await db.run('DELETE FROM cp_text_questions WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ==================== 批量导入（前端解析好行数据后提交） ==================== */
router.post('/bulk', ah(async (req, res) => {
  const { mod, rows } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: '没有可导入的数据' });
  if (rows.length > 500) return res.status(400).json({ error: '单次最多导入 500 条' });
  const tid = req.teacherId;

  /* class_id 由前端匹配班级名后传入；校验归属，非法则置空 */
  const classIds = new Set((await db.all(`
    SELECT c.id FROM classes c WHERE c.teacher_id = ?
  `, [tid])).map(r => r.id));

  let n = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const cid = classIds.has(Number(r.class_id)) ? Number(r.class_id) : null;
      if (mod === 'poems') {
        if (!str(r.title)) continue;
        await tx.run('INSERT INTO cp_poems (teacher_id, title, author, status, class_id, unmem) VALUES (?,?,?,?,?,?)',
          [tid, str(r.title, 100), str(r.author, 60), str(r.status, 10) || '未查', cid, str(r.unmem, 500)]);
      } else if (mod === 'materials') {
        if (!str(r.content)) continue;
        await tx.run('INSERT INTO cp_essay_materials (teacher_id, type, content, theme) VALUES (?,?,?,?)',
          [tid, str(r.type, 30) || '课本素材', str(r.content, 1000), str(r.theme, 200)]);
      } else if (mod === 'trainings') {
        if (!str(r.name)) continue;
        await tx.run('INSERT INTO cp_essay_trainings (teacher_id, name, target, fanwen, date) VALUES (?,?,?,?,?)',
          [tid, str(r.name, 200), str(r.target, 60), str(r.fanwen, 8000), str(r.date, 10) || todayStr()]);
      } else if (mod === 'good') {
        if (!str(r.subject)) continue;
        await tx.run('INSERT INTO cp_good_questions (teacher_id, subject, q, a, master) VALUES (?,?,?,?,?)',
          [tid, str(r.subject, 100), str(r.q, 8000), str(r.a, 8000), str(r.master, 10) || '未掌握']);
      } else if (mod === 'points') {
        if (!str(r.content)) continue;
        await tx.run('INSERT INTO cp_review_points (teacher_id, section, content, note, date) VALUES (?,?,?,?,?)',
          [tid, str(r.section, 30) || '信息类阅读', str(r.content, 2000), str(r.note, 500), todayStr()]);
      } else if (mod === 'homework') {
        if (!str(r.name)) continue;
        await tx.run(`INSERT INTO cp_homework_logs (teacher_id, class_id, name, date, should_count, done_count, absent_names)
                      VALUES (?,?,?,?,?,?,?)`,
          [tid, cid, str(r.name, 100), str(r.date, 10) || todayStr(), num(r.should_count), num(r.done_count), str(r.absent_names, 1000)]);
      } else if (mod === 'special') {
        if (!str(r.content)) continue;
        await tx.run(`INSERT INTO cp_special_tasks (teacher_id, content, target, scope_type, class_id, group_name, repeat_mode, date)
                      VALUES (?,?,?,?,?,?,?,?)`,
          [tid, str(r.content, 300), str(r.target, 60), str(r.scope_type, 10) || 'all', cid,
            str(r.group_name, 20), str(r.repeat_mode, 10) || '每日', str(r.date, 10) || todayStr()]);
      } else if (mod === 'exams') {
        if (!str(r.title)) continue;
        await tx.run('INSERT INTO cp_exam_questions (teacher_id, section, year, title, q, a) VALUES (?,?,?,?,?,?)',
          [tid, str(r.section, 30) || '信息类阅读', num(r.year) || new Date().getFullYear(), str(r.title, 200), str(r.q, 8000), str(r.a, 8000)]);
      } else if (mod === 'texts') {
        if (!str(r.q)) continue;
        await tx.run('INSERT INTO cp_text_questions (teacher_id, volume, piece, q, a) VALUES (?,?,?,?,?)',
          [tid, str(r.volume, 20) || '必修 上', str(r.piece, 100), str(r.q, 8000), str(r.a, 8000)]);
      } else {
        break;
      }
      n++;
    }
  });
  if (!n) return res.status(400).json({ error: '没有解析出有效数据，请检查格式' });
  res.json({ imported: n });
}));

module.exports = router;
