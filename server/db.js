/**
 * 数据库层：Supabase Postgres (pg)
 * - 连接串从 server/.env 的 DATABASE_URL 读取
 * - 异步适配层：all/get/run/transaction/exec，占位符 ? 自动转 $1..$n
 * - 面向一线教师：所有业务数据按 teacher_id 隔离
 * - 手机号注册登录；激活码（activation_codes）核销解锁完整功能
 * - 首次启动自动建表 + 写入演示种子数据；ready 为初始化完成的 Promise
 */
require('dotenv').config();
const crypto = require('crypto');
const { Pool, types } = require('pg');

/* COUNT(*) 等 int8 默认返回字符串，统一转 JS number */
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ---------- 占位符转换：? -> $1..$n ---------- */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function all(sql, params = []) {
  const { rows } = await pool.query(toPg(sql), params);
  return rows;
}

async function get(sql, params = []) {
  return (await all(sql, params))[0];
}

async function run(sql, params = []) {
  let pgSql = toPg(sql);
  /* INSERT 自动追加 RETURNING id，以兼容 better-sqlite3 的 lastInsertRowid 用法 */
  if (/^\s*INSERT\s/i.test(pgSql) && !/RETURNING/i.test(pgSql)) pgSql += ' RETURNING id';
  const result = await pool.query(pgSql, params);
  return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id, rows: result.rows };
}

/* 多语句执行（DDL） */
async function exec(sql) {
  await pool.query(sql);
}

