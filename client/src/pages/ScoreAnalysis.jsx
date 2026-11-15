import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Play, Pause, RotateCcw, Printer, Upload, Users, User, CheckCircle2,
  AlertCircle, TrendingUp, Target, Brain, Loader2, FileSpreadsheet, MessageSquareText,
  ArrowLeft, History, Trash2,
} from 'lucide-react';
import { api, auth, todayStr } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty } from '../components/ui.jsx';

const CHIP = (on) =>
  `btn-pill border px-3 py-1.5 text-[13px] font-medium transition ${
    on ? 'border-transparent bg-[#0071e3] text-white shadow-sm' : 'border-black/10 bg-white/70 text-ink-secondary hover:border-black/20 hover:text-ink'
  }`;

const DIM_LABEL = { subject: '单科', total: '总分' };
const TREND_TONE = { 上升: 'green', 稳定: 'blue', 波动: 'orange', 下滑: 'red' };

const fmtDur = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '--:--';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function ScoreAnalysis({ embedded = false, initialCourseId = '' }) {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(initialCourseId ? String(initialCourseId) : '');
  const [dimension, setDimension] = useState('subject');
  const [scope, setScope] = useState('class');
  const [exams, setExams] = useState([]);
  const [picked, setPicked] = useState(['', '', '']);
  const [weak, setWeak] = useState('');
  /* 手工录入排名：key = `${exam}::${studentId}`，value = 名次 */
  const [rankScope, setRankScope] = useState('class');
  const [rankTotal, setRankTotal] = useState('');
  const [rankDraft, setRankDraft] = useState({});
  const [students, setStudents] = useState([]);
  const [pickedStudents, setPickedStudents] = useState([]);

  const [step, setStep] = useState(1);
  const [job, setJob] = useState(null);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ done: 0, failed: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [selId, setSelId] = useState(null);

  const stopRef = useRef(false);
  const runRef = useRef(false);
  const restoredRef = useRef(false);

  const course = courses.find(c => String(c.id) === courseId);

  /* ---------- 初始化：课程 + 历史任务 ---------- */
  useEffect(() => {
    api.get('/courses').then(cs => {
      setCourses(cs);
      if (!courseId && cs.length) setCourseId(String(cs[0].id));
    }).catch(console.error);
    loadHistory();
  }, []);

  const loadHistory = () => api.get('/score-analysis/jobs?limit=12').then(setHistory).catch(console.error);

  /* 重新进入页面时自动恢复未完成任务的进度（只恢复展示，不自动消耗 AI 调用） */
  useEffect(() => {
    if (restoredRef.current || !history.length) return;
    restoredRef.current = true;
    const active = history.find(j => j.status !== 'done' && j.done + j.failed < j.total);
    if (active) openJob(active.id);
  }, [history]);

  /* ---------- 课程变化：考试列表 + 班级学生 ---------- */
  useEffect(() => {
    if (!courseId) return;
    setPicked(['', '', '']);
    setRankDraft({});
    api.get(`/grades/exams?course_id=${courseId}`).then(rows => {
      setExams(rows);
      const names = rows.map(r => r.exam_name);
      const arr = ['', '', ''];
      names.slice(-3).forEach((n, i) => { arr[i] = n; });
      setPicked(arr);
    }).catch(console.error);
    const c = courses.find(x => String(x.id) === courseId);
    const url = c?.class_id ? `/students?class_id=${c.class_id}` : '/students';
    api.get(url).then(s => { setStudents(s); setPickedStudents([]); }).catch(console.error);
  }, [courseId, courses]);

  /* 进度计时刷新 */
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const normalizedPicked = picked.filter(Boolean);
  const eta = useMemo(() => {
    if (!running || sessionDone <= 0) return null;
    const remaining = Math.max(0, sessionTotal - sessionDone);
    const elapsed = now - startedAt;
    return (elapsed / sessionDone) * remaining;
  }, [running, sessionDone, sessionTotal, startedAt, now]);

  const loadJob = async (id) => {
    const d = await api.get(`/score-analysis/jobs/${id}`);
    setJob(d);
    setResults(d.results || []);
    setProgress({ done: d.done, failed: d.failed, total: d.total });
    return d;
  };

  /* ---------- 逐生运行（并发 2，写回服务端，可暂停/续跑） ---------- */
  const runJob = async (jobId) => {
    if (runRef.current) return;
    runRef.current = true;
    stopRef.current = false;
    setRunning(true);
    setPaused(false);
    setError('');
    try {
      const d = await loadJob(jobId);
      const doneSet = new Set((d.results || []).filter(r => r.status === 'done').map(r => r.student_id));
      const pending = (d.students || []).filter(s => !doneSet.has(s.id));
      setSessionDone(0);
      setSessionTotal(pending.length);
      setStartedAt(Date.now());
      let cursor = 0;

      const worker = async () => {
        while (!stopRef.current) {
          const i = cursor++;
          if (i >= pending.length) return;
          const stu = pending[i];
          let success = false;
          try {
            /* 单次失败多为 AI 超时/输出截断，自动再试一次（算力不足、账号异常不重试） */
            let r = null;
            let lastErr = null;
            for (let attempt = 0; attempt < 2 && !r; attempt++) {
              try {
                r = await api.post('/ai/score/analyze', {
                  student_name: stu.name,
                  scores: stu.scores,
                  class_avg: d.class_avg,
                  weak_points: d.weak_points,
                  dimension: d.dimension,
                  course_name: d.course_name,
                  subject: d.subject,
                  ranks: stu.ranks,
                });
              } catch (err) {
                lastErr = err;
                const msg = String(err?.message || '');
                if (msg.includes('登录已过期') || msg.includes('算力不足') || msg.includes('AI 功能已关闭')) break;
                if (attempt === 0) await new Promise(res => setTimeout(res, 800));
              }
            }
            if (!r) throw lastErr || new Error('分析失败');
            await api.post(`/score-analysis/jobs/${jobId}/results`, {
              student_id: stu.id, result: r.result, status: 'done',
            });
            success = true;
            setResults(prev => [...prev.filter(x => x.student_id !== stu.id), {
              student_id: stu.id, student_name: stu.name, scores: stu.scores, result: r.result, status: 'done',
            }]);
          } catch (e) {
            if (String(e?.message || '').includes('登录已过期')) { stopRef.current = true; return; }
            await api.post(`/score-analysis/jobs/${jobId}/results`, {
              student_id: stu.id, status: 'error', error: e?.message || '分析失败',
            }).catch(() => {});
            setResults(prev => [...prev.filter(x => x.student_id !== stu.id), {
              student_id: stu.id, student_name: stu.name, scores: stu.scores, result: null,
              status: 'error', error: e?.message || '分析失败',
            }]);
          } finally {
            setSessionDone(n => n + 1);
            setProgress(p => ({
              ...p,
              done: p.done + (success ? 1 : 0),
              failed: p.failed + (success ? 0 : 1),
            }));
          }
        }
      };

      await Promise.all([worker(), worker()]);
      const final = await loadJob(jobId).catch(() => null);
      if (final && final.done + final.failed >= final.total && final.failed === 0) setStep(3);
    } catch (e) {
      setError(e?.message || '任务启动失败');
    } finally {
      runRef.current = false;
      setRunning(false);
    }
  };

  const createJob = async () => {
    setError('');
    if (!courseId) return setError('请先选择课程');
    if (normalizedPicked.length < 2) return setError('请至少选择两次考试成绩（建议三次）');
    if (scope === 'student' && !pickedStudents.length) return setError('请至少选择一名学生');
    /* 手工录入的排名作为覆盖值；未填写的考试由服务端按成绩自动排名 */
    const total = parseInt(rankTotal, 10) || 0;
    const rank_overrides = Object.entries(rankDraft)
      .map(([k, v]) => {
        const idx = k.lastIndexOf('::');
        const exam = k.slice(0, idx);
        const rank = parseInt(v, 10);
        return { exam, student_id: +k.slice(idx + 2), rank, total, scope: rankScope };
      })
      .filter(x => x.exam && x.student_id && x.rank > 0);
    try {
      const j = await api.post('/score-analysis/jobs', {
        course_id: courseId,
        dimension,
        scope,
        exam_names: normalizedPicked,
        weak_points: weak,
        student_ids: scope === 'student' ? pickedStudents : undefined,
        rank_overrides,
      });
      setJob(j);
      setResults([]);
      setProgress({ done: 0, failed: 0, total: j.total });
      setStep(2);
      loadHistory();
      runJob(j.id);
    } catch (e) {
      setError(e?.message || '创建任务失败');
    }
  };

  const pause = async () => {
    stopRef.current = true;
    setPaused(true);
    if (job) await api.patch(`/score-analysis/jobs/${job.id}`, { status: 'paused' }).catch(() => {});
  };

  const resume = async () => {
    if (!job) return;
    await api.patch(`/score-analysis/jobs/${job.id}`, { status: 'running' }).catch(() => {});
    runJob(job.id);
  };

  const retryFailed = async () => {
    if (!job) return;
    await api.patch(`/score-analysis/jobs/${job.id}`, { status: 'running' }).catch(() => {});
    runJob(job.id);
  };

  const openJob = async (id) => {
    try {
      const d = await loadJob(id);
      setCourseId(d.course_id ? String(d.course_id) : courseId);
      setStep(d.status === 'done' ? 3 : 2);
    } catch (e) {
      alert(e?.message || '打开任务失败');
    }
  };

  const removeJob = async (id, e) => {
    e.stopPropagation();
    if (!confirm('删除这条分析记录？')) return;
    await api.del(`/score-analysis/jobs/${id}`).catch(() => {});
    if (job?.id === id) { setJob(null); setResults([]); setStep(1); }
    loadHistory();
  };

  const backToConfig = () => {
    setStep(1);
    setJob(null);
    setResults([]);
    loadHistory();
  };

  /* ---------- 导入成绩 ---------- */
  const [impOpen, setImpOpen] = useState(false);
  const [impTab, setImpTab] = useState('file');
  const [impDate, setImpDate] = useState(todayStr());
  const [impExam, setImpExam] = useState('');
  const [impText, setImpText] = useState('');
  const [impBusy, setImpBusy] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [nameCol, setNameCol] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [impRankScope, setImpRankScope] = useState('class');
  const [impRankTotal, setImpRankTotal] = useState('');
  const fileRef = useRef(null);

  const openImport = () => {
    setSheet(null); setNameCol(0); setParsed(null); setImpText(''); setImpExam('');
    setImpRankScope('class'); setImpRankTotal('');
    setImpDate(todayStr()); setImpTab('file');
    if (fileRef.current) fileRef.current.value = '';
    setImpOpen(true);
  };

  /* 下载导入模板：姓名 + 每次考试的成绩列与排名列（已有数据自动填好，只需补空缺） */
  const downloadTemplate = async () => {
    const cols = normalizedPicked.length ? normalizedPicked : exams.slice(-3).map(x => x.exam_name);
    if (!cols.length) cols.push('第一次月考');
    let rows = [];
    try {
      const gs = await api.get(`/grades?course_id=${courseId}`);
      const sm = new Map();
      const rm = new Map();
      gs.forEach(g => {
        sm.set(`${g.student_id}:${g.exam_name}`, g.score);
        if (Number(g.rank) > 0) rm.set(`${g.student_id}:${g.exam_name}`, g.rank);
      });
      rows = students.map(s => [s.name, ...cols.flatMap(c => [
        sm.get(`${s.id}:${c}`) ?? '',
        rm.get(`${s.id}:${c}`) ?? '',
      ])]);
    } catch {
      rows = students.map(s => [s.name, ...cols.flatMap(() => ['', ''])]);
    }
    if (!rows.length) rows = [['张三', ...cols.flatMap(() => ['', ''])]];
    const header = ['姓名', ...cols.flatMap(c => [c, `${c}排名`])];
    const csv = '\uFEFF' + [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `成绩导入模板_${course?.name || '课程'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const byName = useMemo(() => {
    const m = new Map();
    students.forEach(s => m.set(String(s.name).trim(), s));
    return m;
  }, [students]);

  const importSheet = async () => {
    if (!sheet || impBusy) return;
    const total = parseInt(impRankTotal, 10) || 0;
    /* 识别排名列：表头形如「第一次月考排名 / 名次 / rank」，或成绩列右侧紧跟的「排名」 */
    const rankCols = new Map();
    sheet.header.forEach((h, i) => {
      if (i <= nameCol) return;
      const m = String(h).match(/^(.*?)\s*(排名|名次|rank)\s*$/i);
      if (!m) return;
      const prev = String(sheet.header[i - 1] ?? '').trim();
      const exam = m[1].trim() || (/排名|名次|rank/i.test(prev) ? '' : prev);
      if (exam) rankCols.set(i, exam);
    });
    const scoreCols = sheet.header.map((_, i) => i).filter(i => i > nameCol && !rankCols.has(i));
    const items = [];
    let missed = 0;
    for (const r of sheet.rows) {
      const name = String(r[nameCol] ?? '').trim();
      const stu = byName.get(name);
      if (!stu) { missed++; continue; }
      for (const ci of scoreCols) {
        const raw = r[ci];
        const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
        if (raw === '' || raw == null || Number.isNaN(n)) continue;
        const exam = sheet.header[ci] || `第${ci + 1}列`;
        /* 同一考试的排序列：有值才写入，空值保持自动排名 */
        let rank = 0;
        for (const [rci, rexam] of rankCols) {
          if (rexam !== exam) continue;
          const rv = Math.round(Number(String(r[rci] ?? '').trim()));
          if (Number.isFinite(rv) && rv > 0) rank = rv;
        }
        items.push({
          student_id: stu.id,
          exam_name: exam,
          score: n,
          rank,
          rank_total: rank && total ? total : 0,
          rank_scope: rank ? impRankScope : '',
        });
      }
    }
    if (!items.length) return alert('没有可导入的成绩：请确认姓名列选择正确，且其右侧为分数列');
    const withRank = items.filter(i => i.rank > 0).length;
    setImpBusy(true);
    try {
      const r = await api.post('/grades/batch', { course_id: courseId, exam_date: impDate, items });
      alert(`导入完成：写入 ${r.ok} 条成绩${withRank ? `（含 ${withRank} 条排名）` : ''}${missed ? `，${missed} 行姓名未匹配` : ''}`);
      setImpOpen(false);
      const rows2 = await api.get(`/grades/exams?course_id=${courseId}`);
      setExams(rows2);
    } catch (e) {
      alert(e?.message || '导入失败');
    } finally {
      setImpBusy(false);
    }
  };

  const parseMessage = async () => {
    if (!impText.trim()) return alert('请粘贴成绩消息');
    setImpBusy(true);
    try {
      const r = await api.post('/ai/score/parse', { text: impText });
      setParsed(r.items || []);
      if (!r.items?.length) alert('没有识别到成绩，请检查消息内容');
    } catch (e) {
      alert(e?.message || '解析失败');
    } finally {
      setImpBusy(false);
    }
  };

  const importParsed = async () => {
    if (!parsed?.length) return;
    const exam = impExam.trim();
    if (!exam) return alert('请填写这次考试的名称');
    const total = parseInt(impRankTotal, 10) || 0;
    const items = [];
    let missed = 0;
    for (const p of parsed) {
      const stu = byName.get(String(p.name).trim());
      if (!stu) { missed++; continue; }
      items.push({
        student_id: stu.id,
        exam_name: exam,
        score: p.score,
        rank: p.rank > 0 ? p.rank : 0,
        rank_total: p.rank > 0 ? (p.total || total) : 0,
        rank_scope: p.rank > 0 ? impRankScope : '',
      });
    }
    if (!items.length) return alert('识别的姓名都未匹配到班级学生，请检查名单');
    setImpBusy(true);
    try {
      const r = await api.post('/grades/batch', { course_id: courseId, exam_date: impDate, items });
      alert(`导入完成：写入 ${r.ok} 条成绩${missed ? `，${missed} 人未匹配` : ''}`);
      setImpOpen(false);
      setParsed(null);
      const rows2 = await api.get(`/grades/exams?course_id=${courseId}`);
      setExams(rows2);
      setPicked(prev => {
        const names = rows2.map(x => x.exam_name);
        const arr = ['', '', ''];
        names.slice(-3).forEach((n, i) => { arr[i] = n; });
        return arr;
      });
    } catch (e) {
      alert(e?.message || '导入失败');
    } finally {
      setImpBusy(false);
    }
  };

  /* ---------- 报告数据 ---------- */
  const report = results.filter(r => r.status === 'done' && r.result);
  const current = report.find(r => r.student_id === selId) || report[0];
  const studentsMeta = job?.students || [];
  const classAvg = job?.class_avg || [];
  const summary = useMemo(() => {
    if (!report.length) return null;
    const gains = report.map(r => (r.result.predicted_gain.min + r.result.predicted_gain.max) / 2);
    const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
    const weakCount = {};
    report.forEach(r => (r.result.weak_points || []).forEach(w => { weakCount[w] = (weakCount[w] || 0) + 1; }));
    const topWeak = Object.entries(weakCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    /* 排名进步人数：最近一次排名优于第一次（同分同名次，跳过缺失） */
    const doneIds = new Set(report.map(r => r.student_id));
    const improved = studentsMeta.filter(s => {
      if (!doneIds.has(s.id)) return false;
      const valid = (s.ranks || []).filter(x => x.rank > 0);
      return valid.length >= 2 && valid[valid.length - 1].rank < valid[0].rank;
    }).length;
    const declineRank = studentsMeta.filter(s => {
      if (!doneIds.has(s.id)) return false;
      const valid = (s.ranks || []).filter(x => x.rank > 0);
      return valid.length >= 2 && valid[valid.length - 1].rank > valid[0].rank;
    }).length;
    return { avgGain, topWeak, improved, declineRank, count: report.length };
  }, [report, studentsMeta]);

  const pct = progress.total ? Math.min(100, Math.round(((progress.done + progress.failed) / progress.total) * 100)) : 0;
  const hasRemaining = job && (job.done + job.failed < job.total);
  const resumeJob = history.find(j => j.status !== 'done' && j.done + j.failed < j.total);

  /* ==================== 渲染 ==================== */
  return (
    <div className="space-y-6">
      {!embedded && (
        <SectionHeader
          title="AI 成绩分析"
          desc="导入三次考试成绩并填写薄弱点，AI 逐个学生分析，预测短期提分分值并给出自我提升方案"
          action={step !== 1 && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={backToConfig}><ArrowLeft size={15} />返回配置</Button>
              {step === 3 && (
                <Button variant="secondary" onClick={() => window.print()} title="在打印对话框中选择「另存为 PDF」即可导出">
                  <Printer size={15} />打印 / 导出 PDF
                </Button>
              )}
            </div>
          )}
        />
      )}

      {embedded && step !== 1 && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={backToConfig}><ArrowLeft size={15} />返回配置</Button>
          {step === 3 && (
                <Button variant="secondary" onClick={() => window.print()} title="在打印对话框中选择「另存为 PDF」即可导出">
                  <Printer size={15} />打印 / 导出 PDF
                </Button>
              )}
        </div>
      )}

      {/* 步骤条 */}
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        {['选择考试与范围', '逐个 AI 分析', '分析报告'].map((t, i) => {
          const n = i + 1;
          const on = step === n;
          const done = step > n;
          return (
            <div key={t} className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                on ? 'bg-[#0071e3] text-white' : done ? 'bg-[#28cd41]/15 text-[#1a7f2b]' : 'bg-black/[0.05] text-ink-secondary'
              }`}>{done ? '✓' : n}</span>
              <span className={on ? 'font-semibold text-ink' : ''}>{t}</span>
              {n < 3 && <span className="mx-1 h-px w-6 bg-black/10 sm:w-10" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-[#ff3b30]/8 px-4 py-3 text-sm text-[#b3251c]">
          <AlertCircle size={16} />{error}
        </div>
      )}

      {/* 续跑提示 */}
      {step === 1 && resumeJob && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-[#ff9500]/25 bg-[#ff9500]/[0.04] p-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">有未完成的分析任务</div>
            <div className="mt-0.5 truncate text-xs text-ink-secondary">
              {resumeJob.course_name} · {resumeJob.exam_names.join(' / ')} · 已完成 {resumeJob.done}/{resumeJob.total}
            </div>
          </div>
          <Button variant="secondary" onClick={() => openJob(resumeJob.id)}><Play size={15} />继续分析</Button>
        </div>
      )}

      {/* ==================== 步骤 1：配置 ==================== */}
      {step === 1 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-5">
            <div className="card space-y-5 p-5 sm:p-6">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-ink">选择课程</div>
                <div className="flex flex-wrap gap-2">
                  {courses.map(c => (
                    <button key={c.id} onClick={() => setCourseId(String(c.id))} className={CHIP(String(c.id) === courseId)}>
                      {c.name}<span className="ml-1 opacity-60">{c.subject}</span>
                    </button>
                  ))}
                  {!courses.length && <span className="text-sm text-ink-secondary">暂无课程，请先到「课程列表」创建</span>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-[13px] font-semibold text-ink">分析维度</div>
                  <div className="flex gap-2">
                    <button onClick={() => setDimension('subject')} className={CHIP(dimension === 'subject')}>单科成绩</button>
                    <button onClick={() => setDimension('total')} className={CHIP(dimension === 'total')}>总分（多科汇总）</button>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[13px] font-semibold text-ink">分析范围</div>
                  <div className="flex gap-2">
                    <button onClick={() => setScope('class')} className={CHIP(scope === 'class')}><Users size={14} className="mr-1 inline" />全班</button>
                    <button onClick={() => setScope('student')} className={CHIP(scope === 'student')}><User size={14} className="mr-1 inline" />指定学生</button>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[13px] font-semibold text-ink">最近三次考试</div>
                  <Button variant="secondary" onClick={openImport} disabled={!courseId} className="!px-3 !py-1.5 !text-xs">
                    <Upload size={14} />导入/补充成绩
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {['第一次', '第二次', '第三次'].map((label, i) => (
                    <label key={label} className="block">
                      <span className="mb-1 block text-[11px] text-ink-secondary">{label}（较早 → 较新）</span>
                      <select
                        value={picked[i] || ''}
                        onChange={e => setPicked(prev => prev.map((p, j) => (j === i ? e.target.value : p)))}
                        className={inputCls}
                      >
                        <option value="">{i === 2 ? '可不选' : '请选择考试'}</option>
                        {exams.filter(x => !picked.some((p, j) => j !== i && p === x.exam_name)).map(x => (
                          <option key={x.exam_name} value={x.exam_name}>{x.exam_name}（{x.exam_date}）</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {exams.length < 2 && <div className="mt-2 text-xs text-[#a85300]">该课程成绩不足两次，请先导入成绩</div>}
              </div>

              <Field label="学生薄弱点（可多写，AI 会结合成绩一起分析）">
                <textarea
                  value={weak}
                  onChange={e => setWeak(e.target.value)}
                  rows={3}
                  placeholder="例如：文言文实词积累不足、作文结构松散、计算粗心、英语完形填空失分多……"
                  className={inputCls}
                />
              </Field>

              {/* 手工录入排名：跨考试难度不同，排名比分数更能反映真实水平 */}
              <details className="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-ink">
                  录入排名（可选）
                  <span className="ml-1.5 font-normal text-[11px] text-ink-secondary">不填则按成绩自动排名；成绩表里已导入的排名也会自动使用</span>
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-[13px]">
                      <div className="mb-1 text-ink-secondary">排名口径</div>
                      <select value={rankScope} onChange={e => setRankScope(e.target.value)} className={inputCls}>
                        <option value="class">班级排名</option>
                        <option value="grade">年级排名</option>
                      </select>
                    </label>
                    <label className="text-[13px]">
                      <div className="mb-1 text-ink-secondary">{rankScope === 'grade' ? '年级' : '班级'}总人数（选填）</div>
                      <input
                        type="number"
                        min="1"
                        value={rankTotal}
                        onChange={e => setRankTotal(e.target.value)}
                        placeholder={students.length ? String(students.length) : '例如 50'}
                        className={`${inputCls} w-32`}
                      />
                    </label>
                  </div>
                  {normalizedPicked.length ? (
                    <div className="max-h-72 overflow-auto rounded-xl border border-black/[0.06] bg-white/70">
                      <table className="w-full text-left text-[13px]">
                        <thead className="sticky top-0 bg-black/[0.03] text-[11px] text-ink-secondary">
                          <tr>
                            <th className="px-3 py-2 font-medium">学生</th>
                            {normalizedPicked.map(e => <th key={e} className="px-3 py-2 font-medium">{e} 名次</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {(scope === 'student' ? students.filter(s => pickedStudents.includes(s.id)) : students).map(s => (
                            <tr key={s.id} className="border-t border-black/[0.05]">
                              <td className="px-3 py-1.5 text-ink">{s.name}</td>
                              {normalizedPicked.map(e => {
                                const k = `${e}::${s.id}`;
                                return (
                                  <td key={e} className="px-3 py-1">
                                    <input
                                      type="number"
                                      min="1"
                                      value={rankDraft[k] || ''}
                                      onChange={ev => setRankDraft(prev => ({ ...prev, [k]: ev.target.value }))}
                                      placeholder="自动"
                                      className="w-20 rounded-lg border border-black/10 bg-white px-2 py-1 text-[12px] outline-none focus:border-[#0071e3]"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-xs text-ink-secondary">请先选择考试，再录入对应名次</div>
                  )}
                </div>
              </details>

              {scope === 'student' && (
                <div>
                  <div className="mb-2 text-[13px] font-semibold text-ink">选择学生（{pickedStudents.length} 人）</div>
                  <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-black/[0.06] bg-black/[0.015] p-3">
                    {students.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setPickedStudents(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                        className={CHIP(pickedStudents.includes(s.id))}
                      >
                        {s.name}
                      </button>
                    ))}
                    {!students.length && <span className="text-xs text-ink-secondary">未获取到学生名单</span>}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-4">
                <div className="text-xs text-ink-secondary">
                  将分析 <span className="font-semibold text-ink">{scope === 'student' ? pickedStudents.length : students.length}</span> 名学生
                  {dimension === 'total' && '（总分 = 全部课程成绩之和）'}
                </div>
                <Button onClick={createJob}>
                  <Sparkles size={16} />开始 AI 分析
                </Button>
              </div>
            </div>
          </div>

          {/* 历史任务 */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <History size={16} className="text-ink-secondary" />
              <h3 className="text-sm font-semibold text-ink">历史分析</h3>
            </div>
            <div className="space-y-2">
              {history.map(j => (
                <button
                  key={j.id}
                  onClick={() => openJob(j.id)}
                  className="group w-full rounded-xl border border-black/[0.06] bg-white/60 p-3 text-left transition hover:border-[#0071e3]/25 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{j.course_name || '成绩分析'}</span>
                    <button onClick={(e) => removeJob(j.id, e)} className="shrink-0 text-ink-secondary/50 opacity-0 transition hover:text-[#d70015] group-hover:opacity-100">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-ink-secondary">{j.exam_names.join(' / ')}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <Badge tone={j.status === 'done' ? 'green' : j.status === 'paused' ? 'orange' : 'blue'}>
                      {j.status === 'done' ? '已完成' : j.status === 'paused' ? '已暂停' : '进行中'}
                    </Badge>
                    <span className="text-ink-secondary">{j.done}/{j.total} · {DIM_LABEL[j.dimension]}</span>
                  </div>
                </button>
              ))}
              {!history.length && <div className="py-8 text-center text-xs text-ink-secondary">暂无历史记录</div>}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 步骤 2：进度 ==================== */}
      {step === 2 && job && (
        <div className="space-y-5">
          <div className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Brain size={18} className="text-[#0071e3]" />
                  <h3 className="text-base font-semibold text-ink">正在逐个分析学生</h3>
                  {running && <Loader2 size={15} className="animate-spin text-[#0071e3]" />}
                </div>
                <div className="mt-1 text-xs text-ink-secondary">
                  {job.course_name} · {DIM_LABEL[job.dimension]} · {job.exam_names.join(' / ')}
                </div>
              </div>
              <div className="flex gap-2">
                {running
                  ? <Button variant="secondary" onClick={pause}><Pause size={15} />暂停</Button>
                  : hasRemaining
                    ? <Button onClick={resume}><Play size={15} />{paused ? '继续分析' : '继续'}</Button>
                    : <Button onClick={() => setStep(3)}><CheckCircle2 size={15} />查看报告</Button>}
                {!running && progress.failed > 0 && (
                  <Button variant="secondary" onClick={retryFailed}><RotateCcw size={15} />重试失败（{progress.failed}）</Button>
                )}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-1.5 flex items-end justify-between text-xs text-ink-secondary">
                <span>进度：{progress.done + progress.failed} / {progress.total} 人</span>
                <span className="num text-base font-semibold text-ink">{pct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                <div className="brand-gradient h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="已完成" value={progress.done} tone="green" />
                <Stat label="失败" value={progress.failed} tone="red" />
                <Stat label="已用时" value={running ? fmtDur(now - startedAt) : fmtDur(0)} />
                <Stat label="预计剩余" value={running ? fmtDur(eta) : (hasRemaining ? '待继续' : '--:--')} tone="orange" />
              </div>
              {progress.failed > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-[#a85300]">
                  <AlertCircle size={13} />有学生分析失败，可点「重试失败」补齐；已成功的学生不会重复调用。
                </div>
              )}
            </div>
          </div>

          {/* 实时结果流 */}
          <div className="card p-5">
            <div className="mb-3 text-sm font-semibold text-ink">实时结果</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(job.students || []).map(s => {
                const r = results.find(x => x.student_id === s.id);
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-ink">{s.name}</div>
                      <div className="truncate text-[11px] text-ink-secondary">{s.scores.map(x => x.score).join(' → ')}</div>
                    </div>
                    {r?.status === 'done'
                      ? <Badge tone="green">+{r.result.predicted_gain.min}~{r.result.predicted_gain.max}</Badge>
                      : r?.status === 'error'
                        ? <Badge tone="red">失败</Badge>
                        : <span className="text-[11px] text-ink-secondary/60">等待</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 步骤 3：报告 ==================== */}
      {step === 3 && job && (
        <div className="space-y-5">
          {!report.length ? (
            <Empty text="暂无分析结果" desc="请返回进度页继续分析，或重试失败的学生" />
          ) : (
            <>
              {/* 全班汇总 */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="已完成分析" value={`${report.length} 人`} tone="green" />
                <Stat label="平均预计提分" value={`+${summary.avgGain.toFixed(1)} 分`} tone="orange" />
                <Stat label="最高预计提分" value={`+${Math.max(...report.map(r => r.result.predicted_gain.max))} 分`} tone="blue" />
                <Stat label="排名进步" value={`${summary.improved} 人`} tone="green" />
                <Stat label="排名下滑" value={`${summary.declineRank} 人`} tone="red" />
              </div>

              {!!summary.topWeak.length && (
                <div className="card p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Target size={16} className="text-[#ff9500]" />
                    <h3 className="text-sm font-semibold text-ink">全班共性薄弱点</h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.topWeak.map(([w, n]) => <Badge key={w} tone="orange">{w} · {n} 人</Badge>)}
                  </div>
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                {/* 学生列表 */}
                <div className="card max-h-[70vh] overflow-y-auto p-3">
                  {report.map(r => {
                    const g = r.result.predicted_gain;
                    const on = current?.student_id === r.student_id;
                    return (
                      <button
                        key={r.student_id}
                        onClick={() => setSelId(r.student_id)}
                        className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left transition ${on ? 'bg-[#0071e3]/8 ring-1 ring-inset ring-[#0071e3]/20' : 'hover:bg-black/[0.03]'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-ink">{r.student_name}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-[#1a7f2b]">+{g.min}~{g.max}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-secondary">
                          <span>{r.scores.map(x => x.score).join(' → ')}</span>
                          <Badge tone={TREND_TONE[r.result.trend] || 'gray'}>{r.result.trend}</Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 单人报告 */}
                {current && (
                  <ReportCard
                    item={current}
                    classAvg={classAvg}
                    ranks={(studentsMeta.find(s => s.id === current.student_id)?.ranks) || []}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== 打印报告（仅打印时可见） ==================== */}
      {step === 3 && job && report.length > 0 && (
        <PrintReport job={job} report={report} summary={summary} />
      )}

      {/* ==================== 导入成绩弹窗 ==================== */}
      <Modal open={impOpen} onClose={() => setImpOpen(false)} title="导入/补充成绩" width="max-w-2xl">
        <div className="mb-4 flex gap-1.5">
          <button onClick={() => setImpTab('file')} className={CHIP(impTab === 'file')}><FileSpreadsheet size={14} className="mr-1 inline" />表格文件</button>
          <button onClick={() => setImpTab('paste')} className={CHIP(impTab === 'paste')}><MessageSquareText size={14} className="mr-1 inline" />粘贴成绩消息</button>
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="考试日期">
            <input type="date" value={impDate} onChange={e => setImpDate(e.target.value)} className={inputCls} />
          </Field>
          {impTab === 'paste' && (
            <Field label="考试名称（解析结果将以此名称入库）">
              <input value={impExam} onChange={e => setImpExam(e.target.value)} placeholder="如：第三次月考" className={inputCls} />
            </Field>
          )}
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="排名口径（可选）">
            <select value={impRankScope} onChange={e => setImpRankScope(e.target.value)} className={inputCls}>
              <option value="class">班级排名</option>
              <option value="grade">年级排名</option>
            </select>
          </Field>
          <Field label="排名总人数（选填，留空按班级人数）">
            <input
              type="number"
              min="1"
              value={impRankTotal}
              onChange={e => setImpRankTotal(e.target.value)}
              placeholder={students.length ? String(students.length) : '例如 50'}
              className={inputCls}
            />
          </Field>
        </div>

        {impTab === 'file' ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-ink-secondary">支持直接拖入文件</span>
              <Button variant="secondary" onClick={downloadTemplate} disabled={!courseId} className="!px-3 !py-1.5 !text-xs">
                <FileSpreadsheet size={14} />下载导入模板
              </Button>
            </div>
            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                parseSheet(e.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition ${
                dragOver ? 'border-[#0071e3] bg-[#0071e3]/[0.06]' : 'border-black/15 bg-black/[0.015] hover:border-[#0071e3]/40'
              }`}
            >
              <Upload size={22} className="text-[#0071e3]" />
              <span className="text-sm font-medium text-ink">{dragOver ? '松开即可导入' : '选择或拖入 Excel / CSV 文件'}</span>
              <span className="text-xs text-ink-secondary">首行表头；「姓名」列右侧每一列是一次考试，表头带「排名」的列会作为名次一并导入</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => parseSheet(e.target.files?.[0])}
              />
            </label>
            {sheet && (
              <div className="mt-4 space-y-3">
                <div className="text-xs text-ink-secondary">
                  已读取 {sheet.fileName}：{sheet.rows.length} 行 · {sheet.header.length} 列
                </div>
                <Field label="姓名所在列">
                  <select value={nameCol} onChange={e => setNameCol(+e.target.value)} className={inputCls}>
                    {sheet.header.map((h, i) => <option key={i} value={i}>{h || `第 ${i + 1} 列`}</option>)}
                  </select>
                </Field>
                <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/[0.03] text-ink-secondary">
                      <tr>{sheet.header.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">{i === nameCol ? `【姓名】${h}` : (h || `第${i + 1}列`)}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sheet.rows.slice(0, 5).map((r, ri) => (
                        <tr key={ri} className="border-t border-black/[0.05]">
                          {sheet.header.map((_, ci) => <td key={ci} className="whitespace-nowrap px-2 py-1.5 text-ink">{String(r[ci] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-ink-secondary">姓名列右侧的每一列按「表头」作为考试名导入；表头含「排名/名次/rank」的列作为该次考试的名次。</div>
                <Button onClick={importSheet} disabled={impBusy} className="w-full">
                  {impBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}导入成绩
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="粘贴成绩消息（微信群通知、表格复制内容均可）">
              <textarea
                value={impText}
                onChange={e => setImpText(e.target.value)}
                rows={6}
                placeholder={'例如：\n张三 88 第12名\n李四 92.5 第5名/50人\n王五 76'}
                className={inputCls}
              />
            </Field>
            <div className="mt-3">
              <Button variant="secondary" onClick={parseMessage} disabled={impBusy}>
                {impBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}AI 解析
              </Button>
            </div>
            {parsed && (
              <div className="mt-4">
                <div className="mb-2 text-xs text-ink-secondary">
                  识别到 {parsed.length} 条，可匹配 {parsed.filter(p => byName.has(String(p.name).trim())).length} 人
                </div>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-black/[0.06]">
                  {parsed.map((p, i) => {
                    const ok = byName.has(String(p.name).trim());
                    return (
                      <div key={i} className="flex items-center justify-between border-b border-black/[0.04] px-3 py-1.5 text-xs last:border-0">
                        <span className={ok ? 'text-ink' : 'text-[#b3251c]'}>{p.name}{!ok && '（名单中未找到）'}</span>
                        <span className="font-semibold text-ink">
                          {p.score}
                          {p.rank > 0 && <span className="ml-2 font-normal text-xs text-ink-secondary">第 {p.rank} 名{p.total > 0 ? ` / ${p.total}` : ''}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Button onClick={importParsed} disabled={impBusy} className="mt-3 w-full">
                  {impBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}导入为「{impExam || '未命名考试'}」
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

/* ---------- 小统计卡 ---------- */
function Stat({ label, value, tone = 'gray' }) {
  const tones = {
    gray: 'text-ink',
    green: 'text-[#1a7f2b]',
    red: 'text-[#b3251c]',
    orange: 'text-[#a85300]',
    blue: 'text-[#0059b3]',
  };
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white/60 px-3 py-2.5">
      <div className="text-[11px] text-ink-secondary">{label}</div>
      <div className={`num mt-0.5 text-lg font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

/* ---------- 单个学生报告 ---------- */
function ReportCard({ item, classAvg = [], ranks = [] }) {
  const r = item.result;
  const g = r.predicted_gain || {};
  const rkText = (x) => `${x.scope === 'grade' ? '年级' : '班级'}第 ${x.rank} 名${x.total ? ` / ${x.total} 人` : ''}`;
  const rows = (item.scores || []).map(s => {
    const avgRow = classAvg.find(x => x.exam === s.exam);
    const rankRow = ranks.find(x => x.exam === s.exam);
    return {
      exam: s.exam,
      score: s.score,
      avg: avgRow ? avgRow.average : null,
      rank: rankRow?.rank || 0,
      total: rankRow?.total || 0,
      scope: rankRow?.scope === 'grade' ? 'grade' : 'class',
    };
  });
  const ranked = rows.filter(x => x.rank > 0);
  const rankDelta = ranked.length >= 2 ? ranked[0].rank - ranked[ranked.length - 1].rank : null;
  const lastRank = ranked.length ? ranked[ranked.length - 1] : null;
  return (
    <div className="card space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="display text-xl font-semibold text-ink">{item.student_name}</h3>
            <Badge tone={TREND_TONE[r.trend] || 'gray'}>{r.trend}</Badge>
            {lastRank && <Badge tone="blue">{rkText(lastRank)}</Badge>}
          </div>
          <div className="mt-1 text-xs text-ink-secondary">
            最近成绩：{item.scores.map(x => `${x.exam} ${x.score}`).join(' · ')}
          </div>
        </div>
        <div className="rounded-2xl bg-[#28cd41]/8 px-4 py-2 text-right ring-1 ring-inset ring-[#28cd41]/15">
          <div className="text-[11px] text-[#1a7f2b]">短期预计提分</div>
          <div className="num text-2xl font-semibold text-[#1a7f2b]">+{g.min}~{g.max} 分</div>
          <div className="text-[10px] text-[#1a7f2b]/70">置信度 {g.confidence || '中'}</div>
        </div>
      </div>

      {!!rows.length && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><TrendingUp size={15} className="text-[#0071e3]" />成绩与班级对比</h4>
          <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-black/[0.03] text-[11px] text-ink-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">考试</th>
                  <th className="px-3 py-2 font-medium">成绩</th>
                  <th className="px-3 py-2 font-medium">班级均分</th>
                  <th className="px-3 py-2 font-medium">与均分差</th>
                  <th className="px-3 py-2 font-medium">排名</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x, i) => {
                  const d = x.avg == null ? null : +(x.score - x.avg).toFixed(1);
                  return (
                    <tr key={i} className="border-t border-black/[0.05]">
                      <td className="px-3 py-1.5 text-ink">{x.exam}</td>
                      <td className="num px-3 py-1.5 font-semibold text-ink">{x.score}</td>
                      <td className="num px-3 py-1.5 text-ink-secondary">{x.avg == null ? '—' : x.avg}</td>
                      <td className={`num px-3 py-1.5 ${d == null ? 'text-ink-secondary' : d >= 0 ? 'text-[#1a7f2b]' : 'text-[#b3251c]'}`}>
                        {d == null ? '—' : `${d >= 0 ? '+' : ''}${d}`}
                      </td>
                      <td className="px-3 py-1.5 text-ink">{x.rank ? rkText(x) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rankDelta != null && (
            <div className="mt-2 text-xs">
              {rankDelta > 0
                ? <span className="text-[#1a7f2b]">较第一次考试排名进步 {rankDelta} 名</span>
                : rankDelta < 0
                  ? <span className="text-[#b3251c]">较第一次考试排名下滑 {-rankDelta} 名</span>
                  : <span className="text-ink-secondary">排名与第一次考试持平</span>}
            </div>
          )}
        </section>
      )}

      {r.summary && (
        <div className="rounded-xl bg-black/[0.025] p-4 text-[13px] leading-relaxed text-ink">{r.summary}</div>
      )}

      {!!(r.weak_points || []).length && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><Target size={15} className="text-[#ff9500]" />关键失分点</h4>
          <div className="flex flex-wrap gap-1.5">
            {r.weak_points.map((w, i) => <Badge key={i} tone="orange">{w}</Badge>)}
          </div>
        </section>
      )}

      {g.basis && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><TrendingUp size={15} className="text-[#0071e3]" />提分预测依据</h4>
          <p className="text-[13px] leading-relaxed text-ink-secondary">{g.basis}</p>
        </section>
      )}

      {!!(r.short_term_plan || []).length && (
        <section>
          <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink"><Brain size={15} className="text-[#af52de]" />短期提升计划</h4>
          <div className="space-y-3">
            {r.short_term_plan.map((p, i) => (
              <div key={i} className="rounded-xl border border-black/[0.06] p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="purple">{p.stage || `阶段 ${i + 1}`}</Badge>
                  <span className="text-[13px] font-semibold text-ink">{p.focus}</span>
                </div>
                {!!p.actions.length && (
                  <ul className="mt-2 space-y-1 text-[13px] text-ink-secondary">
                    {p.actions.map((a, j) => (
                      <li key={j} className="flex gap-1.5"><span className="text-[#0071e3]">·</span><span>{a}</span></li>
                    ))}
                  </ul>
                )}
                {p.target && <div className="mt-2 text-xs text-[#1a7f2b]">阶段目标：{p.target}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!!(r.subject_advice || []).length && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><Sparkles size={15} className="text-[#0071e3]" />学科提分建议</h4>
          <div className="space-y-2">
            {r.subject_advice.map((s, i) => (
              <div key={i} className="rounded-xl bg-[#0071e3]/[0.035] p-3">
                <div className="text-[13px] font-semibold text-ink">{s.subject}</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{s.advice}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!(r.self_improve || []).length && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><CheckCircle2 size={15} className="text-[#28cd41]" />自我提升方法</h4>
          <ol className="space-y-1.5 text-[13px] text-ink">
            {r.self_improve.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#28cd41]/12 text-[11px] font-semibold text-[#1a7f2b]">{i + 1}</span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {r.encouragement && (
        <div className="rounded-xl bg-[#ff9500]/8 px-4 py-3 text-[13px] leading-relaxed text-[#a85300]">
          {r.encouragement}
        </div>
      )}
    </div>
  );
}

/* ---------- 打印版完整报告：封面汇总 + 每名学生一页 ---------- */
function PrintReport({ job, report, summary }) {
  const examLabel = ['第一次', '第二次', '第三次'];
  const highest = Math.max(...report.map(r => r.result.predicted_gain.max));
  const studentsMeta = job.students || [];
  const classAvg = job.class_avg || [];
  const teacherName = auth.teacher?.name || '';
  return (
    <div className="print-only sa-print">
      {/* 封面与全班汇总 */}
      <section className="print-sheet">
        <div className="sa-brand">教师工作台 · AI 成绩分析</div>
        <h1>{job.course_name} · {DIM_LABEL[job.dimension]}成绩分析报告</h1>
        <div className="sa-meta">
          {teacherName && <div>教师：{teacherName}</div>}
          <div>考试：{(job.exam_names || []).map((e, i) => `${examLabel[i] || `第${i + 1}次`} ${e}`).join('　')}</div>
          <div>范围：{job.scope === 'class' ? '全班' : '指定学生'} · 共 {report.length} 人</div>
          <div>生成时间：{job.created_at || ''}</div>
        </div>
        {job.weak_points && <p className="sa-note"><b>老师标注的薄弱点：</b>{job.weak_points}</p>}

        <h2>全班汇总</h2>
        <div className="sa-stats">
          <div className="sa-stat"><span>已完成分析</span><b>{report.length} 人</b></div>
          <div className="sa-stat"><span>平均预计提分</span><b>+{summary ? summary.avgGain.toFixed(1) : 0} 分</b></div>
          <div className="sa-stat"><span>最高预计提分</span><b>+{Number.isFinite(highest) ? highest : 0} 分</b></div>
          <div className="sa-stat"><span>排名进步 / 下滑</span><b>{summary ? summary.improved : 0} / {summary ? summary.declineRank : 0} 人</b></div>
        </div>

        {!!summary?.topWeak?.length && (
          <>
            <h3>全班共性薄弱点</h3>
            <div>
              {summary.topWeak.map(([w, n]) => <span key={w} className="sa-tag">{w}（{n} 人）</span>)}
            </div>
          </>
        )}

        <p className="sa-note" style={{ marginTop: '12pt' }}>
          说明：以下为每位学生的个体分析，每名学生单独一页；预测分值基于最近三次成绩、班级均分与老师标注的薄弱点，仅供教学参考。
        </p>
      </section>

      {/* 每位学生一页 */}
      {report.map((item, idx) => {
        const r = item.result;
        const g = r.predicted_gain || {};
        const ranks = (studentsMeta.find(s => s.id === item.student_id)?.ranks) || [];
        const rows = (item.scores || []).map(s => ({
          exam: s.exam,
          score: s.score,
          avg: classAvg.find(x => x.exam === s.exam)?.average ?? null,
          rank: ranks.find(x => x.exam === s.exam)?.rank || 0,
          total: ranks.find(x => x.exam === s.exam)?.total || 0,
          scope: ranks.find(x => x.exam === s.exam)?.scope === 'grade' ? 'grade' : 'class',
        }));
        const ranked = rows.filter(x => x.rank > 0);
        const rankDelta = ranked.length >= 2 ? ranked[0].rank - ranked[ranked.length - 1].rank : null;
        return (
          <section key={item.student_id} className="print-sheet sa-student">
            <div className="sa-student-head">
              <div>
                <h2>{idx + 1}. {item.student_name}</h2>
                <div className="sa-sub">
                  最近成绩：{item.scores.map(x => `${x.exam} ${x.score}`).join('　')}
                </div>
              </div>
              <div className="sa-gain">
                短期预计提分<br /><b>+{g.min}~{g.max} 分</b><br />置信度 {g.confidence || '中'}
              </div>
            </div>

            <div style={{ marginBottom: '6pt' }}>
              趋势判断：<span className="sa-tag">{r.trend}</span>
              {rankDelta != null && (
                <span className="sa-tag">
                  {rankDelta > 0 ? `排名进步 ${rankDelta} 名` : rankDelta < 0 ? `排名下滑 ${-rankDelta} 名` : '排名持平'}
                </span>
              )}
            </div>

            {!!rows.length && (
              <>
                <h3>成绩与班级对比</h3>
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>考试</th><th>成绩</th><th>班级均分</th><th>与均分差</th><th>排名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((x, i) => {
                      const d = x.avg == null ? null : +(x.score - x.avg).toFixed(1);
                      return (
                        <tr key={i}>
                          <td>{x.exam}</td>
                          <td><b>{x.score}</b></td>
                          <td>{x.avg == null ? '—' : x.avg}</td>
                          <td>{d == null ? '—' : `${d >= 0 ? '+' : ''}${d}`}</td>
                          <td>{x.rank ? `${x.scope === 'grade' ? '年级' : '班级'}第 ${x.rank} 名${x.total ? ` / ${x.total} 人` : ''}` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {r.summary && (
              <>
                <h3>整体诊断</h3>
                <p>{r.summary}</p>
              </>
            )}

            {!!(r.weak_points || []).length && (
              <>
                <h3>关键失分点</h3>
                <div>{r.weak_points.map((w, i) => <span key={i} className="sa-tag">{w}</span>)}</div>
              </>
            )}

            {g.basis && (
              <>
                <h3>提分预测依据</h3>
                <p>{g.basis}</p>
              </>
            )}

            {!!(r.short_term_plan || []).length && (
              <>
                <h3>短期提升计划</h3>
                {r.short_term_plan.map((p, i) => (
                  <div key={i} className="sa-stage">
                    <div className="sa-stage-title">{p.stage || `阶段 ${i + 1}`}{p.focus ? `：${p.focus}` : ''}</div>
                    {!!p.actions.length && (
                      <ol>
                        {p.actions.map((a, j) => <li key={j}>{a}</li>)}
                      </ol>
                    )}
                    {p.target && <div style={{ fontSize: '9.5pt', color: '#1a7f2b' }}>阶段目标：{p.target}</div>}
                  </div>
                ))}
              </>
            )}

            {!!(r.subject_advice || []).length && (
              <>
                <h3>学科提分建议</h3>
                <ul>
                  {r.subject_advice.map((s, i) => <li key={i}><b>{s.subject}：</b>{s.advice}</li>)}
                </ul>
              </>
            )}

            {!!(r.self_improve || []).length && (
              <>
                <h3>自我提升方法</h3>
                <ol>
                  {r.self_improve.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </>
            )}

            {r.encouragement && (
              <p className="sa-note" style={{ borderLeft: '2pt solid #ff9500', paddingLeft: '7pt', marginTop: '7pt' }}>
                {r.encouragement}
              </p>
            )}

            <div className="sa-foot">
              教师工作台 · AI 成绩分析报告 · {item.student_name} · 第 {idx + 1} / {report.length} 页
            </div>
          </section>
        );
      })}
    </div>
  );
}
