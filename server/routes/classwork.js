/** 班务管理模块路由：班级 / 学生 / 考勤 / 微信通知 / 待办（按教师隔离） */
const express = require('express');
const db = require('../db');
const { own } = require('../auth');
const { ah } = require('../util');

const router = express.Router();

/* ---------- 班级与成员 ---------- */
router.get('/classes', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT c.*, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count
    FROM classes c WHERE c.teacher_id = ? ORDER BY c.id
  `, [req.teacherId]);
  res.json(rows);
}));

/* 创建班级：{ name, grade?, description? } */
router.post('/classes', ah(async (req, res) => {
  const { name, grade, description } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '班级名称必填' });
  const info = await db.run(
    'INSERT INTO classes (teacher_id, name, grade, description) VALUES (?,?,?,?)',
    [req.teacherId, String(name).trim(), String(grade || '').trim(), String(description || '').trim()]
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.get('/students', ah(async (req, res) => {
  const { class_id } = req.query;
  const sql = `
    SELECT s.*, c.name AS class_name FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE c.teacher_id = ? ${class_id ? 'AND s.class_id = ?' : ''} ORDER BY s.student_no`;
  res.json(class_id ? await db.all(sql, [req.teacherId, class_id]) : await db.all(sql, [req.teacherId]));
}));

router.post('/students', ah(async (req, res) => {
  const { class_id, name, gender, student_no, parent_phone, parent_wechat } = req.body;
  if (!class_id || !name) return res.status(400).json({ error: 'class_id 与 name 必填' });
  if (!(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  const info = await db.run(
    'INSERT INTO students (class_id, name, gender, student_no, parent_phone, parent_wechat) VALUES (?,?,?,?,?,?)',
    [class_id, name, gender || '男', student_no || '', parent_phone || '', parent_wechat || '']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/students/:id', ah(async (req, res) => {
  if (!(await own.student(req.teacherId, req.params.id))) return res.status(404).json({ error: '学生不存在' });
  const { name, gender, student_no, parent_phone, parent_wechat } = req.body;
  await db.run('UPDATE students SET name=?, gender=?, student_no=?, parent_phone=?, parent_wechat=? WHERE id=?',
    [name, gender, student_no, parent_phone, parent_wechat, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/students/:id', ah(async (req, res) => {
  if (!(await own.student(req.teacherId, req.params.id))) return res.status(404).json({ error: '学生不存在' });
  await db.run('DELETE FROM students WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- 考勤 ---------- */
router.get('/attendance', ah(async (req, res) => {
  const { date } = req.query;
  const d = date || new Date().toISOString().slice(0, 10);
  const [rows, summary] = await Promise.all([
    db.all(`
      SELECT a.*, s.name AS student_name, s.student_no, c.name AS class_name
      FROM attendance a JOIN students s ON s.id = a.student_id JOIN classes c ON c.id = s.class_id
      WHERE a.date = ? AND c.teacher_id = ? ORDER BY s.student_no
    `, [d, req.teacherId]),
    db.all(`
      SELECT a.status, COUNT(*) AS n FROM attendance a
      JOIN students s ON s.id = a.student_id JOIN classes c ON c.id = s.class_id
      WHERE a.date = ? AND c.teacher_id = ? GROUP BY a.status
    `, [d, req.teacherId]),
  ]);
  res.json({ date: d, records: rows, summary });
}));

/* 批量点名：{ date, items: [{student_id, status, remark}] }，存在即更新 */
router.post('/attendance', ah(async (req, res) => {
  const { date, items } = req.body;
  if (!date || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'date 与 items 必填' });
  }
  const allowed = [];
  for (const i of items) {
    if (await own.student(req.teacherId, i.student_id)) allowed.push(i);
  }
  if (!allowed.length) return res.status(403).json({ error: '没有可考勤的学生' });
  await db.transaction(async (tx) => {
    for (const i of allowed) {
      await tx.run(`
        INSERT INTO attendance (student_id, date, status, remark) VALUES (?,?,?,?)
        ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, remark = excluded.remark
      `, [i.student_id, date, i.status, i.remark || '']);
    }
  });
  res.json({ ok: true, count: allowed.length });
}));

/* ---------- 微信消息通知生成 ---------- */
router.get('/notifications', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT n.*, c.name AS class_name FROM notifications n
    LEFT JOIN classes c ON c.id = n.target_class_id
    WHERE n.teacher_id = ? ORDER BY n.created_at DESC, n.id DESC
  `, [req.teacherId]);
  res.json(rows);
}));

