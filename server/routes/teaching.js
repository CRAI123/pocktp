/** 教学功能模块路由：课程 / 备课资料 / 作业与批改 / 成绩与分析（按教师隔离） */
const express = require('express');
const db = require('../db');
const { own } = require('../auth');
const { ah } = require('../util');

const router = express.Router();

/* ---------- 课程 ---------- */
router.get('/courses', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT c.*, cl.name AS class_name,
      (SELECT COUNT(*) FROM materials m WHERE m.course_id = c.id) AS material_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignment_count
    FROM courses c LEFT JOIN classes cl ON cl.id = c.class_id
    WHERE c.teacher_id = ?
    ORDER BY c.id DESC
  `, [req.teacherId]);
  res.json(rows);
}));

router.post('/courses', ah(async (req, res) => {
  const { name, subject, class_id, schedule, semester } = req.body;
  if (!name || !subject) return res.status(400).json({ error: 'name 与 subject 必填' });
  if (class_id && !(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  const info = await db.run(
    'INSERT INTO courses (teacher_id, name, subject, class_id, schedule, semester) VALUES (?,?,?,?,?,?)',
    [req.teacherId, name, subject, class_id || null, schedule || '', semester || '2026 春季']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/courses/:id', ah(async (req, res) => {
  if (!(await own.course(req.teacherId, req.params.id))) return res.status(404).json({ error: '课程不存在' });
  await db.run('DELETE FROM courses WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- 备课资料 ---------- */
router.get('/materials', ah(async (req, res) => {
  const { course_id } = req.query;
  const sql = `
    SELECT m.*, c.name AS course_name FROM materials m
    JOIN courses c ON c.id = m.course_id
    WHERE c.teacher_id = ? ${course_id ? 'AND m.course_id = ?' : ''}
    ORDER BY m.created_at DESC, m.id DESC`;
  res.json(course_id ? await db.all(sql, [req.teacherId, course_id]) : await db.all(sql, [req.teacherId]));
}));

router.post('/materials', ah(async (req, res) => {
  const { course_id, title, type, file_size, summary } = req.body;
  if (!course_id || !title) return res.status(400).json({ error: 'course_id 与 title 必填' });
  if (!(await own.course(req.teacherId, course_id))) return res.status(403).json({ error: '无权使用该课程' });
  const info = await db.run('INSERT INTO materials (course_id, title, type, file_size, summary) VALUES (?,?,?,?,?)',
    [course_id, title, type || '课件', file_size || '', summary || '']);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/materials/:id', ah(async (req, res) => {
  const r = await db.get(`
    SELECT m.id FROM materials m JOIN courses c ON c.id = m.course_id
    WHERE m.id = ? AND c.teacher_id = ?
  `, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '资料不存在' });
  await db.run('DELETE FROM materials WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- 作业布置与批改 ---------- */
router.get('/assignments', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT a.*, c.name AS course_name,
      (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status != '未提交') AS submitted_count,
      (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status = '已批改') AS graded_count
    FROM assignments a JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ?
    ORDER BY a.created_at DESC, a.id DESC
  `, [req.teacherId]);
  res.json(rows);
}));