/* 事务：独立 client，fn 内使用 tx.all/tx.get/tx.run */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      all: async (sql, params = []) => (await client.query(toPg(sql), params)).rows,
      get: async (sql, params = []) => (await tx.all(sql, params))[0],
      run: async (sql, params = []) => {
        let pgSql = toPg(sql);
        if (/^\s*INSERT\s/i.test(pgSql) && !/RETURNING/i.test(pgSql)) pgSql += ' RETURNING id';
        const r = await client.query(pgSql, params);
        return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id, rows: r.rows };
      },
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/* ---------------- 初始化：建表 + 迁移 + 种子 ---------------- */
async function init() {
  await exec(`
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,              -- 登录标识：11 位手机号
  email TEXT DEFAULT '',          -- 兼容字段，手机号为占位
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  activated INTEGER DEFAULT 0,    -- 是否已用激活码激活
  activated_at TEXT,
  is_admin INTEGER DEFAULT 0,     -- 管理员（可进后台、免激活）
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS activation_codes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,      -- 16 位大写无歧义字符（展示时按 4 位分组）
  status TEXT NOT NULL DEFAULT 'unused',  -- unused/used/revoked
  batch TEXT DEFAULT '',          -- 批次号，便于按批管理
  note TEXT DEFAULT '',           -- 备注（如闲鱼订单）
  used_by INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  used_at TEXT,
  expires_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT DEFAULT '男',
  student_no TEXT DEFAULT '',
  parent_phone TEXT DEFAULT '',
  parent_wechat TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  schedule TEXT DEFAULT '',
  semester TEXT DEFAULT '2026 春季'
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT DEFAULT '课件',          -- 课件/教案/习题/视频/其他
  file_size TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  status TEXT DEFAULT '待批改',       -- 待批改/已批改/未提交
  score REAL,
  feedback TEXT DEFAULT '',
  submitted_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS grades (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  exam_name TEXT NOT NULL,
  score REAL NOT NULL,
  full_score REAL DEFAULT 100,
  exam_date TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT DEFAULT '出勤',         -- 出勤/迟到/缺勤/请假
  remark TEXT DEFAULT '',
  UNIQUE(student_id, date)
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT DEFAULT '班级事务',
  due_date TEXT DEFAULT '',
  priority TEXT DEFAULT '中',         -- 高/中/低
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  target_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  channel TEXT DEFAULT '微信群',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE TABLE IF NOT EXISTS ai_history (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- dictation/pinyin/fix/poem/sentence/wordbank/reading/dictationEn
  grade TEXT,
  difficulty TEXT,
  count INTEGER NOT NULL,
  keyword TEXT,
  questions JSONB NOT NULL,          -- AI 生成的题目数组
  cost INTEGER NOT NULL DEFAULT 5,  -- 本次消耗算力
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_ai_history_teacher_type ON ai_history(teacher_id, type, created_at DESC);

/* ---------- 班主任班务模块（2026-10-18 新增，数据经 class 归属链隔离） ---------- */

/* 座次表：每格一名学生，空位 student_id 为 NULL */
CREATE TABLE IF NOT EXISTS seats (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  row_idx INTEGER NOT NULL,
  col_idx INTEGER NOT NULL,
  student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  UNIQUE(class_id, row_idx, col_idx)
);

/* 值日分组：按组轮值，member_ids 为 JSON 数组 [student_id] */
CREATE TABLE IF NOT EXISTS duty_groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  member_ids TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0
);

/* 班委名单：职务 + 职责 */
CREATE TABLE IF NOT EXISTS class_committees (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  duty TEXT DEFAULT '',
  UNIQUE(class_id, student_id, role)
);

/* 家校沟通日志（家长电话在 students.parent_phone） */
CREATE TABLE IF NOT EXISTS home_visit_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  contact_type TEXT DEFAULT '电话',     -- 电话/微信/家访/面谈
  content TEXT DEFAULT '',
  contacted_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')),
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 德育量化：加减分记录 */
CREATE TABLE IF NOT EXISTS moral_scores (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,               -- 正为加分，负为减分
  reason TEXT NOT NULL,
  category TEXT DEFAULT '课堂表现',
  date TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')),
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_moral_scores_student ON moral_scores(student_id, date DESC);

/* 班费台账 */
CREATE TABLE IF NOT EXISTS class_funds (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT '支出',    -- 收入/支出
  amount REAL NOT NULL,
  item TEXT NOT NULL,
  date TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')),
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 班会记录 */
CREATE TABLE IF NOT EXISTS class_meetings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  meeting_date TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')),
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 班主任周记（每周一篇） */
CREATE TABLE IF NOT EXISTS weekly_journals (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,             -- 该周周一 YYYY-MM-DD
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(teacher_id, week_start)
);

/* ---------- 班级日常补全（2026-10-25）：奖励兑换 / 电子奖状 / 谈话记录 / 班级日志 / 请假条 ---------- */

/* 奖励券 / 心愿瓶：教师自定义的可兑换项，用德育积分兑换 */
CREATE TABLE IF NOT EXISTS class_rewards (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT '奖励券',            -- 奖励券/心愿瓶/特权
  cost INTEGER NOT NULL DEFAULT 10,      -- 兑换所需积分
  stock INTEGER NOT NULL DEFAULT 0,      -- 库存，0=不限量
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 兑换记录：reward_name / cost 为快照，奖励被删也不丢记录 */
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reward_id INTEGER REFERENCES class_rewards(id) ON DELETE SET NULL,
  reward_name TEXT NOT NULL DEFAULT '',
  cost INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT '待兑换',          -- 待兑换/已兑换
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_class ON reward_redemptions(class_id, created_at DESC);

/* 电子奖状 */
CREATE TABLE IF NOT EXISTS class_certificates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                   -- 奖项名称
  reason TEXT DEFAULT '',                -- 获奖理由
  issuer TEXT DEFAULT '',                -- 颁发单位/落款
  awarded_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')),
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 谈话记录：带提纲 + 跟进 */
CREATE TABLE IF NOT EXISTS class_talks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  outline TEXT DEFAULT '',               -- 谈话提纲
  content TEXT DEFAULT '',               -- 谈话记录
  follow_up TEXT DEFAULT '',             -- 跟进要点
  talked_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')),
  status TEXT DEFAULT '无需跟进',        -- 无需跟进/待跟进/已跟进
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 班级日志 */
CREATE TABLE IF NOT EXISTS class_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  category TEXT DEFAULT '班级事件',      -- 班级事件/活动/荣誉/问题/其他
  log_date TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD')),
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 请假条 */
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT DEFAULT '事假',              -- 事假/病假/其他
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT '待审批',          -- 待审批/已批准/已驳回
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 错题本：登记 → 订正 → 复测闭环 */
CREATE TABLE IF NOT EXISTS wrong_questions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  subject TEXT DEFAULT '',
  source TEXT DEFAULT '',                -- 来源试卷 / 作业
  knowledge TEXT DEFAULT '',             -- 知识点
  stem TEXT NOT NULL,                    -- 题干
  answer TEXT DEFAULT '',                -- 正确答案 / 解析
  status TEXT DEFAULT '待订正',          -- 待订正/已订正/已复测
  retest_score REAL,                     -- 复测得分
  retest_note TEXT DEFAULT '',
  retest_at TEXT,
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_wrong_questions_class ON wrong_questions(class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wrong_questions_student ON wrong_questions(student_id);

/* 课时记录：课时费统计 + 教师工作量统计 */
CREATE TABLE IF NOT EXISTS lesson_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 1,          -- 课时数（1 课时 = 45 分钟或机构自定义）
  rate REAL NOT NULL DEFAULT 0,           -- 课时单价（元/课时）
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_lesson_logs_teacher_date ON lesson_logs(teacher_id, date DESC);

/* 座位方案：保存/切换多套座次布局 */
CREATE TABLE IF NOT EXISTS seat_plans (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  layout TEXT NOT NULL DEFAULT '[]',      -- [{row,col,student_id,disabled}]
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_seat_plans_class ON seat_plans(class_id, id DESC);

/* 班级数据备份点：payload 保存学生/成绩/考勤/德育/班费/错题的完整快照（JSON） */
CREATE TABLE IF NOT EXISTS class_backups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  counts TEXT DEFAULT '{}',              -- 各表条数快照，列表展示用
  payload TEXT NOT NULL,                 -- JSON 快照
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_class_backups_class ON class_backups(class_id, id DESC);

/* 课表：按班级 + 星期 + 节次定位，同一格唯一 */
CREATE TABLE IF NOT EXISTS timetables (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,              -- 1=周一 … 7=周日
  period INTEGER NOT NULL,               -- 第几节
  subject TEXT NOT NULL DEFAULT '',
  teacher TEXT DEFAULT '',
  note TEXT DEFAULT '',
  is_mine INTEGER NOT NULL DEFAULT 0,    -- 1=这节课是当前教师的课（教师课表与上课提醒依据）
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(class_id, weekday, period)
);

/* 作息时间：每名教师一套（节数 / 第1节开始 / 每节时长 / 课间），用于上课提醒 */
CREATE TABLE IF NOT EXISTS timetable_settings (
  teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
  periods INTEGER NOT NULL DEFAULT 8,
  start_time TEXT NOT NULL DEFAULT '08:00',
  class_minutes INTEGER NOT NULL DEFAULT 40,
  break_minutes INTEGER NOT NULL DEFAULT 10,
  updated_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'))
);

/* 桌面端浏览器快捷登录：一次性授权码（5 分钟有效，claim 后删除）
 * 放在数据库而不是内存，保证 Vercel 多实例/冷启动下也能取回令牌 */
CREATE TABLE IF NOT EXISTS device_codes (
  code TEXT PRIMARY KEY,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  remember INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
);
`);

  /* 兼容旧库：补列（IF NOT EXISTS 幂等） */
  await exec(`
ALTER TABLE classes ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS activated INTEGER DEFAULT 0;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS activated_at TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_admin INTEGER DEFAULT 0;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;   -- 算力余额（激活码到账，供 AI 分析等功能消耗）
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS membership_expires_at TEXT;          -- 会员到期日（YYYY-MM-DD），空=永久
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 1000; -- 该码包含的算力
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS valid_days INTEGER NOT NULL DEFAULT 7; -- 激活后有效天数，0=永久
ALTER TABLE seats ADD COLUMN IF NOT EXISTS disabled INTEGER NOT NULL DEFAULT 0;   -- 1=过道/非座位格（讲台边、单人单座等不规则布局）
ALTER TABLE materials ADD COLUMN IF NOT EXISTS storage_path TEXT DEFAULT '';      -- Supabase Storage 对象路径（空=纯元数据旧记录）
ALTER TABLE materials ADD COLUMN IF NOT EXISTS file_name TEXT DEFAULT '';         -- 原始文件名
ALTER TABLE materials ADD COLUMN IF NOT EXISTS size_bytes BIGINT DEFAULT 0;       -- 文件字节数（展示用 file_size 由它格式化）
ALTER TABLE materials ADD COLUMN IF NOT EXISTS mime TEXT DEFAULT '';              -- 文件 Content-Type
ALTER TABLE students ADD COLUMN IF NOT EXISTS school TEXT DEFAULT '';             -- 就读学校
ALTER TABLE students ADD COLUMN IF NOT EXISTS current_class TEXT DEFAULT '';      -- 就读班级（校外/校内班级名）
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '在读';         -- 在读/毕业/流失
ALTER TABLE students ADD COLUMN IF NOT EXISTS cohort TEXT DEFAULT '';             -- 届别（如 2026 届）
ALTER TABLE students ADD COLUMN IF NOT EXISTS university TEXT DEFAULT '';         -- 考取大学/去向学校
ALTER TABLE students ADD COLUMN IF NOT EXISTS major TEXT DEFAULT '';              -- 专业
ALTER TABLE students ADD COLUMN IF NOT EXISTS fee REAL DEFAULT 0;                 -- 学费 / 辅导费用（元）
ALTER TABLE students ADD COLUMN IF NOT EXISTS destination TEXT DEFAULT '';        -- 毕业去向说明
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS ai_enabled INTEGER NOT NULL DEFAULT 1; -- AI 功能开关（0=关闭）
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT '';             -- 自选主模型（空=服务端默认）
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS finance_enabled INTEGER NOT NULL DEFAULT 0; -- 课时费与工作量功能（默认关闭，由管理员分配）
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '待发送';    -- 待发送/已发送
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent_at TEXT;                    -- 标记已发送的时间
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS is_mine INTEGER NOT NULL DEFAULT 0;  -- 1=我的课（教师课表 / 上课提醒）
ALTER TABLE timetable_settings ADD COLUMN IF NOT EXISTS slots TEXT DEFAULT '';       -- 逐节作息时间 JSON：[{period,start,end}]（各校作息不同，由老师自填）
CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_phone ON teachers(phone);
`);

  /* ---------- 教师账号（密码同 auth.js 的 scrypt 方案） ---------- */
  async function createTeacher(name, phone, password, { activated = 0, isAdmin = 0 } = {}) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const r = await run(
      'INSERT INTO teachers (name, phone, email, password_hash, salt, activated, is_admin) VALUES (?,?,?,?,?,?,?)',
      [name, phone, `${phone}@phone.local`, hash, salt, activated, isAdmin]
    );
    return r.lastInsertRowid;
  }

  let demoRow = await get('SELECT id FROM teachers ORDER BY id LIMIT 1');
  let demoTeacherId = demoRow?.id;
  if (!demoTeacherId) {
    demoTeacherId = await createTeacher('王老师', '13800000000', '123456', { activated: 1 });
    console.log('[db] 演示教师账号: 13800000000 / 123456');
  } else {
    /* 旧库回填：演示账号补手机号并置为已激活 */
    await run("UPDATE teachers SET phone = '13800000000', activated = 1 WHERE id = ? AND phone IS NULL", [demoTeacherId]);
  }

  /* 默认管理员账号（可进管理后台，免激活） */
  const hasAdmin = await get('SELECT 1 FROM teachers WHERE is_admin = 1 LIMIT 1');
  if (!hasAdmin && !(await get('SELECT 1 FROM teachers WHERE phone = ?', ['13900000000']))) {
    await createTeacher('管理员', '13900000000', 'admin123', { activated: 1, isAdmin: 1 });
    console.log('[db] 管理员账号: 13900000000 / admin123');
  }

  /* 旧数据回填到演示账号 */
  for (const t of ['classes', 'courses', 'todos', 'notifications']) {
    await run(`UPDATE ${t} SET teacher_id = ? WHERE teacher_id IS NULL`, [demoTeacherId]);
  }
  /* 演示账号赠送 1000 算力，便于展示余额 */
  await run("UPDATE teachers SET credits = 1000 WHERE phone = '13800000000' AND credits = 0");

  /* ---------------- 种子数据（仅空库时写入） ---------------- */
  const { c } = await get('SELECT COUNT(*) AS c FROM classes');
  if (c === 0) {
    const tid = demoTeacherId;
    await transaction(async (tx) => {
      const insClass = 'INSERT INTO classes (teacher_id, name, grade, description) VALUES (?,?,?,?)';
      const c1 = (await tx.run(insClass, [tid, '三年级(2)班', '三年级', '信息科技兴趣班'])).lastInsertRowid;
      const c2 = (await tx.run(insClass, [tid, '四年级(1)班', '四年级', '创客社团班'])).lastInsertRowid;

      const insStudent =
        'INSERT INTO students (class_id, name, gender, student_no, parent_phone, parent_wechat) VALUES (?,?,?,?,?,?)';
      const names1 = ['陈思远', '李沐宸', '王梓涵', '赵欣怡', '刘子墨', '孙艺涵', '周雨桐', '吴浩然', '郑好', '林一诺'];
      const names2 = ['黄景行', '徐若曦', '马天翊', '朱自清', '胡蝶', '郭沐阳', '何佳琪', '罗启铭'];
      const ids1 = [];
      for (const [i, n] of names1.entries()) {
        ids1.push((await tx.run(insStudent, [c1, n, i % 2 ? '女' : '男', `30${String(i + 1).padStart(2, '0')}`, `1380000${1000 + i}`, `wx_parent_${i + 1}`])).lastInsertRowid);
      }
      const ids2 = [];
      for (const [i, n] of names2.entries()) {
        ids2.push((await tx.run(insStudent, [c2, n, i % 2 ? '女' : '男', `40${String(i + 1).padStart(2, '0')}`, `1390000${2000 + i}`, `wx_parent2_${i + 1}`])).lastInsertRowid);
      }

      const insCourse = 'INSERT INTO courses (teacher_id, name, subject, class_id, schedule, semester) VALUES (?,?,?,?,?,?)';
      const course1 = (await tx.run(insCourse, [tid, '趣味 3D 建模入门', '信息科技', c1, '周二/周四 14:00-15:00', '2026 春季'])).lastInsertRowid;
      const course2 = (await tx.run(insCourse, [tid, '图形化编程与创意智造', '信息科技', c1, '周三 15:30-16:30', '2026 春季'])).lastInsertRowid;
      const course3 = (await tx.run(insCourse, [tid, '3D 打印项目实践', '综合实践', c2, '周五 14:00-15:30', '2026 春季'])).lastInsertRowid;

      const insMaterial = 'INSERT INTO materials (course_id, title, type, file_size, summary) VALUES (?,?,?,?,?)';
      await tx.run(insMaterial, [course1, '第1讲 认识三维坐标系', '课件', '4.2 MB', '通过教室物品定位游戏引入 XYZ 坐标概念']);
      await tx.run(insMaterial, [course1, '第2讲 基本体组合建模', '课件', '6.8 MB', '长方体/圆柱/球体布尔运算实操']);
      await tx.run(insMaterial, [course1, '建模入门单元教案', '教案', '1.1 MB', '4 课时完整教学设计与评价量表']);
      await tx.run(insMaterial, [course1, '布尔运算课堂练习', '习题', '0.6 MB', '3 道阶梯式课堂任务卡']);
      await tx.run(insMaterial, [course2, '第3讲 循环结构小动画', '课件', '5.4 MB', '用循环绘制雪花图案']);
      await tx.run(insMaterial, [course3, '项目一：姓名牌打印', '视频', '86 MB', '从建模到出件全流程演示']);

      const insAssign = 'INSERT INTO assignments (course_id, title, content, deadline) VALUES (?,?,?,?)';
      const a1 = (await tx.run(insAssign, [course1, '设计你的第一枚印章', '使用基本体组合设计一枚个性印章，导出 STL 文件提交。', '2026-10-20 18:00'])).lastInsertRowid;
      const a2 = (await tx.run(insAssign, [course2, '雪花动画创作', '运用循环结构绘制至少 3 种雪花图案并录屏提交。', '2026-10-18 20:00'])).lastInsertRowid;
      await tx.run(insAssign, [course3, '姓名牌切片参数填写', '根据速查表完成姓名牌切片参数截图提交。', '2026-10-24 18:00']);

      const insSub =
        "INSERT INTO submissions (assignment_id, student_id, content, status, score, feedback) VALUES (?,?,?,?,?,?)";
      for (const [i, sid] of ids1.slice(0, 8).entries()) {
        const graded = i < 5;
        await tx.run(insSub, [a1, sid, `印章作品_${i + 1}.stl`, graded ? '已批改' : '待批改', graded ? 85 + (i * 3) % 14 : null, graded ? '结构完整，注意壁厚不小于 1.5mm。' : '']);
      }
      for (const [i, sid] of ids1.slice(0, 6).entries()) {
        await tx.run(insSub, [a2, sid, `雪花动画_${i + 1}.mp4`, i < 3 ? '已批改' : '待批改', i < 3 ? 88 + i * 2 : null, i < 3 ? '循环嵌套运用得当。' : '']);
      }

      const insGrade = 'INSERT INTO grades (student_id, course_id, exam_name, score, exam_date) VALUES (?,?,?,?,?)';
      const exams = [
        ['第1次单元测', '2026-09-05'],
        ['第2次单元测', '2026-09-19'],
        ['月考', '2026-09-30'],
        ['期中模拟', '2026-10-10'],
        ['期中考', '2026-10-14'],
      ];
      for (const [si, sid] of ids1.entries()) {
        const base = 72 + ((si * 7) % 15);
        for (const [ei, [name, date]] of exams.entries()) {
          const trend = (si % 3 === 0 ? -2 : 2) * ei; // 部分学生下滑、部分上升
          const score = Math.max(45, Math.min(100, base + trend + ((si * ei * 13) % 7) - 3));
          await tx.run(insGrade, [sid, course1, name, score, date]);
        }
      }

      const insAtt = 'INSERT INTO attendance (student_id, date, status, remark) VALUES (?,?,?,?)';
      // 考勤日期取最近三天（含今天），保证演示时总览页有今日数据
      const days = [2, 1, 0].map(n => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().slice(0, 10);
      });
      const statusPool = ['出勤', '出勤', '出勤', '出勤', '出勤', '出勤', '出勤', '迟到', '请假', '缺勤'];
      for (const [di, d] of days.entries()) {
        for (const [si, sid] of ids1.entries()) {
          const st = statusPool[(si * 3 + di * 7) % statusPool.length];
          await tx.run(insAtt, [sid, d, st, st === '请假' ? '家长已报备' : st === '迟到' ? '迟到 10 分钟' : st === '缺勤' ? '未告知原因' : '']);
        }
      }

      const insTodo = 'INSERT INTO todos (teacher_id, title, category, due_date, priority, done) VALUES (?,?,?,?,?,?)';
      const offset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      await tx.run(insTodo, [tid, '统计秋游回执单并汇总名单', '活动组织', offset(1), '高', 0]);
      await tx.run(insTodo, [tid, '更换教室后墙创客作品展示区', '环境布置', offset(4), '中', 0]);
      await tx.run(insTodo, [tid, '与陈思远家长沟通近期作业情况', '家校沟通', offset(0), '高', 0]);
      await tx.run(insTodo, [tid, '提交 10 月考勤汇总表给教务处', '行政事务', offset(5), '中', 0]);
      await tx.run(insTodo, [tid, '准备科技节 3D 打印体验摊位物料', '活动组织', offset(12), '低', 0]);
      await tx.run(insTodo, [tid, '发放《创客安全守则》并回收签字', '安全教育', offset(-1), '中', 1]);

      const insNotice = 'INSERT INTO notifications (teacher_id, title, content, target_class_id, channel) VALUES (?,?,?,?,?)';
      await tx.run(insNotice, [
        tid,
        '秋游活动通知',
        '各位家长好，本周五（10月17日）三年级(2)班将组织秋季研学活动，请于周四前提交回执单。集合时间：早上8:00校门口，请为孩子准备水壶与防晒帽。',
        c1, '微信群',
      ]);
      await tx.run(insNotice, [
        tid,
        '考勤异常提醒',
        '您好，您的孩子今日考勤状态为【缺勤】，如已请假请回复本消息说明，或联系班主任核实情况，谢谢配合！',
        c1, '微信私聊',
      ]);
    });
    console.log('[db] 种子数据初始化完成');
  }

  console.log('[db] Supabase Postgres 初始化完成');
}

/* ready 直接暴露 init 的 Promise：失败时 reject，
 * 由使用方决定处理方式（本地启动进程退出；Serverless 返回 503 错误详情） */
const ready = init();

/* 立即附加 no-op catch：杜绝 unhandled rejection。
 * Serverless 环境（Vercel）遇到未处理的 rejection 会直接杀死函数实例，
 * 导致所有请求返回无信息的 500 FUNCTION_INVOCATION_FAILED。
 * 真实错误通过 api/index.js 的 dbReady 转成 503 + message 返回 */
ready.catch(() => {});

module.exports = { all, get, run, transaction, exec, ready, pool };
