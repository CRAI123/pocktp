/**
 * AI 成绩分析任务路由（按教师隔离）
 *  - 创建任务时固化「学生 × 最近三次考试 + 班级均分」快照
 *  - 前端逐个学生调用 /api/ai/score/analyze，每完成一个即回写结果
 *  - 支持暂停/继续、失败重试、刷新后按任务 ID 断点续跑
 */
const express = require('express');
const db = require('../db');
const { own } = require('../auth');
const { ah } = require('../util');

const router = express.Router();

const parseJson = (s, fb) => {
  try { return JSON.parse(s); } catch { return fb; }
};
const str = (v, max = 2000) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* 统一出参：JSON 字段解析 + 进度统计 */
function normJob(j, done = 0, failed = 0) {
  return {
    ...j,
    exam_names: parseJson(j.exam_names, []),
    students: parseJson(j.students, []),
    class_avg: parseJson(j.class_avg, []),
    weak_points: j.weak_points || '',
    done: Number(done) || 0,
    failed: Number(failed) || 0,
  };
}

/** 任务归属校验 */
async function ownJob(teacherId, id) {
  return await db.get('SELECT * FROM score_analysis_jobs WHERE id = ? AND teacher_id = ?', [id, teacherId]);
}

/* ==================== 创建任务 ==================== */
router.post('/jobs', ah(async (req, res) => {
  const { course_id, dimension = 'subject', scope = 'class', exam_names, weak_points = '', student_ids } = req.body || {};
  const exams = [...new Set((Array.isArray(exam_names) ? exam_names : []).map(s => str(s, 50)).filter(Boolean))];
  if (!course_id) return res.status(400).json({ error: '请选择课程' });
  if (exams.length < 2) return res.status(400).json({ error: '请至少选择两次考试成绩（建议三次）' });
  if (exams.length > 3) return res.status(400).json({ error: '最多选择三次考试成绩' });
  if (!(await own.course(req.teacherId, course_id))) return res.status(403).json({ error: '无权使用该课程' });

  const course = await db.get('SELECT * FROM courses WHERE id = ?', [course_id]);
  const dim = dimension === 'total' ? 'total' : 'subject';
  const sc = scope === 'student' ? 'student' : 'class';

  /* 取三次考试的成绩；单科只看本课程，总分汇总本教师全部课程 */
  const rows = await db.all(`
    SELECT g.exam_name, g.score, g.student_id, s.name AS student_name, s.student_no,
           c.subject, c.name AS course_name
    FROM grades g
    JOIN students s ON s.id = g.student_id
    JOIN courses c ON c.id = g.course_id
    WHERE c.teacher_id = ? AND g.exam_name = ANY(?)
    ${dim === 'subject' ? 'AND g.course_id = ?' : ''}
    ORDER BY s.student_no, g.exam_name
  `, dim === 'subject' ? [req.teacherId, exams, course_id] : [req.teacherId, exams]);

  /* 全班范围：只统计该课程所属班级的学生 */
  let allowed = null;
  if (sc === 'class' && course.class_id) {
    const list = await db.all('SELECT id FROM students WHERE class_id = ?', [course.class_id]);
    allowed = new Set(list.map(x => x.id));
  }
  const onlyIds = new Set((Array.isArray(student_ids) ? student_ids : []).map(x => +x).filter(Boolean));

  const map = new Map();
  for (const r of rows) {
    if (allowed && !allowed.has(r.student_id)) continue;
    if (sc === 'student' && onlyIds.size && !onlyIds.has(r.student_id)) continue;
    if (!map.has(r.student_id)) {
      map.set(r.student_id, { id: r.student_id, name: r.student_name, student_no: r.student_no || '', byExam: {} });
    }
    const stu = map.get(r.student_id);
    const bucket = stu.byExam[r.exam_name] || (stu.byExam[r.exam_name] = []);
    bucket.push({ subject: r.subject, score: num(r.score) });
  }

  const students = [];
  for (const stu of map.values()) {
    const scores = exams.map(name => {
      const list = stu.byExam[name] || [];
      if (!list.length) return null;
      const score = dim === 'total'
        ? +list.reduce((s, x) => s + x.score, 0).toFixed(1)
        : list[0].score;
      return dim === 'total'
        ? { exam: name, score, subjects: list.map(x => ({ subject: x.subject, score: x.score })) }
        : { exam: name, score };
    }).filter(Boolean);
    if (!scores.length) continue;
    students.push({ id: stu.id, name: stu.name, student_no: stu.student_no, scores });
  }
  if (!students.length) return res.status(400).json({ error: '所选考试没有可分析的成绩，请先导入成绩' });
  if (students.length > 100) return res.status(400).json({ error: `本次将分析 ${students.length} 名学生，单次最多 100 名，请缩小范围` });

  /* 每次考试的班级均分 */
  const classAvg = exams.map(name => {
    const vals = students.map(s => s.scores.find(x => x.exam === name)?.score).filter(v => v != null);
    return {
      exam: name,
      average: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0,
      max: vals.length ? Math.max(...vals) : 0,
      min: vals.length ? Math.min(...vals) : 0,
      count: vals.length,
    };
  });

  /* 每次考试的班级排名（同分同名次），随学生快照一起保存 */
  const rankMap = new Map();
  for (const name of exams) {
    const list = students
      .map(s => ({ id: s.id, score: s.scores.find(x => x.exam === name)?.score }))
      .filter(x => x.score != null)
      .sort((a, b) => b.score - a.score);
    let lastScore = null;
    let lastRank = 0;
    list.forEach((x, i) => {
      const rank = x.score === lastScore ? lastRank : i + 1;
      lastScore = x.score;
      lastRank = rank;
      rankMap.set(`${name}:${x.id}`, rank);
    });
  }
  for (const s of students) {
    s.ranks = exams
      .map(name => {
        const hit = s.scores.find(x => x.exam === name);
        return hit ? { exam: name, rank: rankMap.get(`${name}:${s.id}`) || 0, total: students.length } : null;
      })
      .filter(Boolean);
  }

  const info = await db.run(`
    INSERT INTO score_analysis_jobs
      (teacher_id, course_id, course_name, subject, scope, dimension, exam_names, weak_points, students, class_avg, total, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    req.teacherId, course_id, course.name, course.subject, sc, dim,
    JSON.stringify(exams), str(weak_points, 2000), JSON.stringify(students), JSON.stringify(classAvg),
    students.length, 'running',
  ]);

  const job = await ownJob(req.teacherId, info.lastInsertRowid);
  res.status(201).json(normJob(job));
}));

/* ==================== 任务列表（续跑入口） ==================== */
router.get('/jobs', ah(async (req, res) => {
  const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 10));
  const rows = await db.all(`
    SELECT j.id, j.course_id, j.course_name, j.subject, j.scope, j.dimension, j.exam_names,
           j.weak_points, j.total, j.status, j.created_at, j.updated_at,
      (SELECT COUNT(*) FROM score_analysis_results r WHERE r.job_id = j.id AND r.status = 'done') AS done,
      (SELECT COUNT(*) FROM score_analysis_results r WHERE r.job_id = j.id AND r.status = 'error') AS failed
    FROM score_analysis_jobs j
    WHERE j.teacher_id = ?
    ORDER BY j.id DESC LIMIT ?
  `, [req.teacherId, limit]);
  res.json(rows.map(j => ({
    ...j,
    exam_names: parseJson(j.exam_names, []),
    done: Number(j.done) || 0,
    failed: Number(j.failed) || 0,
  })));
}));

/* ==================== 任务详情（含已完成结果，供刷新续跑） ==================== */
router.get('/jobs/:id', ah(async (req, res) => {
  const job = await ownJob(req.teacherId, req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  const results = await db.all(`
    SELECT student_id, student_name, scores, result, status, error
    FROM score_analysis_results WHERE job_id = ? ORDER BY id
  `, [job.id]);
  const done = results.filter(r => r.status === 'done').length;
  const failed = results.filter(r => r.status === 'error').length;
  res.json({
    ...normJob(job, done, failed),
    results: results.map(r => ({
      ...r,
      scores: parseJson(r.scores, []),
      result: r.result ? parseJson(r.result, null) : null,
    })),
  });
}));

/* ==================== 回写单个学生结果（幂等 upsert） ==================== */
router.post('/jobs/:id/results', ah(async (req, res) => {
  const job = await ownJob(req.teacherId, req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  const studentId = +req.body?.student_id;
  if (!studentId) return res.status(400).json({ error: 'student_id 必填' });
  const stu = parseJson(job.students, []).find(s => s.id === studentId);
  if (!stu) return res.status(400).json({ error: '该学生不在本次任务中' });
  const status = req.body?.status === 'error' ? 'error' : 'done';
  const result = req.body?.result && typeof req.body.result === 'object' ? req.body.result : null;
  if (status === 'done' && !result) return res.status(400).json({ error: 'result 必填' });
  const error = str(req.body?.error, 500);

  await db.run(`
    INSERT INTO score_analysis_results (job_id, teacher_id, student_id, student_name, scores, result, status, error)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT (job_id, student_id) DO UPDATE SET
      result = EXCLUDED.result, status = EXCLUDED.status, error = EXCLUDED.error
  `, [
    job.id, req.teacherId, studentId, stu.name, JSON.stringify(stu.scores),
    result ? JSON.stringify(result) : '', status, status === 'error' ? error : '',
  ]);

  const counts = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM score_analysis_results WHERE job_id = ? AND status = 'done') AS done,
      (SELECT COUNT(*) FROM score_analysis_results WHERE job_id = ? AND status = 'error') AS failed
  `, [job.id, job.id]);
  const done = Number(counts?.done) || 0;
  const failed = Number(counts?.failed) || 0;

  let jobStatus = job.status;
  if (done + failed >= Number(job.total || 0)) {
    jobStatus = 'done';
    await db.run("UPDATE score_analysis_jobs SET status = 'done', updated_at = to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') WHERE id = ?", [job.id]);
  }
  res.json({ ok: true, done, failed, total: job.total, status: jobStatus });
}));

/* ==================== 暂停 / 继续 / 重开 ==================== */
router.patch('/jobs/:id', ah(async (req, res) => {
  const job = await ownJob(req.teacherId, req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  const status = ['running', 'paused', 'done'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'status 非法' });
  await db.run("UPDATE score_analysis_jobs SET status = ?, updated_at = to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') WHERE id = ?", [status, job.id]);
  res.json({ ok: true, status });
}));

router.delete('/jobs/:id', ah(async (req, res) => {
  const job = await ownJob(req.teacherId, req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在' });
  await db.run('DELETE FROM score_analysis_jobs WHERE id = ?', [job.id]);
  res.json({ ok: true });
}));

module.exports = router;
