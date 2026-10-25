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
  const { class_id, status } = req.query;
  const conds = [];
  if (class_id) conds.push('s.class_id = ?');
  if (status) conds.push('s.status = ?');
  const sql = `
    SELECT s.*, c.name AS class_name FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE c.teacher_id = ? ${conds.length ? 'AND ' + conds.join(' AND ') : ''} ORDER BY s.student_no`;
  const params = [req.teacherId, ...(class_id ? [class_id] : []), ...(status ? [status] : [])];
  res.json(await db.all(sql, params));
}));

router.post('/students', ah(async (req, res) => {
  const { class_id, name, gender, student_no, parent_phone, parent_wechat, school, current_class, status,
    cohort, university, major, fee, destination } = req.body;
  if (!class_id || !name) return res.status(400).json({ error: 'class_id 与 name 必填' });
  if (!(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  const info = await db.run(
    `INSERT INTO students (class_id, name, gender, student_no, parent_phone, parent_wechat, school, current_class, status,
       cohort, university, major, fee, destination) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [class_id, name, gender || '男', student_no || '', parent_phone || '', parent_wechat || '', school || '', current_class || '', status || '在读',
      cohort || '', university || '', major || '', Number(fee) || 0, destination || '']
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.put('/students/:id', ah(async (req, res) => {
  if (!(await own.student(req.teacherId, req.params.id))) return res.status(404).json({ error: '学生不存在' });
  const { name, gender, student_no, parent_phone, parent_wechat, school, current_class, status,
    cohort, university, major, fee, destination } = req.body;
  await db.run(`UPDATE students SET name=?, gender=?, student_no=?, parent_phone=?, parent_wechat=?, school=?, current_class=?, status=?,
                cohort=?, university=?, major=?, fee=?, destination=? WHERE id=?`,
    [name, gender, student_no, parent_phone, parent_wechat, school || '', current_class || '', status || '在读',
      cohort || '', university || '', major || '', Number(fee) || 0, destination || '', req.params.id]);
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

/* 待发队列：标记已发送 / 撤回待发送 / 删除 */
router.patch('/notifications/:id', ah(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['待发送', '已发送'].includes(status)) return res.status(400).json({ error: 'status 不合法' });
  const n = await db.get('SELECT id FROM notifications WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  if (!n) return res.status(404).json({ error: '通知不存在' });
  await db.run(`
    UPDATE notifications SET status = ?, sent_at = CASE WHEN ? = '已发送'
      THEN to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') ELSE NULL END
    WHERE id = ?
  `, [status, status, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/notifications/:id', ah(async (req, res) => {
  await db.run('DELETE FROM notifications WHERE id = ? AND teacher_id = ?', [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* ---------- 课表 ---------- */
/* 当前教师姓名：用于「这节课是不是我的课」的自动判定 */
async function myName(tid) {
  const t = await db.get('SELECT name FROM teachers WHERE id = ?', [tid]);
  return String(t?.name || '').trim();
}
/* is_mine 优先级：显式传参 > 任课教师与本人姓名一致 */
function mineFlag(raw, explicit, name) {
  if (explicit === true || explicit === 1 || explicit === '1') return 1;
  if (explicit === false || explicit === 0 || explicit === '0') return 0;
  return name && String(raw || '').trim() === name ? 1 : 0;
}

/* 列表：class_id 限定班级；mine=1 只返回「我的课」（跨班级，供教师课表与上课提醒） */
router.get('/timetables', ah(async (req, res) => {
  const { class_id, mine } = req.query;
  if (class_id && !(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权访问该班级' });
  const conds = ['c.teacher_id = ?'];
  const params = [req.teacherId];
  if (class_id) { conds.push('t.class_id = ?'); params.push(class_id); }
  if (String(mine) === '1') conds.push('t.is_mine = 1');
  const rows = await db.all(`
    SELECT t.*, c.name AS class_name FROM timetables t JOIN classes c ON c.id = t.class_id
    WHERE ${conds.join(' AND ')}
    ORDER BY t.weekday, t.period
  `, params);
  res.json(rows);
}));

/* 单格新增/覆盖：{ class_id, weekday, period, subject, teacher, note, is_mine } */
router.post('/timetables', ah(async (req, res) => {
  const { class_id, weekday, period, subject, teacher, note, is_mine } = req.body || {};
  if (!(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  const wd = Number(weekday), pd = Number(period);
  if (!(wd >= 1 && wd <= 7) || !(pd >= 1 && pd <= 15)) return res.status(400).json({ error: '星期或节次不合法' });
  if (!String(subject || '').trim()) return res.status(400).json({ error: '科目必填' });
  const mine = mineFlag(teacher, is_mine, await myName(req.teacherId));
  const info = await db.run(`
    INSERT INTO timetables (class_id, weekday, period, subject, teacher, note, is_mine) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(class_id, weekday, period) DO UPDATE SET subject = excluded.subject,
      teacher = excluded.teacher, note = excluded.note, is_mine = excluded.is_mine
    RETURNING id
  `, [class_id, wd, pd, String(subject).trim(), String(teacher || '').trim(), String(note || '').trim(), mine]);
  res.status(201).json({ id: info.lastInsertRowid, is_mine: mine });
}));

router.put('/timetables/:id', ah(async (req, res) => {
  const row = await db.get(`SELECT t.id FROM timetables t JOIN classes c ON c.id = t.class_id
    WHERE t.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  if (!row) return res.status(404).json({ error: '课表条目不存在' });
  const { subject, teacher, note, is_mine } = req.body || {};
  if (!String(subject || '').trim()) return res.status(400).json({ error: '科目必填' });
  const mine = mineFlag(teacher, is_mine, await myName(req.teacherId));
  await db.run('UPDATE timetables SET subject=?, teacher=?, note=?, is_mine=? WHERE id=?',
    [String(subject).trim(), String(teacher || '').trim(), String(note || '').trim(), mine, req.params.id]);
  res.json({ ok: true, is_mine: mine });
}));

router.delete('/timetables/:id', ah(async (req, res) => {
  await db.run(`DELETE FROM timetables t USING classes c
    WHERE t.class_id = c.id AND t.id = ? AND c.teacher_id = ?`, [req.params.id, req.teacherId]);
  res.json({ ok: true });
}));

/* 批量导入：{ class_id, items: [{weekday,period,subject,teacher?,note?,is_mine?}] }（同格覆盖，单条多值 INSERT） */
router.post('/timetables/bulk', ah(async (req, res) => {
  const { class_id, items } = req.body || {};
  if (!(await own.class(req.teacherId, class_id))) return res.status(403).json({ error: '无权使用该班级' });
  const name = await myName(req.teacherId);
  const list = (Array.isArray(items) ? items : []).map(i => ({
    weekday: Number(i?.weekday), period: Number(i?.period),
    subject: String(i?.subject || '').trim(), teacher: String(i?.teacher || '').trim(), note: String(i?.note || '').trim(),
    is_mine: mineFlag(i?.teacher, i?.is_mine, name),
  })).filter(i => i.weekday >= 1 && i.weekday <= 7 && i.period >= 1 && i.period <= 15 && i.subject)
    .slice(0, 200);
  if (!list.length) return res.status(400).json({ error: '没有可导入的有效条目' });
  const values = [];
  for (const i of list) values.push('(?,?,?,?,?,?,?)');
  const params = [];
  for (const i of list) params.push(Number(class_id), i.weekday, i.period, i.subject, i.teacher, i.note, i.is_mine);
  await db.run(`
    INSERT INTO timetables (class_id, weekday, period, subject, teacher, note, is_mine)
    VALUES ${values.join(',')}
    ON CONFLICT(class_id, weekday, period) DO UPDATE SET subject = excluded.subject,
      teacher = excluded.teacher, note = excluded.note, is_mine = excluded.is_mine
  `, params);
  res.json({ ok: true, count: list.length });
}));

/* ---------- 作息时间（上课提醒依据） ----------
 * 各校作息不同：以老师自填的「逐节起止时间」为准（slots JSON）。
 * 旧字段（节数/第1节开始/时长/课间）仅作模板填充与兼容回退。 */
const SLOT_DEFAULTS = { periods: 8, start_time: '08:00', class_minutes: 40, break_minutes: 10 };
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const fmtMin = (n) => {
  const t = ((Math.round(n) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/* 按「第1节开始 + 每节时长 + 课间」生成模板时间表 */
function genSlots({ periods = 8, start_time = '08:00', class_minutes = 40, break_minutes = 10 }) {
  const base = toMin(start_time);
  const step = class_minutes + break_minutes;
  const out = [];
  for (let i = 0; i < periods; i++) {
    const s = base + i * step;
    out.push({ period: i + 1, start: fmtMin(s), end: fmtMin(s + class_minutes) });
  }
  return out;
}
function parseSlots(raw) {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((s, i) => ({
      period: i + 1,
      start: HHMM.test(String(s?.start || '')) ? String(s.start) : '',
      end: HHMM.test(String(s?.end || '')) ? String(s.end) : '',
    })).filter(s => s.start && s.end).slice(0, 15);
  } catch { return []; }
}
function normSlots(r) {
  const periods = Math.min(15, Math.max(1, Number(r?.periods) || SLOT_DEFAULTS.periods));
  const startTime = HHMM.test(String(r?.start_time || '')) ? String(r.start_time) : SLOT_DEFAULTS.start_time;
  const classMinutes = Math.min(120, Math.max(10, Number(r?.class_minutes) || SLOT_DEFAULTS.class_minutes));
  const breakMinutes = Number(r?.break_minutes) >= 0 ? Number(r.break_minutes) : SLOT_DEFAULTS.break_minutes;
  const saved = parseSlots(r?.slots);
  const slots = saved.length ? saved : genSlots({ periods, start_time: startTime, class_minutes: classMinutes, break_minutes: breakMinutes });
  return { periods: slots.length, start_time: startTime, class_minutes: classMinutes, break_minutes: breakMinutes, slots };
}

router.get('/timetable-settings', ah(async (req, res) => {
  const row = await db.get('SELECT * FROM timetable_settings WHERE teacher_id = ?', [req.teacherId]);
  res.json(normSlots(row));
}));

router.put('/timetable-settings', ah(async (req, res) => {
  const body = req.body || {};
  let slots;
  if (Array.isArray(body.slots) && body.slots.length) {
    slots = [];
    for (const s of body.slots.slice(0, 15)) {
      const st = String(s?.start || '').trim();
      const en = String(s?.end || '').trim();
      if (!HHMM.test(st) || !HHMM.test(en)) return res.status(400).json({ error: '每节课的起止时间格式应为 HH:MM' });
      if (toMin(en) <= toMin(st)) return res.status(400).json({ error: '第 ' + (slots.length + 1) + ' 节的下课时间需晚于上课时间' });
      slots.push({ start: st, end: en });
    }
    slots = slots.map((s, i) => ({ period: i + 1, ...s }));
  } else {
    /* 兼容旧调用：按模板生成 */
    const periods = Math.min(15, Math.max(1, Number(body.periods) || SLOT_DEFAULTS.periods));
    const startTime = String(body.start_time || '').trim();
    if (!HHMM.test(startTime)) return res.status(400).json({ error: '开始时间格式应为 HH:MM' });
    slots = genSlots({
      periods, start_time: startTime,
      class_minutes: Math.min(120, Math.max(10, Number(body.class_minutes) || SLOT_DEFAULTS.class_minutes)),
      break_minutes: Math.min(60, Math.max(0, Number(body.break_minutes ?? SLOT_DEFAULTS.break_minutes) || 0)),
    });
  }
  /* 旧字段同步回写：取第 1 节起止与该节时长、首末节间课间 */
  const classMinutes = toMin(slots[0].end) - toMin(slots[0].start);
  const breakMinutes = slots.length > 1 ? Math.max(0, toMin(slots[1].start) - toMin(slots[0].end)) : SLOT_DEFAULTS.break_minutes;
  await db.run(`
    INSERT INTO timetable_settings (teacher_id, periods, start_time, class_minutes, break_minutes, slots)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(teacher_id) DO UPDATE SET periods = excluded.periods, start_time = excluded.start_time,
      class_minutes = excluded.class_minutes, break_minutes = excluded.break_minutes, slots = excluded.slots,
      updated_at = to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')
    RETURNING teacher_id
  `, [req.teacherId, slots.length, slots[0].start, classMinutes, breakMinutes, JSON.stringify(slots)]);
  res.json({ ok: true, ...normSlots({ periods: slots.length, start_time: slots[0].start, class_minutes: classMinutes, break_minutes: breakMinutes, slots: JSON.stringify(slots) }) });
}));

module.exports = router;
