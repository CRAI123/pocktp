import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, TrendingUp, Lightbulb, Users, BarChart3, Upload } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, Cell,
} from 'recharts';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty } from '../components/ui.jsx';

const PALETTE = ['#0071e3', '#28cd41', '#ff9500', '#af52de', '#ff3b30', '#00c6ff', '#34d058', '#ffcc00', '#d783ff', '#5ac8fa'];

export default function Grades() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [mode, setMode] = useState('course'); // course=课程走势 / class=班级统考分析
  const [analysis, setAnalysis] = useState(null);
  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: '', exam_name: '', score: '', exam_date: new Date().toISOString().slice(0, 10) });
  const [showStudents, setShowStudents] = useState([]);

  useEffect(() => {
    api.get('/courses').then(async cs => {
      setCourses(cs);
      // 默认选中第一个有成绩数据的课程
      for (const c of cs) {
        const a = await api.get(`/grades/analysis?course_id=${c.id}`).catch(() => null);
        if (a && a.avgCurve.length) { setCourseId(String(c.id)); return; }
      }
      if (cs.length) setCourseId(String(cs[0].id));
    }).catch(console.error);
  }, []);

  const load = () => {
    if (!courseId) return;
    api.get(`/grades/analysis?course_id=${courseId}`).then(setAnalysis).catch(console.error);
    api.get(`/grades?course_id=${courseId}`).then(setGrades).catch(console.error);
    const course = courses.find(c => String(c.id) === courseId);
    api.get(`/students${course?.class_id ? `?class_id=${course.class_id}` : ''}`).then(s => {
      setStudents(s);
      setShowStudents(prev => prev.length ? prev : s.slice(0, 3).map(x => x.name));
    }).catch(console.error);
  };
  useEffect(() => { load(); }, [courseId, courses]);

  // 图表数据：每次考试一行，含均分与各学生成绩
  const chartData = useMemo(() => {
    if (!analysis) return [];
    return analysis.avgCurve.map((e, i) => ({
      exam: e.exam,
      班级均分: e.average,
      ...Object.fromEntries(
        Object.entries(analysis.byStudent).map(([name, arr]) => [name, arr[i]])
      ),
    }));
  }, [analysis]);

  const submit = async (e) => {
    e.preventDefault();
    await api.post('/grades', { ...form, course_id: courseId, score: +form.score });
    setOpen(false);
    setForm({ ...form, student_id: '', exam_name: '', score: '' });
    load();
  };

  const toggleStudent = (name) =>
    setShowStudents(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  /* ---- CSV 批量导入：列 姓名,得分（考试名称/日期在弹窗内统一填写） ---- */
  const fileRef = useRef(null);
  const [impOpen, setImpOpen] = useState(false);
  const [impForm, setImpForm] = useState({ exam_name: '', exam_date: new Date().toISOString().slice(0, 10) });
  const [importing, setImporting] = useState(false);

  const importCsv = async (file) => {
    if (!file) return;
    if (!impForm.exam_name.trim()) { alert('请先填写考试名称'); return; }
    setImporting(true);
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length && lines[0].includes('姓名')) lines.shift();
      const byName = Object.fromEntries(students.map(s => [s.name, s]));
      let ok = 0, fail = 0; const miss = [];
      for (const line of lines) {
        const [name, score] = line.split(',').map(s => (s || '').trim());
        const stu = byName[name];
        const num = Number(score);
        if (!stu || !name || score === '' || Number.isNaN(num)) { fail++; if (!stu && name) miss.push(name); continue; }
        try {
          await api.post('/grades', { student_id: stu.id, course_id: courseId, exam_name: impForm.exam_name.trim(), exam_date: impForm.exam_date, score: num });
          ok++;
        } catch { fail++; }
      }
      alert(`导入完成：成功 ${ok} 条${fail ? `，失败 ${fail} 条` : ''}${miss.length ? `\n未匹配学生：${miss.join('、')}` : ''}`);
      setImpOpen(false);
      load();
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="成绩录入与分析"
        desc="班级均分走势、学生个体曲线与分层提升要点"
        action={mode === 'course' && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImpOpen(true)} disabled={!courseId}><Upload size={15} />CSV 导入</Button>
            <Button onClick={() => setOpen(true)} disabled={!courseId}><Plus size={16} />录入成绩</Button>
          </div>
        )}
      />

      {/* 视图切换 */}
      <div className="flex gap-1.5">
        <button onClick={() => setMode('course')} className={chipCls(mode === 'course')}>课程走势</button>
        <button onClick={() => setMode('class')} className={chipCls(mode === 'class')}>班级统考分析</button>
      </div>

      {mode === 'class' ? <ClassExamAnalysis /> : (
      <>
      {/* 课程筛选 */}
      <div className="flex flex-wrap gap-2">
        {courses.map(c => (
          <button key={c.id} onClick={() => { setCourseId(String(c.id)); setShowStudents([]); }} className={chipCls(String(c.id) === courseId)}>
            {c.name}
          </button>
        ))}
      </div>

      {!analysis || !analysis.avgCurve.length ? <Empty text="该课程暂无成绩数据，点击右上角录入" /> : (
        <>
          {/* 曲线图 */}
          <div className="card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-[#0071e3]" />
                <h3 className="font-semibold">成绩走势曲线</h3>
              </div>
              {/* 学生显示开关 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Users size={14} className="text-ink-secondary" />
                {students.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => toggleStudent(s.name)}
                    className={`btn-pill border px-2.5 py-0.5 text-xs transition ${showStudents.includes(s.name) ? 'border-transparent text-white' : 'border-black/10 text-ink-secondary hover:border-black/20'}`}
                    style={showStudents.includes(s.name) ? { background: PALETTE[i % PALETTE.length] } : {}}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="exam" tick={{ fontSize: 12, fill: '#6e6e73' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#6e6e73' }} />
                  <Tooltip contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="班级均分" stroke="#1d1d1f" strokeWidth={3} dot={{ r: 4 }} />
                  {students.filter(s => showStudents.includes(s.name)).map((s) => (
                    <Line
                      key={s.id} type="monotone" dataKey={s.name}
                      stroke={PALETTE[students.indexOf(s) % PALETTE.length]}
                      strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 3"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 提升要点 */}
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Lightbulb size={18} className="text-[#ff9500]" />
              <h3 className="font-semibold">教学提升要点</h3>
              <Badge tone="orange">智能生成</Badge>
            </div>
            <ul className="space-y-3">
              {analysis.tips.map((t, i) => (
                <li key={i} className="flex items-start gap-3 rounded-2xl bg-bg-light p-4 text-sm leading-relaxed">
                  <span className="brand-gradient mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* 最近成绩记录 */}
          <div className="card overflow-hidden">
            <div className="border-b border-black/5 px-6 py-4 font-semibold">成绩记录</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-bg-light text-left text-ink-secondary">
                    <th className="px-6 py-3 font-medium">学生</th>
                    <th className="px-6 py-3 font-medium">考试</th>
                    <th className="px-6 py-3 font-medium">日期</th>
                    <th className="px-6 py-3 font-medium">得分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {grades.slice(0, 30).map(g => (
                    <tr key={g.id} className="hover:bg-bg-light/60">
                      <td className="px-6 py-3">{g.student_name} <span className="text-xs text-ink-secondary">{g.student_no}</span></td>
                      <td className="px-6 py-3">{g.exam_name}</td>
                      <td className="px-6 py-3 text-ink-secondary">{g.exam_date}</td>
                      <td className="px-6 py-3">
                        <span className={`font-semibold ${g.score >= 90 ? 'text-[#1fa733]' : g.score < 60 ? 'text-[#ff3b30]' : ''}`}>{g.score}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </>
      )}

      {/* CSV 批量导入 */}
      <Modal open={impOpen} onClose={() => setImpOpen(false)} title="CSV 批量导入成绩">
        <div className="space-y-4">
          <p className="rounded-xl bg-bg-light p-3 text-xs leading-relaxed text-ink-secondary">
            CSV 每行格式：<b className="text-ink">姓名,得分</b>（首行表头可省略）<br />
            例：<code>张三,92</code>。学生按姓名匹配当前课程所在班级。
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="考试名称">
              <input className={inputCls} value={impForm.exam_name} onChange={e => setImpForm({ ...impForm, exam_name: e.target.value })} placeholder="如：第3次单元测" />
            </Field>
            <Field label="考试日期">
              <input type="date" className={inputCls} value={impForm.exam_date} onChange={e => setImpForm({ ...impForm, exam_date: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setImpOpen(false)}>取消</Button>
            <Button onClick={() => fileRef.current?.click()} disabled={importing || !impForm.exam_name.trim()}>
              <Upload size={15} />{importing ? '导入中…' : '选择 CSV 文件'}
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => importCsv(e.target.files?.[0])} />
          </div>
        </div>
      </Modal>

      {/* 录入成绩 */}
      <Modal open={open} onClose={() => setOpen(false)} title="录入成绩">
        <form onSubmit={submit} className="space-y-4">
          <Field label="学生">
            <select required className={inputCls} value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
              <option value="">请选择学生</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}（{s.student_no}）</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="考试名称">
              <input required className={inputCls} value={form.exam_name} onChange={e => setForm({ ...form, exam_name: e.target.value })} placeholder="如：第3次单元测" />
            </Field>
            <Field label="得分">
              <input required type="number" min="0" max="100" className={inputCls} value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} />
            </Field>
          </div>
          <Field label="考试日期">
            <input type="date" className={inputCls} value={form.exam_date} onChange={e => setForm({ ...form, exam_date: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function chipCls(active) {
  return `btn-pill px-4 py-1.5 text-sm font-medium ${
    active ? 'brand-gradient text-white shadow-md shadow-blue-500/20' : 'bg-white text-ink-secondary shadow-sm hover:text-ink'
  }`;
}

const BAND_COLORS = ['#28cd41', '#34d058', '#0071e3', '#ff9500', '#ff3b30'];

/** 班级统考分析：某次考试全班总分排名 + 分数段分布 + 各科均分 */
function ClassExamAnalysis() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null); // { exams, analysis }
  const [exam, setExam] = useState('');

  useEffect(() => {
    api.get('/classes').then(cs => {
      setClasses(cs);
      if (cs.length) setClassId(String(cs[0].id));
    }).catch(console.error);
  }, []);

  /* 切班级：先拉考试列表，默认选最近一次 */
  useEffect(() => {
    if (!classId) return;
    setData(null);
    api.get(`/classes/${classId}/grade-analysis`).then(d => {
      setData(d);
      if (d.exams.length) setExam(d.exams[0].exam_name);
    }).catch(console.error);
  }, [classId]);

  /* 切考试：拉完整分析 */
  useEffect(() => {
    if (!classId || !exam) return;
    api.get(`/classes/${classId}/grade-analysis?exam=${encodeURIComponent(exam)}`).then(setData).catch(console.error);
  }, [classId, exam]);

  if (!classes.length) return <Empty text="暂无班级，请先在班级成员页创建班级" />;

  const a = data?.analysis;
  return (
    <div className="space-y-5">
      {/* 班级 + 考试筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-secondary">班级</span>
        {classes.map(c => (
          <button key={c.id} onClick={() => setClassId(String(c.id))} className={chipCls(String(c.id) === classId)}>{c.name}</button>
        ))}
      </div>
      {data && data.exams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-secondary">考试</span>
          {data.exams.map(e => (
            <button key={e.exam_name} onClick={() => setExam(e.exam_name)} className={chipCls(e.exam_name === exam)}>{e.exam_name}</button>
          ))}
        </div>
      )}

      {!a ? <Empty text="该班级暂无统考成绩，请先在「课程走势」视图录入成绩" /> : (
        <>
          {/* 概览卡片 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: '参考人数', value: a.student_count, sub: `${a.subjects} 科` },
              { label: '班均总分', value: a.avg_total },
              { label: '最高总分', value: a.max_total, cls: 'text-[#1fa733]' },
              { label: '最低总分', value: a.min_total, cls: 'text-[#ff3b30]' },
            ].map((s, i) => (
              <div key={i} className="card p-4">
                <div className={`text-2xl font-bold ${s.cls || ''}`}>{s.value}</div>
                <div className="text-xs text-ink-secondary">{s.label}{s.sub ? ` · ${s.sub}` : ''}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* 分数段分布 */}
            <div className="card p-6">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 size={18} className="text-[#0071e3]" />
                <h3 className="font-semibold">总分分数段分布</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={a.bands} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6e6e73' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6e6e73' }} />
                    <Tooltip contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }} />
                    <Bar dataKey="n" name="人数" radius={[8, 8, 0, 0]}>
                      {a.bands.map((b, i) => <Cell key={i} fill={BAND_COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 各科均分 */}
            <div className="card p-6">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-[#28cd41]" />
                <h3 className="font-semibold">各科班级均分</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={a.perSubject} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="course_name" tick={{ fontSize: 12, fill: '#6e6e73' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#6e6e73' }} />
                    <Tooltip contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }} />
                    <Bar dataKey="avg_score" name="均分" radius={[8, 8, 0, 0]}>
                      {a.perSubject.map((s, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 总分排名 */}
          <div className="card overflow-hidden">
            <div className="border-b border-black/5 px-6 py-4 font-semibold">总分排名</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-bg-light text-left text-ink-secondary">
                    <th className="px-6 py-3 font-medium">名次</th>
                    <th className="px-6 py-3 font-medium">学生</th>
                    <th className="px-6 py-3 font-medium">总分</th>
                    <th className="px-6 py-3 font-medium">均分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {a.ranking.map(r => (
                    <tr key={r.student_id} className="hover:bg-bg-light/60">
                      <td className="px-6 py-3">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          r.rank === 1 ? 'bg-[#ffd60a] text-white' :
                          r.rank === 2 ? 'bg-[#8e8e93] text-white' :
                          r.rank === 3 ? 'bg-[#ff9f0a] text-white' : 'bg-black/[0.05] text-ink-secondary'
                        }`}>{r.rank}</span>
                      </td>
                      <td className="px-6 py-3">{r.name} <span className="text-xs text-ink-secondary">{r.student_no}</span></td>
                      <td className="px-6 py-3 font-semibold">{r.total}</td>
                      <td className="px-6 py-3">
                        <span className={r.avg_score >= 90 ? 'font-semibold text-[#1fa733]' : r.avg_score < 60 ? 'font-semibold text-[#ff3b30]' : ''}>{r.avg_score}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
