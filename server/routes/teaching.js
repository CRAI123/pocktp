/** 教学功能模块路由：课程 / 备课资料 / 作业与批改 / 成绩与分析（按教师隔离） */
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { own } = require('../auth');
const { ah } = require('../util');
const storage = require('../storage');

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

/* 编辑课程 */
router.put('/courses/:id', ah(async (req, res) => {
  if (!(await own.course(req.teacherId, req.params.id))) return res.status(404).json({ error: '课程不存在' });
  const { name, subject, class_id, schedule, semester } = req.body;
  if (!name || !subject) return res.status(400).json({ error: 'name 与 subject 必填' });
  if (class_id && !(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  await db.run('UPDATE courses SET name=?, subject=?, class_id=?, schedule=?, semester=? WHERE id=?',
    [name, subject, class_id || null, schedule || '', semester || '', req.params.id]);
  res.json({ ok: true });
}));

router.delete('/courses/:id', ah(async (req, res) => {
  if (!(await own.course(req.teacherId, req.params.id))) return res.status(404).json({ error: '课程不存在' });
  /* 先清云端文件再删课程（materials 行随 ON DELETE CASCADE 删除） */
  if (storage.enabled()) {
    const files = await db.all(`
      SELECT m.storage_path FROM materials m WHERE m.course_id = ? AND m.storage_path != ''`, [req.params.id]);
    await storage.removeObjects(files.map(f => f.storage_path));
  }
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

/* 字节数 → 展示文本（12.3 MB） */
const fmtSize = (n) => {
  n = Number(n) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return n ? `${n} B` : '';
};

/* 第一步：申请云端上传地址（浏览器随后 PUT 直传，不经过本服务，不受 Serverless 4.5MB 限制） */
router.post('/materials/upload-url', ah(async (req, res) => {
  if (!storage.enabled()) return res.status(503).json({ error: '云存储未配置，请联系管理员' });
  const name = String(req.body?.name || '').trim();
  const size = Number(req.body?.size) || 0;
  if (!name) return res.status(400).json({ error: '文件名缺失' });
  if (size <= 0) return res.status(400).json({ error: '文件为空' });
  if (size > storage.MAX_BYTES) return res.status(413).json({ error: `文件不能超过 ${fmtSize(storage.MAX_BYTES)}` });
  const ext = (name.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
  const path = `${req.teacherId}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const uploadUrl = await storage.signedUploadUrl(path);
  res.json({ uploadUrl, path });
}));

/* 第二步：上传完成后落库元数据（兼容旧调用：无 storage_path 时为纯元数据记录） */
router.post('/materials', ah(async (req, res) => {
  const { course_id, title, type, file_size, summary, storage_path, file_name, size_bytes, mime } = req.body;
  if (!course_id || !title) return res.status(400).json({ error: 'course_id 与 title 必填' });
  if (!(await own.course(req.teacherId, course_id))) return res.status(403).json({ error: '无权使用该课程' });
  /* 防串号：storage_path 必须位于本教师目录下 */
  const sp = String(storage_path || '');
  if (sp && !sp.startsWith(`${req.teacherId}/`)) return res.status(400).json({ error: '非法的文件路径' });
  const sizeBytes = Math.max(0, Number(size_bytes) || 0);
  const info = await db.run(
    'INSERT INTO materials (course_id, title, type, file_size, summary, storage_path, file_name, size_bytes, mime) VALUES (?,?,?,?,?,?,?,?,?)',
    [course_id, title, type || '课件', file_size || fmtSize(sizeBytes), summary || '', sp, String(file_name || ''), sizeBytes, String(mime || '').slice(0, 100)]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

/* 获取下载地址（签名 URL，10 分钟有效；前端新窗口打开） */
router.get('/materials/:id/download', ah(async (req, res) => {
  const r = await db.get(`
    SELECT m.storage_path, m.file_name FROM materials m JOIN courses c ON c.id = m.course_id
    WHERE m.id = ? AND c.teacher_id = ?
  `, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '资料不存在' });
  if (!r.storage_path) return res.status(404).json({ error: '该资料无云端文件（早期记录仅元数据）' });
  if (!storage.enabled()) return res.status(503).json({ error: '云存储未配置，请联系管理员' });
  const url = await storage.signedDownloadUrl(r.storage_path);
  res.json({ url, file_name: r.file_name });
}));

router.delete('/materials/:id', ah(async (req, res) => {
  const r = await db.get(`
    SELECT m.id, m.storage_path FROM materials m JOIN courses c ON c.id = m.course_id
    WHERE m.id = ? AND c.teacher_id = ?
  `, [req.params.id, req.teacherId]);
  if (!r) return res.status(404).json({ error: '资料不存在' });
  await db.run('DELETE FROM materials WHERE id = ?', [req.params.id]);
  if (r.storage_path) await storage.removeObjects([r.storage_path]);
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

/* 表格批量导入成绩：{ course_id, exam_date, items:[{student_id, exam_name, score}] }
 * 单条多值 INSERT（Serverless 往返昂贵，严禁逐条插）；非法学生/非数值行服务端再过滤一次 */
router.post('/grades/batch', ah(async (req, res) => {
  const { course_id, exam_date } = req.body;
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 3000) : [];
  if (!course_id || !items.length) return res.status(400).json({ error: 'course_id 与 items 必填' });
  if (!(await own.course(req.teacherId, course_id))) return res.status(403).json({ error: '无权使用该课程' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(exam_date || '') ? exam_date : new Date().toISOString().slice(0, 10);
  const ownStudents = await db.all(`
    SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id
    WHERE c.teacher_id = ? AND s.id = ANY(?)`, [req.teacherId, items.map(i => +i.student_id || 0)]);
  const okIds = new Set(ownStudents.map(s => s.id));
  const rows = items.filter(i => okIds.has(+i.student_id) && String(i.exam_name || '').trim() && Number.isFinite(+i.score));
  if (!rows.length) return res.status(400).json({ error: '没有有效成绩行（姓名未匹配或分数为空）' });
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const ph = part.map(() => '(?,?,?,?,?)').join(',');
    const params = part.flatMap(g => [+g.student_id, course_id, String(g.exam_name).trim().slice(0, 50), +g.score, date]);
    const r = await db.run(`INSERT INTO grades (student_id, course_id, exam_name, score, exam_date) VALUES ${ph}`, params);
    inserted += r.changes || part.length;
  }
  res.json({ ok: inserted, skipped: items.length - rows.length });
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
