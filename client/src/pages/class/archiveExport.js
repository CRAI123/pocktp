import { api, todayStr } from '../../api.js';

/** 最近 n 个月的 YYYY-MM 列表（含当月，升序） */
function lastMonths(n = 6) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * 整班归档导出：把该班一个学期的资料打包成一个 Excel 工作簿（多工作表）
 * 工作表：学生名单 / 成绩 / 考勤汇总 / 德育量化 / 课时记录 / 班费台账 / 班会记录 / 班级日志 / 请假条 / 错题本
 */
export async function exportClassArchive(classId, className) {
  const cid = String(classId);
  const months = lastMonths(6);
  const [students, courses, grades, moral, funds, lessons, meetings, logs, leaves, wrong] = await Promise.all([
    api.get(`/students?class_id=${cid}`),
    api.get('/courses'),
    api.get('/grades'),
    api.get(`/classes/${cid}/moral`),
    api.get(`/classes/${cid}/funds`),
    api.get('/lesson-logs?month=all'),
    api.get(`/classes/${cid}/meetings`),
    api.get(`/classes/${cid}/logs`),
    api.get(`/classes/${cid}/leaves`),
    api.get(`/classes/${cid}/wrong-questions`),
  ]);

  const classCourses = (courses || []).filter(c => String(c.class_id) === cid);
  const courseIds = new Set(classCourses.map(c => c.id));
  const classGrades = (grades || []).filter(g => courseIds.has(g.course_id));
  const classLessons = (lessons?.rows || []).filter(r => String(r.class_id) === cid);

  /* 近 6 个月考勤按学生汇总 */
  const attRes = await Promise.all(months.map(m => api.get(`/classes/${cid}/attendance-monthly?month=${m}`).catch(() => ({ rows: [] }))));
  const attMap = {};
  for (const d of attRes) {
    for (const r of d.rows || []) {
      const cur = attMap[r.student_id] || { present: 0, late: 0, absent: 0, leave: 0 };
      cur.present += Number(r.present) || 0;
      cur.late += Number(r.late) || 0;
      cur.absent += Number(r.absent) || 0;
      cur.leave += Number(r.leave) || 0;
      attMap[r.student_id] = cur;
    }
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const add = (name, aoa) => {
    if (!aoa.length) return;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = (aoa[0] || []).map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const q = (v) => (v == null ? '' : v);

  add('学生名单', [
    ['姓名', '性别', '学号', '就读学校', '就读班级', '学员状态', '届别', '考取大学', '专业', '学费', '毕业去向', '家长电话', '家长微信'],
    ...(students || []).map(s => [s.name, s.gender, s.student_no, s.school, s.current_class, s.status || '在读',
      s.cohort, s.university, s.major, s.fee, s.destination, s.parent_phone, s.parent_wechat].map(q)),
  ]);

  add('成绩', [
    ['姓名', '学号', '课程', '考试', '分数', '满分', '考试日期'],
    ...classGrades.map(g => [g.student_name, g.student_no, g.course_name, g.exam_name, g.score, g.full_score, g.exam_date].map(q)),
  ]);

  add('考勤汇总', [
    ['姓名', '学号', '出勤', '迟到', '缺勤', '请假', '出勤率'],
    ...(students || []).map(s => {
      const a = attMap[s.id] || { present: 0, late: 0, absent: 0, leave: 0 };
      const total = a.present + a.late + a.absent + a.leave;
      const rate = total ? `${(((a.present + a.late) / total) * 100).toFixed(1)}%` : '—';
      return [s.name, s.student_no, a.present, a.late, a.absent, a.leave, rate];
    }),
  ]);

  add('德育量化', [
    ['姓名', '学号', '德育总分', '记录数'],
    ...(moral?.ranking || []).map(r => [r.name, r.student_no, r.total, r.record_count]),
    [],
    ['最近加减分记录'],
    ['日期', '学生', '分数', '类别', '事由'],
    ...(moral?.recent || []).map(r => [r.date, r.student_name, r.score, r.category, r.reason]),
  ]);

  add('课时记录', [
    ['日期', '课程', '课时', '单价', '课时费', '备注'],
    ...classLessons.map(r => [r.date, r.course_name || '', r.hours, r.rate,
      (Number(r.hours) * Number(r.rate)).toFixed(2), r.note]),
  ]);

  add('班费台账', [
    ['日期', '类型', '事项', '金额', '备注'],
    ...(funds?.records || []).map(r => [r.date, r.type, r.item, r.amount, r.remark]),
    [],
    ['累计收入', funds?.income ?? 0],
    ['累计支出', funds?.expense ?? 0],
    ['当前结余', funds?.balance ?? 0],
  ]);

  add('班会记录', [
    ['日期', '标题', '内容'],
    ...(meetings || []).map(m => [m.meeting_date, m.title, m.content]),
  ]);

  add('班级日志', [
    ['日期', '分类', '标题', '内容'],
    ...(logs || []).map(l => [l.log_date, l.category, l.title, l.content]),
  ]);

  add('请假条', [
    ['学生', '类型', '开始日期', '结束日期', '事由', '状态'],
    ...(leaves?.leaves || []).map(l => [l.student_name, l.type, l.start_date, l.end_date, l.reason, l.status]),
  ]);

  add('错题本', [
    ['学生', '学科', '来源', '知识点', '题干', '答案 / 解析', '状态', '复测得分', '复测备注', '登记时间'],
    ...(wrong?.items || []).map(w => [w.student_name, w.subject, w.source, w.knowledge, w.stem, w.answer,
      w.status, w.retest_score, w.retest_note, w.created_at]),
  ]);

  XLSX.writeFile(wb, `${className}_整班归档_${todayStr()}.xlsx`);
}
