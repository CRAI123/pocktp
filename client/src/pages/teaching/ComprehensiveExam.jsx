/** 综合测试：仿中考题型结构的语/数/英综合卷
 *  - 全年级覆盖（1-9 年级 + 中考），题型仿中考、难度适配所选年级
 *  - 新题型新风向默认开启（情境化 / 跨学科 / 开放性设问）；数学不出画图题
 *  - 生成后逐题勾选入卷；不满意的题可输入改进提示词单题重出（扣 1 算力）
 *  - PDF：A4 分页题目卷 + 独立答案页
 */
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Download, Eye, EyeOff, Wand2, TrendingUp, GraduationCap, CheckSquare, Square } from 'lucide-react';
import { ai, auth } from '../../api.js';
import { Button, SectionHeader, Badge, inputCls } from '../../components/ui.jsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const todayStr = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const GRADES = [
  { v: '1', l: '一年级' }, { v: '2', l: '二年级' }, { v: '3', l: '三年级' }, { v: '4', l: '四年级' },
  { v: '5', l: '五年级' }, { v: '6', l: '六年级' }, { v: '7', l: '初一' }, { v: '8', l: '初二' },
  { v: '9', l: '初三' }, { v: 'zk', l: '中考' },
];
const DIFFS = [
  { v: 'easy', l: '基础' }, { v: 'medium', l: '中等' }, { v: 'hard', l: '拔高' },
];

/* 科目元信息（顺序即试卷排版顺序） */
const SUBJECTS = [
  { key: 'chinese', label: '语文', tone: 'red' },
  { key: 'math', label: '数学', tone: 'blue' },
  { key: 'english', label: '英语', tone: 'green' },
];
const SUBJ_META = Object.fromEntries(SUBJECTS.map(s => [s.key, s]));
const CN_NUM = ['一', '二', '三', '四', '五'];
const LETTERS = ['A', 'B', 'C', 'D'];