router.post('/notifications', ah(async (req, res) => {
  const { title, content, target_class_id, channel } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title 与 content 必填' });
  if (target_class_id && !(await own.class(req.teacherId, target_class_id))) {
    return res.status(403).json({ error: '无权使用该班级' });
  }
  const info = await db.run(
    'INSERT INTO notifications (teacher_id, title, content, target_class_id, channel) VALUES (?,?,?,?,?)',
    [req.teacherId, title, content, target_class_id || null, channel || '微信群']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

/**
 * 模板化生成微信通知文案（规则模板，无需调用外部大模型即可离线运行）
 * type: activity 活动通知 / attendance 考勤提醒 / homework 作业提醒 / score 成绩反馈
 */
router.post('/notifications/generate', ah(async (req, res) => {
  const { type, class_id, params = {} } = req.body;
  if (class_id && !(await own.class(req.teacherId, class_id))) {
    return res.status(403).json({ error: '无权使用该班级' });
  }
  const cls = class_id ? await db.get('SELECT * FROM classes WHERE id = ?', [class_id]) : null;
  const className = cls ? cls.name : '各班';
  const today = new Date().toISOString().slice(0, 10);

  const templates = {
    activity: p => ({
      title: `${p.name || '班级活动'}通知`,
      content: `各位家长好，${className}将于 ${p.date || today} 开展「${p.name || '班级活动'}」。${p.detail || '请提醒孩子准时到校，携带相关物品。'}如有特殊情况请提前与班主任联系，感谢配合！`,
    }),
    attendance: p => ({
      title: '考勤异常提醒',
      content: `您好，您的孩子 ${p.student_name || '同学'} 今日（${p.date || today}）考勤状态为【${p.status || '缺勤'}】。如已请假请回复本消息说明，未请假请及时与班主任核实情况，谢谢配合！`,
    }),
    homework: p => ({
      title: `作业提醒：${p.title || '课后作业'}`,
      content: `各位家长好，${className}今日布置了「${p.course || '课程'}」作业《${p.title || '课后作业'}》，截止时间为 ${p.deadline || '本周五 18:00'}。请督促孩子按时完成并在平台提交，遇到困难可留言反馈。`,
    }),
    score: p => ({
      title: `${p.exam || '测验'}成绩反馈`,
      content: `您好，${className}「${p.exam || '本次测验'}」成绩已发布。您的孩子得分 ${p.score ?? '-'} 分，班级平均分 ${p.average ?? '-'} 分。${p.advice || '建议结合错题与孩子一起复盘薄弱知识点，有疑问欢迎私信沟通。'}`,
    }),
  };

  const gen = templates[type];
  if (!gen) return res.status(400).json({ error: `不支持的 type：${type}` });
  res.json(gen(params));
}));

/* ---------- 班级事务待办 ---------- */
router.get('/todos', ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM todos WHERE teacher_id = ? ORDER BY done, due_date, id DESC', [req.teacherId]));
}));

router.post('/todos', ah(async (req, res) => {
  const { title, category, due_date, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'title 必填' });
  const info = await db.run('INSERT INTO todos (teacher_id, title, category, due_date, priority) VALUES (?,?,?,?,?)',
    [req.teacherId, title, category || '班级事务', due_date || '', priority || '中']);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.patch('/todos/:id/toggle', ah(async (req, res) => {
  await db.run('UPDATE todos SET done = 1 - done WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

router.delete('/todos/:id', ah(async (req, res) => {
  await db.run('DELETE FROM todos WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

module.exports = router;
