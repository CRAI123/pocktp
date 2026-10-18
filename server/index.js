/** 教师工作台后端服务入口 */
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { ah } = require('./util');
const { authRouter, authRequired, activatedRequired } = require('./auth');
const teachingRouter = require('./routes/teaching');
const classworkRouter = require('./routes/classwork');
const activationRouter = require('./routes/activation');
const adminRouter = require('./routes/admin');
const aiRouter = require('./routes/ai');
const classadminRouter = require('./routes/classadmin');

const app = express();
app.use(cors());
app.use(express.json());

/* 认证（无需登录） */
app.use('/api/auth', authRouter);

/* 激活码兑换（需登录，不要求已激活） */
app.use('/api/activation', authRequired, activationRouter);

/* 管理后台（路由内部校验管理员身份） */
app.use('/api/admin', authRequired, adminRouter);

/* 业务接口（需登录且已激活，数据按教师隔离） */
app.use('/api', authRequired, activatedRequired, teachingRouter);
app.use('/api', authRequired, activatedRequired, classworkRouter);
app.use('/api', authRequired, activatedRequired, classadminRouter);

/* AI 出题 / 自动批改（已激活即可使用，按调用扣算力） */
app.use('/api/ai', authRequired, activatedRequired, aiRouter);

/* 工作台总览统计（当前教师） — 加 30s 内存缓存，避免每次刷新都打 Supabase */
const overviewCache = new Map(); // tid -> { ts, data }
const OVERVIEW_TTL = 30_000;
app.get('/api/overview', authRequired, activatedRequired, ah(async (req, res) => {
  const tid = req.teacherId;
  const cached = overviewCache.get(tid);
  if (cached && Date.now() - cached.ts < OVERVIEW_TTL) return res.json(cached.data);

  const today = new Date().toISOString().slice(0, 10);
  const [classes, students, courses, materials, pendingGrading, pendingTodos, todayAttendance, classList] = await Promise.all([
    db.get('SELECT COUNT(*) n FROM classes WHERE teacher_id = ?', [tid]),
    db.get(`SELECT COUNT(*) n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = ?`, [tid]),
    db.get('SELECT COUNT(*) n FROM courses WHERE teacher_id = ?', [tid]),
    db.get(`SELECT COUNT(*) n FROM materials m JOIN courses co ON co.id = m.course_id WHERE co.teacher_id = ?`, [tid]),
    db.get(`SELECT COUNT(*) n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
            JOIN courses co ON co.id = a.course_id WHERE s.status = '待批改' AND co.teacher_id = ?`, [tid]),
    db.get('SELECT COUNT(*) n FROM todos WHERE done = 0 AND teacher_id = ?', [tid]),
    db.all(`SELECT a.status, COUNT(*) n FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN classes c ON c.id = s.class_id
            WHERE a.date = ? AND c.teacher_id = ? GROUP BY a.status`, [today, tid]),
    /* 每个班级一行：学生数 + 今日出勤 + 最近 1 次作业 */
    db.all(`
      SELECT
        c.id, c.name, c.grade,
        (SELECT COUNT(*) FROM students WHERE class_id = c.id) AS student_count,
        (SELECT COUNT(*) FROM attendance a JOIN students s ON s.id = a.student_id
           WHERE s.class_id = c.id AND a.date = ? AND a.status = '出勤') AS today_present,
        (SELECT a.title FROM assignments a JOIN courses co ON co.id = a.course_id
           WHERE co.class_id = c.id ORDER BY a.created_at DESC LIMIT 1) AS latest_assignment
      FROM classes c
      WHERE c.teacher_id = ?
      ORDER BY c.id DESC
      LIMIT 50
    `, [today, tid]),
  ]);
  const data = {
    classes: classes.n,
    students: students.n,
    courses: courses.n,
    materials: materials.n,
    pendingGrading: pendingGrading.n,
    pendingTodos: pendingTodos.n,
    todayAttendance,
    classList,
  };
  overviewCache.set(tid, { ts: Date.now(), data });
  res.json(data);
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : '服务器内部错误' });
});

/* 导出 Express 应用：本地 node index.js 直接监听；Vercel 由 api/index.js 导入为 Serverless 处理器 */
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  db.ready.then(() => {
    app.listen(PORT, () => console.log(`[server] 教师工作台 API 已启动: http://localhost:${PORT}`));
  });
}