/* 打印分页：选择题矮、解答题高，按权重装入 A4 页 */
const qWeight = (q) => q.qtype === '选择题' ? 1 : q.qtype === '填空题' ? 1.5 : 2.4;
function paginate(items, weightFn, firstCap, cap) {
  const pages = [];
  let cur = [], w = 0, c = firstCap;
  for (const it of items) {
    const iw = weightFn(it);
    if (w + iw > c && cur.length) { pages.push(cur); cur = []; w = 0; c = cap; }
    cur.push(it); w += iw;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/* 打印答题区：填空 2 行横线，解答/简答 4 行 */
function PrintAnswerArea({ q }) {
  if (q.qtype === '选择题') return null;
  const lines = q.qtype === '填空题' ? 2 : 4;
  return (
    <div className="print-lines">
      {Array.from({ length: lines }, (_, k) => <div key={k} className="print-line" />)}
    </div>
  );
}

export default function ComprehensiveExam() {
  /* ---- 配置 ---- */
  const [cfg, setCfg] = useState({
    grade: '9', difficulty: 'medium', trend: true, keyword: '',
    subjects: { chinese: 5, math: 5, english: 5 },
  });
  /* ---- 试卷 ---- */
  const [questions, setQuestions] = useState([]);
  const [sel, setSel] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [generated, setGenerated] = useState(false);
  /* ---- 单题交互 ---- */
  const [expanded, setExpanded] = useState({});
  const [regenFor, setRegenFor] = useState(null);
  const [regenText, setRegenText] = useState('');
  const [regenBusy, setRegenBusy] = useState(null);
  const [regenErr, setRegenErr] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const totalPlanned = Object.values(cfg.subjects).reduce((s, n) => s + n, 0);
  const gradeLabel = GRADES.find(g => g.v === cfg.grade)?.l || '';
  const title = `${gradeLabel}综合测试卷`;

  /* 选中题（打印/导出的卷面内容），按学科固定顺序排列 */
  const picked = useMemo(() => {
    const set = new Set(sel);
    return questions.filter(q => set.has(q.id));
  }, [questions, sel]);

  /* 全局题号（跨学科连续编号）+ 分科分组 */
  const numbered = useMemo(() => {
    let no = 0;
    const map = new Map();
    picked.forEach(q => { map.set(q.id, ++no); });
    const groups = [];
    SUBJECTS.forEach(s => {
      const qs = picked.filter(q => q.subject === s.key);
      if (qs.length) groups.push({ key: s.key, label: s.label, qs });
    });
    return { map, groups };
  }, [picked]);

  /* A4 @page 规则（与 Practice 一致） */
  useEffect(() => {
    document.documentElement.dataset.paper = 'a4';
    const id = 'paper-style';
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = '@page { size: A4 portrait; margin: 14mm 16mm; }';
  }, []);

  /* ---------- 生成整卷 ---------- */
  const generate = async () => {
    if (loading) return;
    if (!totalPlanned) { setErr('请至少选择一个学科并设置题量'); return; }
    setLoading(true); setErr('');
    try {
      const subjects = SUBJECTS.filter(s => cfg.subjects[s.key] > 0)
        .map(s => ({ subject: s.key, count: cfg.subjects[s.key] }));
      const d = await ai.exam({
        grade: cfg.grade, difficulty: cfg.difficulty, trend: cfg.trend,
        keyword: cfg.keyword, subjects,
      });
      const qs = d.questions || [];
      setQuestions(qs);
      setSel(qs.map(q => q.id));
      setExpanded({});
      setRegenFor(null);
      setGenerated(true);
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setErr(e.message || '生成失败');
    } finally { setLoading(false); }
  };

  /* ---------- 单题重出（改进提示词） ---------- */
  const regen = async (q) => {
    const fb = regenText.trim();
    if (!fb || regenBusy) return;
    setRegenBusy(q.id); setRegenErr('');
    try {
      const d = await ai.regenerate('exam', q, fb);
      const nq = d.question;
      setQuestions(list => list.map(x => x.id === q.id ? nq : x));
      setSel(list => list.includes(q.id) ? [...list.filter(x => x !== q.id), nq.id] : list);
      setExpanded(p => { const n = { ...p }; delete n[q.id]; return n; });
      setRegenFor(null); setRegenText('');
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setRegenErr(e.message || '重出失败');
    } finally { setRegenBusy(null); }
  };

  /* ---------- 题量步进 ---------- */
  const setSubj = (key, n) => setCfg(f => ({
    ...f, subjects: { ...f.subjects, [key]: Math.max(0, Math.min(10, n)) },
  }));

  /* ---------- PDF：逐页截图分页合成（A4 物理尺寸） ---------- */
  async function downloadPDF() {
    if (!picked.length) return;
    try {
      setPdfBusy(true);
      const pages = [...document.querySelectorAll('.exam-page')];
      const hidden = document.querySelectorAll('.print-only');
      const prevDisplay = [];
      hidden.forEach(el => { prevDisplay.push(el.style.display); el.style.display = 'block'; });
      const A4_W = 794, A4_H = 1123, PAD = 56;
      const prevStyle = pages.map(el => ({
        width: el.style.width, minHeight: el.style.minHeight,
        padding: el.style.padding, boxSizing: el.style.boxSizing,
      }));
      pages.forEach(el => {
        el.style.width = `${A4_W}px`;
        el.style.minHeight = `${A4_H}px`;
        el.style.padding = `${PAD}px`;
        el.style.boxSizing = 'border-box';
      });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const w = pdf.internal.pageSize.getWidth();
        const h = pdf.internal.pageSize.getHeight();
        for (let i = 0; i < pages.length; i++) {
          const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
          if (i > 0) pdf.addPage();
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
        }
        pdf.save(`${title}.pdf`);
      } finally {
        hidden.forEach((el, i) => { el.style.display = prevDisplay[i] || ''; });
        pages.forEach((el, i) => {
          const p = prevStyle[i] || {};
          el.style.width = p.width || '';
          el.style.minHeight = p.minHeight || '';
          el.style.padding = p.padding || '';
          el.style.boxSizing = p.boxSizing || '';
        });
      }
    } catch (e) {
      console.error(e);
      alert('PDF 生成失败：' + e.message);
    } finally { setPdfBusy(false); }
  }

  /* ---------- 通用小控件（与 ExerciseConfig 同风格） ---------- */
  const Chip = ({ active, children, onClick, tone }) => (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
        active
          ? (tone === 'orange' ? 'bg-[#ff9500] text-white shadow shadow-orange-500/30' : 'brand-gradient text-white shadow shadow-blue-500/25')
          : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10 hover:text-ink'
      }`}>{children}</button>
  );

  /* ---------- 打印页面数据：题目页分页 + 答案页分页 ---------- */
  const qPages = paginate(picked, qWeight, 7, 9);
  const aPages = paginate(picked, () => 1, 15, 17);

  /* ---------- 屏幕端单题卡片 ---------- */
  const QuestionCard = ({ q }) => {
    const checked = sel.includes(q.id);
    const meta = SUBJ_META[q.subject] || SUBJECTS[0];
    const showAns = !!expanded[q.id];
    const regenOpen = regenFor === q.id;
    return (
      <div className={`card p-4 transition ${checked ? '' : 'opacity-55'}`}>
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={checked}
            onChange={() => setSel(list => checked ? list.filter(x => x !== q.id) : [...list, q.id])}
            className="mt-1 h-4 w-4 shrink-0 accent-[#0071e3]" />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <Badge tone="purple">{q.qtype}</Badge>
              <span className="text-xs text-ink-secondary">{q.points} 分</span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed sm:text-[15px]">{q.stem}</div>
            {q.qtype === '选择题' && Array.isArray(q.choices) && (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {q.choices.map((c, i) => (
                  <div key={i} className={`rounded-xl border px-3 py-1.5 text-sm ${showAns && LETTERS[i] === q.answer ? 'border-[#28cd41]/50 bg-[#28cd41]/[0.07] font-medium' : 'border-black/[0.07] bg-bg-light'}`}>
                    <b className="mr-1.5">{LETTERS[i]}.</b>{c}
                  </div>
                ))}
              </div>
            )}
            {/* 答案 / 解析 */}
            {showAns && (
              <div className="mt-3 rounded-xl bg-[#0071e3]/[0.06] p-3 text-sm leading-relaxed">
                <div><b className="text-[#0071e3]">答案：</b><span className="font-medium">{q.answer}</span></div>
                {q.explanation && <div className="mt-1 text-ink-secondary"><b className="text-ink">解析：</b>{q.explanation}</div>}
              </div>
            )}
            {/* 单题重出：改进提示词输入 */}
            {regenOpen && (
              <div className="mt-3 rounded-xl border border-[#ff9500]/30 bg-[#ff9500]/[0.05] p-3">
                <textarea rows={2} value={regenText} autoFocus
                  onChange={e => setRegenText(e.target.value)}
                  placeholder="不满意？输入改进方向，如：降低难度 / 换成情境化设题 / 换个考点 / 选项有歧义"
                  className={`${inputCls} resize-y bg-white`} />
                {regenErr && <p className="mt-1.5 text-xs text-[#ff3b30]">{regenErr}</p>}
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => regen(q)} disabled={!regenText.trim() || regenBusy === q.id}>
                    {regenBusy === q.id ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    重新生成（扣 1 算力）
                  </Button>
                  <Button variant="secondary" onClick={() => { setRegenFor(null); setRegenErr(''); }}>取消</Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button onClick={() => setExpanded(p => ({ ...p, [q.id]: !p[q.id] }))}
              title={showAns ? '隐藏答案' : '查看答案'}
              className="btn-pill p-1.5 text-[#28cd41] hover:bg-[#28cd41]/10">
              {showAns ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button onClick={() => { setRegenFor(regenOpen ? null : q.id); setRegenText(''); setRegenErr(''); }}
              disabled={!!regenBusy}
              title="单题重出：输入改进提示词重新生成本题（扣 1 算力）"
              className="btn-pill p-1.5 text-[#ff9500] hover:bg-[#ff9500]/10 disabled:opacity-40">
              {regenBusy === q.id ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-32">
      <SectionHeader title="综合测试" desc="仿中考题型结构 · 语数英综合卷 · 全年级覆盖（数学不含画图题）" />

      {/* ============ 组卷配置卡 ============ */}
      <div className="card space-y-3.5 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {GRADES.map(g => <Chip key={g.v} active={cfg.grade === g.v} onClick={() => setCfg(f => ({ ...f, grade: g.v }))}>{g.l}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {DIFFS.map(d => <Chip key={d.v} active={cfg.difficulty === d.v} onClick={() => setCfg(f => ({ ...f, difficulty: d.v }))}>{d.l}</Chip>)}
          <span className="mx-1 h-4 w-px bg-black/10" />
          <Chip active={cfg.trend} tone="orange" onClick={() => setCfg(f => ({ ...f, trend: !f.trend }))}>
            <span className="inline-flex items-center gap-1"><TrendingUp size={13} />中考新题型 · 新风向</span>
          </Chip>
        </div>
        {/* 科目与题量 */}
        <div className="flex flex-wrap items-center gap-2">
          {SUBJECTS.map(s => {
            const n = cfg.subjects[s.key];
            const on = n > 0;
            return (
              <div key={s.key} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 transition ${on ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.04]' : 'border-black/10 opacity-55'}`}>
                <button onClick={() => setSubj(s.key, on ? 0 : 5)} className="text-sm font-medium">{s.label}</button>
                <div className="flex items-center gap-1">
                  <button disabled={!on} onClick={() => setSubj(s.key, n - 1)}
                    className="h-6 w-6 rounded-full bg-black/[0.05] text-sm leading-none text-ink-secondary transition hover:bg-black/10 disabled:opacity-30">−</button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{on ? n : '—'}</span>
                  <button disabled={!on} onClick={() => setSubj(s.key, n + 1)}
                    className="h-6 w-6 rounded-full bg-black/[0.05] text-sm leading-none text-ink-secondary transition hover:bg-black/10 disabled:opacity-30">＋</button>
                </div>
              </div>
            );
          })}
          <input placeholder="主题/关键词（选填）" value={cfg.keyword}
            onChange={e => setCfg(f => ({ ...f, keyword: e.target.value }))}
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0071e3]" />
        </div>
        {cfg.trend && (
          <p className="rounded-xl bg-[#ff9500]/10 px-3 py-2 text-xs leading-relaxed text-[#c77700]">
            已开启新风向：每科至少 1 道新题型——真实情境化、跨学科融合、开放性设问、新材料。
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={loading || !totalPlanned}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? 'AI 命题中…' : `生成试卷（共 ${totalPlanned} 题 · 扣 5 算力）`}
          </Button>
          <span className="text-xs text-ink-secondary">生成后可逐题勾选入卷，不满意的题可单题重出</span>
        </div>
        {err && <p className="rounded-lg bg-[#ff3b30]/10 px-3 py-2 text-xs text-[#ff3b30]">{err}</p>}
      </div>

      {/* ============ 空状态 ============ */}
      {!generated && !loading && (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-3xl text-white shadow-lg shadow-blue-500/25">
            <GraduationCap size={26} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">配置上方参数，生成综合测试卷</h2>
          <p className="max-w-md text-sm text-ink-secondary">
            题型结构仿照中考（选择题 / 填空题 / 解答题），难度适配所选年级；支持逐题勾选、单题重出与 A4 打印
          </p>
        </div>
      )}
      {loading && (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-3xl text-white shadow-lg shadow-blue-500/25">
            <Loader2 size={26} className="animate-spin" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">AI 命题中…</h2>
          <p className="max-w-md text-sm text-ink-secondary">整卷一次生成，题量较大时需要 20-40 秒</p>
        </div>
      )}

      {/* ============ 试卷预览（按学科分组，可勾选） ============ */}
      {generated && !loading && questions.length > 0 && (
        <div className="space-y-5">
          {SUBJECTS.map(s => {
            const qs = questions.filter(q => q.subject === s.key);
            if (!qs.length) return null;
            const pickedN = qs.filter(q => sel.includes(q.id)).length;
            return (
              <div key={s.key}>
                <div className="mb-2.5 flex items-center gap-2">
                  <h3 className="text-base font-semibold">{s.label}部分</h3>
                  <span className="text-xs text-ink-secondary">已选 {pickedN}/{qs.length} 题</span>
                </div>
                <div className="space-y-2.5">
                  {qs.map(q => <QuestionCard key={q.id} q={q} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ 底部悬浮岛 ============ */}
      {generated && questions.length > 0 && (
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0px)]">
          <div className="pointer-events-auto relative flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-full p-1.5 shadow-2xl shadow-black/20 ring-1 ring-white/40"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(24px)', WebkitBackdropFilter: 'saturate(180%) blur(24px)' }}>
            <span className="flex items-center gap-1.5 px-3 text-xs text-ink-secondary">
              <Sparkles size={13} className="text-[#0071e3]" />已选 <b className="text-ink">{picked.length}</b>/{questions.length} 题
            </span>
            <button onClick={() => setSel(questions.map(q => q.id))}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-ink transition hover:bg-black/5 active:scale-90">
              <CheckSquare size={15} />全选
            </button>
            <button onClick={() => setSel([])}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-ink transition hover:bg-black/5 active:scale-90">
              <Square size={15} />清空
            </button>
            <span className="mx-1 h-5 w-px bg-black/10" />
            <button onClick={downloadPDF} disabled={pdfBusy || !picked.length}
              title="生成 PDF 打印版（A4 标准分页，含答案页）"
              className="brand-gradient ml-1 flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition active:scale-90 disabled:opacity-60">
              {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {pdfBusy ? '生成中' : `PDF（${picked.length} 题）`}
            </button>
          </div>
        </div>
      )}

      {/* ============ 打印视图：题目页（A4 分页） ============ */}
      <div className="print-only">
        {qPages.map((page, pi) => (
          <div key={`q${pi}`} className="exam-page print-sheet" style={pi > 0 ? { pageBreakBefore: 'always' } : undefined}>
            {pi === 0 && (
              <div className="print-header">
                <h1>{title}</h1>
                <div className="print-sub">
                  {DIFFS.find(d => d.v === cfg.difficulty)?.l}难度{cfg.trend ? ' · 含新题型新风向' : ''} · 仿中考题型结构
                </div>
                <div className="print-meta">
                  <span>姓名：____________</span>
                  <span>班级：____________</span>
                  <span>日期：{todayStr()}</span>
                  <span>得分：________</span>
                </div>
              </div>
            )}
            {numbered.groups.map((g, gi) => {
              const gqs = page.filter(q => q.subject === g.key);
              if (!gqs.length) return null;
              return (
                <div key={g.key}>
                  <div className="exam-sec">{CN_NUM[gi]}、{g.label}（共 {g.qs.length} 题）</div>
                  <ol className="print-list" style={{ gridTemplateColumns: '1fr' }}>
                    {gqs.map(q => (
                      <li key={q.id} className="print-item">
                        <div className="print-head">
                          <span className="print-no">{numbered.map.get(q.id)}.</span>
                          <span className="print-prompt">（{q.points} 分）{q.stem}</span>
                        </div>
                        {q.qtype === '选择题' && Array.isArray(q.choices) && (
                          <div className="exam-choices">
                            {q.choices.map((c, i) => <span key={i}>{LETTERS[i]}. {c}</span>)}
                          </div>
                        )}
                        <div className="print-answers-area"><PrintAnswerArea q={q} /></div>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
            <div className="print-footer">教师工作台 · 综合测试卷 · 第 {pi + 1} / {qPages.length + aPages.length} 页</div>
          </div>
        ))}

        {/* ============ 打印视图：答案页（另起页） ============ */}
        {aPages.map((page, pi) => (
          <div key={`a${pi}`} className="exam-page print-sheet print-answer-page">
            {pi === 0 && (
              <div className="print-header">
                <h1>{title} · 参考答案</h1>
                <div className="print-sub">仅供教师阅卷使用，请勿随卷下发</div>
                <div className="print-meta">
                  <span>共 {picked.length} 题</span>
                  <span>日期：{todayStr()}</span>
                </div>
              </div>
            )}
            <ol className="print-list" style={{ gridTemplateColumns: '1fr' }}>
              {page.map(q => (
                <li key={q.id} className="print-item">
                  <div className="print-no">{numbered.map.get(q.id)}.</div>
                  <div className="print-body">
                    <div className="print-prompt">
                      【{SUBJ_META[q.subject]?.label} · {q.qtype}】<b className="font-mono">{q.answer}</b>
                    </div>
                    {q.explanation && <div className="print-explain">解析：{q.explanation}</div>}
                  </div>
                </li>
              ))}
            </ol>
            <div className="print-footer">教师工作台 · 答案卷 · 第 {qPages.length + pi + 1} / {qPages.length + aPages.length} 页</div>
          </div>
        ))}
      </div>
    </div>
  );
}