router.post('/assignments', ah(async (req, res) => {
  const { course_id, title, content, deadline } = req.body;
  if (!course_id || !title) return res.status(400).json({ error: 'course_id 与 title 必填' });
  if (!(await own.course(req.teacherId, course_id))) return res.status(403).json({ error: '无权使用该课程' });
  const info = await db.run('INSERT INTO assignments (course_id, title, content, deadline) VALUES (?,?,?,?)',
    [course_id, title, content || '', deadline || '']);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.get('/assignments/:id/submissions', ah(async (req, res) => {
  if (!(await own.assignment(req.teacherId, req.params.id))) return res.status(404).json({ error: '作业不存在' });
  const rows = await db.all(`
    SELECT s.*, st.name AS student_name, st.student_no FROM submissions s
    JOIN students st ON st.id = s.student_id
    WHERE s.assignment_id = ? ORDER BY st.student_no
  `, [req.params.id]);
  res.json(rows);
}));

/* 批改：评分 + 评语 */
router.patch('/submissions/:id/grade', ah(async (req, res) => {
  const { score, feedback } = req.body;
  if (score == null) return res.status(400).json({ error: 'score 必填' });
  if (!(await own.submission(req.teacherId, req.params.id))) return res.status(404).json({ error: '提交记录不存在' });
  await db.run("UPDATE submissions SET score = ?, feedback = ?, status = '已批改' WHERE id = ?",
    [score, feedback || '', req.params.id]);
  res.json({ ok: true });
}));

/* ---------- 成绩录入与分析 ---------- */
router.get('/grades', ah(async (req, res) => {
  const { course_id, exam_name } = req.query;
  let sql = `
    SELECT g.*, s.name AS student_name, s.student_no, c.name AS course_name
    FROM grades g JOIN students s ON s.id = g.student_id JOIN courses c ON c.id = g.course_id
    WHERE c.teacher_id = ?`;
  const params = [req.teacherId];
  if (course_id) { sql += ' AND g.course_id = ?'; params.push(course_id); }
  if (exam_name) { sql += ' AND g.exam_name = ?'; params.push(exam_name); }
  sql += ' ORDER BY g.exam_date DESC, s.student_no';
  res.json(await db.all(sql, params));
}));

router.get('/grades/exams', ah(async (req, res) => {
  const { course_id } = req.query;
  const rows = await db.all(`
    SELECT DISTINCT g.exam_name, g.exam_date FROM grades g
    JOIN courses c ON c.id = g.course_id
    WHERE c.teacher_id = ? ${course_id ? 'AND g.course_id = ?' : ''} ORDER BY g.exam_date
  `, course_id ? [req.teacherId, course_id] : [req.teacherId]);
  res.json(rows);
}));

router.post('/grades', ah(async (req, res) => {
  const { student_id, course_id, exam_name, score, exam_date } = req.body;
  if (!student_id || !course_id || !exam_name || score == null) {
    return res.status(400).json({ error: 'student_id / course_id / exam_name / score 必填' });
  }
  if (!(await own.course(req.teacherId, course_id))) return res.status(403).json({ error: '无权使用该课程' });
  if (!(await own.student(req.teacherId, student_id))) return res.status(403).json({ error: '无权给该学生录入成绩' });
  const info = await db.run('INSERT INTO grades (student_id, course_id, exam_name, score, exam_date) VALUES (?,?,?,?,?)',
    [student_id, course_id, exam_name, score, exam_date || new Date().toISOString().slice(0, 10)]);
  res.status(201).json({ id: info.lastInsertRowid });
}));

/**
 * 成绩分析：班级均分曲线 + 个人曲线 + 提升要点（简单启发式规则生成）
 */
router.get('/grades/analysis', ah(async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ error: 'course_id 必填' });
  if (!(await own.course(req.teacherId, course_id))) return res.status(404).json({ error: '课程不存在' });

  const [exams, all] = await Promise.all([
    db.all('SELECT DISTINCT exam_name, exam_date FROM grades WHERE course_id = ? ORDER BY exam_date', [course_id]),
    db.all(`
      SELECT g.exam_name, g.score, g.exam_date, s.id AS student_id, s.name AS student_name
      FROM grades g JOIN students s ON s.id = g.student_id
      WHERE g.course_id = ? ORDER BY g.exam_date
    `, [course_id]),
  ]);

  // 均分曲线
  const avgCurve = exams.map(e => {
    const list = all.filter(g => g.exam_name === e.exam_name);
    const avg = list.length ? +(list.reduce((s, g) => s + g.score, 0) / list.length).toFixed(1) : 0;
    return { exam: e.exam_name, date: e.exam_date, average: avg, max: Math.max(...list.map(g => g.score), 0), min: list.length ? Math.min(...list.map(g => g.score)) : 0 };
  });

  // 每位学生曲线 + 趋势
  const byStudent = {};
  all.forEach(g => {
    (byStudent[g.student_name] ||= []).push(g.score);
  });

  // 提升要点生成
  const tips = [];
  if (avgCurve.length >= 2) {
    const delta = +(avgCurve[avgCurve.length - 1].average - avgCurve[0].average).toFixed(1);
    tips.push(delta >= 0
      ? `班级整体均分呈上升趋势（${delta >= 0 ? '+' : ''}${delta} 分），可保持当前教学节奏，适当增加拓展挑战任务。`
      : `班级整体均分下滑 ${Math.abs(delta)} 分，建议回看近期课时难度曲线，安排 1 次基础知识复盘课。`);
    const latest = avgCurve[avgCurve.length - 1];
    if (latest.max - latest.min >= 30) {
      tips.push(`最近一次测验两极分化明显（最高 ${latest.max} / 最低 ${latest.min}），建议分层布置作业：基础组强化操作步骤，进阶组加入开放性创作。`);
    }
  }
  const declining = Object.entries(byStudent).filter(([, arr]) => arr.length >= 2 && arr[arr.length - 1] < arr[0] - 5);
  if (declining.length) {
    tips.push(`成绩连续下滑学生：${declining.map(([n]) => n).join('、')}，建议课后一对一沟通，排查是概念理解还是操作熟练度问题。`);
  }
  const belowAvg = Object.entries(byStudent).filter(([, arr]) => arr.length && arr[arr.length - 1] < 60);
  if (belowAvg.length) {
    tips.push(`及格线以下学生：${belowAvg.map(([n]) => n).join('、')}，可利用午休安排 15 分钟闯关式补差练习，并向家长同步练习计划。`);
  }
  if (!tips.length) tips.push('整体表现稳定，可引入项目式学习任务进一步提升综合应用能力。');

  res.json({ avgCurve, byStudent, tips });
}));

module.exports = router;
