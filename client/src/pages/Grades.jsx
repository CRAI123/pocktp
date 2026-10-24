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

  /* ---- 表格批量导入：上传 xlsx/csv → 点击表头选「姓名列」→ 其右侧列均为分数列（表头即考试名） ---- */
  const fileRef = useRef(null);
  const [impOpen, setImpOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // { header, rows, fileName }
  const [nameCol, setNameCol] = useState(0);
  const [impDate, setImpDate] = useState(new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const openImport = () => {
    setSheet(null); setNameCol(0); setDragOver(false);
    setImpDate(new Date().toISOString().slice(0, 10));
    if (fileRef.current) fileRef.current.value = '';
    setImpOpen(true);
  };

  /** 解析表格为二维数组（首行视为表头）；xlsx 动态加载 SheetJS，避免拖累首屏 */
  const parseSheet = async (file) => {
    if (!file) return;
    try {
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
      let rows = [];
      if (ext === 'csv' || ext === 'txt') {
        const text = (await file.text()).replace(/^\uFEFF/, '');
        rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, '')));
      } else if (['xlsx', 'xls'].includes(ext)) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer());
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      } else {
        alert('仅支持 .xlsx / .xls / .csv 文件'); return;
      }
      rows = rows.filter(r => r.some(c => String(c).trim() !== ''));
      if (rows.length < 2) { alert('表格为空或只有表头'); return; }
      const header = rows[0].map(h => String(h ?? '').trim());
      const ni = header.findIndex(h => /姓名|名字|name/i.test(h));
      setSheet({ header, rows: rows.slice(1), fileName: file.name });
      setNameCol(ni >= 0 ? ni : 0);
    } catch (e) {
      alert(`解析失败：${e.message || '文件格式不支持'}`);
    }
  };

  /* 姓名列右侧的列 = 分数列 */
  const scoreCols = sheet ? sheet.header.map((_, i) => i).filter(i => i > nameCol) : [];

  /** 组装成绩行并批量入库 */
  const runImport = async () => {
    if (!sheet || importing) return;
    const byName = Object.fromEntries(students.map(s => [s.name, s]));
    const items = []; const miss = new Set(); let skipped = 0;
    for (const r of sheet.rows) {
      const name = String(r[nameCol] ?? '').trim();
      if (!name) continue;
      const stu = byName[name];
      if (!stu) { miss.add(name); continue; }
      for (const ci of scoreCols) {
        const v = r[ci];
        const num = typeof v === 'number' ? v : Number(String(v).trim());
        if (v === '' || v == null || Number.isNaN(num)) { if (v !== '' && v != null) skipped++; continue; }
        items.push({ student_id: stu.id, exam_name: sheet.header[ci] || `第${ci + 1}列`, score: num });
      }
    }
    if (!items.length) { alert('没有可导入的成绩：请确认已点选「姓名」表头，且其右侧为分数列'); return; }
    setImporting(true);
    try {
      const res = await api.post('/grades/batch', { course_id: courseId, exam_date: impDate, items });
      alert(`导入完成：写入 ${res.ok} 条成绩${skipped ? `，跳过非数值 ${skipped} 格` : ''}${miss.size ? `\n未匹配学生（未导入）：${[...miss].join('、')}` : ''}`);
      setImpOpen(false);
      load();
    } catch (e) {
      alert(e.message || '导入失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="成绩录入与分析"
        desc="班级均分走势、学生个体曲线与分层提升要点"
        action={mode === 'course' && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={openImport} disabled={!courseId}><Upload size={15} />表格导入</Button>
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

      {/* 表格批量导入 */}
      <Modal open={impOpen} onClose={() => !importing && setImpOpen(false)} title="表格导入成绩" width="max-w-3xl">
        <div className="space-y-4">
          {/* 文件选择/拖拽区 */}
          <label
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); parseSheet(e.dataTransfer?.files?.[0]); }}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-4 transition ${
              dragOver ? 'border-[#0071e3] bg-[#0071e3]/[0.06]' : sheet ? 'border-[#28cd41]/40 bg-[#28cd41]/[0.05]' : 'border-black/15 hover:border-[#0071e3]/40 hover:bg-[#0071e3]/[0.03]'
            }`}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="sr-only" onChange={e => parseSheet(e.target.files?.[0])} />
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${sheet ? 'bg-[#28cd41]' : 'brand-gradient'}`}>
              <Upload size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{sheet ? sheet.fileName : dragOver ? '松开鼠标，放入表格' : '点击选择或拖入成绩表格'}</div>
              <div className="text-xs text-ink-secondary">
                {sheet ? `${sheet.rows.length} 行数据 × ${sheet.header.length} 列` : '支持 .xlsx / .xls / .csv，首行为表头'}
              </div>
            </div>
            {sheet && <Badge tone="green">已解析</Badge>}
          </label>

          {sheet && (
            <>
              <div className="rounded-xl bg-bg-light p-3 text-xs leading-relaxed text-ink-secondary">
                <b className="text-ink">点击表头单元格</b>指定「姓名」所在列；其<b className="text-ink">右侧的所有列</b>自动作为分数列，<b className="text-ink">列表头即考试名称</b>。
                当前：姓名列 = <b className="text-[#0071e3]">{sheet.header[nameCol] || `第${nameCol + 1}列`}</b>，分数列 {scoreCols.length} 列（{scoreCols.map(i => sheet.header[i] || `第${i + 1}列`).slice(0, 6).join('、')}{scoreCols.length > 6 ? '…' : ''}）
              </div>

              {/* 表格预览：表头可点选 */}
              <div className="max-h-64 overflow-auto rounded-xl border border-black/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr>
                      {sheet.header.map((h, i) => (
                        <th
                          key={i}
                          onClick={() => setNameCol(i)}
                          title={i === nameCol ? '当前为姓名列' : i > nameCol ? '分数列（点击改为姓名列）' : '点击设为姓名列'}
                          className={`cursor-pointer whitespace-nowrap border-b border-black/10 px-3 py-2 text-left font-semibold transition ${
                            i === nameCol ? 'bg-[#0071e3] text-white' : i > nameCol ? 'bg-[#28cd41]/15 text-[#1fa733] hover:bg-[#28cd41]/25' : 'bg-bg-light text-ink-secondary hover:bg-black/[0.06]'
                          }`}
                        >
                          {h || `第${i + 1}列`}{i === nameCol ? ' · 姓名' : i > nameCol ? ' · 分数' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {sheet.rows.slice(0, 8).map((r, ri) => (
                      <tr key={ri}>
                        {sheet.header.map((_, ci) => (
                          <td key={ci} className={`whitespace-nowrap px-3 py-1.5 ${ci === nameCol ? 'font-medium text-[#0071e3]' : ci > nameCol ? 'text-ink' : 'text-ink-secondary/60'}`}>
                            {String(r[ci] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sheet.rows.length > 8 && <div className="bg-bg-light px-3 py-1.5 text-center text-[11px] text-ink-secondary">… 共 {sheet.rows.length} 行，此处仅预览前 8 行</div>}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[180px] flex-1">
                  <Field label="考试日期（统一应用）">
                    <input type="date" className={inputCls} value={impDate} onChange={e => setImpDate(e.target.value)} />
                  </Field>
                </div>
                <div className="text-xs text-ink-secondary">成绩将计入当前课程；姓名按当前课程班级名单精确匹配</div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setImpOpen(false)} disabled={importing}>取消</Button>
            <Button onClick={runImport} disabled={!sheet || importing || !scoreCols.length}>
              {importing ? '导入中…' : sheet ? `导入 ${sheet.rows.length} 行 × ${scoreCols.length} 列` : '请先选择表格'}
            </Button>
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
