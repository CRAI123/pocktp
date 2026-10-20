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

/* 科目元信息（顺序即试卷排版顺序；chip=屏幕端学科标识底色） */
const SUBJECTS = [
  { key: 'chinese', label: '语文', tone: 'red', chip: 'bg-[#ff3b30]/10 text-[#ff3b30]' },
  { key: 'math', label: '数学', tone: 'blue', chip: 'bg-[#0071e3]/10 text-[#0071e3]' },
  { key: 'english', label: '英语', tone: 'green', chip: 'bg-[#28cd41]/12 text-[#1fa733]' },
];
const SUBJ_META = Object.fromEntries(SUBJECTS.map(s => [s.key, s]));
const CN_NUM = ['一', '二', '三', '四', '五'];
const LETTERS = ['A', 'B', 'C', 'D'];

/* ===== 出题模式（每科可选） =====
 * lean  = 精练：同类型只保留一题，全题型覆盖
 * full  = 整卷：仿中考结构 23 题（全题型 + 真实题量配比）
 * custom = 自定义：手动题量（>5 题自动分批）
 */
const fillT = (t, n) => Array(n).fill(t);
const LEAN_QTYPES = {
  chinese: ['选择题', '填空题', '简答题', '阅读理解', '作文题'],
  math: ['选择题', '填空题', '解答题'],
  english: ['选择题', '完形填空', '阅读理解', '作文题'],
};
const FULL_QTYPES = {
  chinese: [...fillT('选择题', 10), ...fillT('填空题', 5), ...fillT('简答题', 2), ...fillT('阅读理解', 5), '作文题'],
  math: [...fillT('选择题', 10), ...fillT('填空题', 6), ...fillT('解答题', 7)],
  english: [...fillT('选择题', 10), ...fillT('填空题', 6), '完形填空', ...fillT('阅读理解', 5), '作文题'],
};
const MODES = [
  { key: 'lean', label: '精练', desc: '同类型只留一题，全题型覆盖' },
  { key: 'full', label: '整卷 23 题', desc: '仿中考结构，全题型真实配比' },
  { key: 'custom', label: '自定义', desc: '手动题量，超过 4 题自动分批' },
];
/* 题型耗时权重（秒，按实测校准：数学3题22s/语文4题31s/数学10选择82s），
 * 用于分批：每批总耗时预算 ≤45s，确保单次请求在 Vercel 60s 上限内完成 */
const QTYPES_W = { '选择题': 9, '填空题': 10, '简答题': 13, '解答题': 14, '阅读理解': 16, '完形填空': 15, '作文题': 27 };
function splitBatches(qtypes, cap = 45) {
  const batches = [[]];
  let w = 0;
  for (const t of qtypes) {
    if (w + QTYPES_W[t] > cap && batches[batches.length - 1].length) { batches.push([]); w = 0; }
    batches[batches.length - 1].push(t);
    w += QTYPES_W[t];
  }
  return batches.filter(b => b.length);
}

/* 打印分页：选择题矮、阅读/作文高，按权重装入 A4 页 */
const qWeight = (q) => ({
  '选择题': 1, '填空题': 1.5, '阅读理解': 2.2, '完形填空': 2, '简答题': 2, '解答题': 2.4, '作文题': 4.5,
}[q.qtype] || 2);
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

/* 打印答题区：填空 2 行横线，阅读/简答 3 行，解答 4 行，作文用稿纸方格 */
function PrintAnswerArea({ q }) {
  if (q.qtype === '选择题') return null;
  if (q.qtype === '作文题') return <EssayGrid />;
  const lines = q.qtype === '填空题' ? 2 : q.qtype === '解答题' ? 4 : 3;
  return (
    <div className="print-lines">
      {Array.from({ length: lines }, (_, k) => <div key={k} className="print-line" />)}
    </div>
  );
}

/* 作文稿纸：20 列 × 18 行标准方格 */
function EssayGrid() {
  const cols = 20, rows = 18;
  return (
    <div className="essay-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols * rows }, (_, i) => <span key={i} />)}
    </div>
  );
}

export default function ComprehensiveExam() {
  /* ---- 配置 ---- */
  const [cfg, setCfg] = useState({
    grade: '9', difficulty: 'medium', trend: true, keyword: '',
    subjects: { chinese: 4, math: 4, english: 4 },
  });
  /* 每科出题模式：lean 精练 / full 整卷 23 题 / custom 自定义 */
  const [subjMode, setSubjMode] = useState({ chinese: 'custom', math: 'custom', english: 'custom' });
  /* ---- 试卷（三科题目累积，按科独立管理） ---- */
  const [questions, setQuestions] = useState([]);
  const [sel, setSel] = useState([]);
  /* 三科独立生成状态：loading / err / done（该科当前题目数） */
  const [subjState, setSubjState] = useState(() =>
    Object.fromEntries(SUBJECTS.map(s => [s.key, { loading: false, err: '', done: 0 }])));
  const [generated, setGenerated] = useState(false);
  /* ---- 单题交互 ---- */
  const [expanded, setExpanded] = useState({});
  const [regenFor, setRegenFor] = useState(null);
  const [regenText, setRegenText] = useState('');
  const [regenBusy, setRegenBusy] = useState(null);
  const [regenErr, setRegenErr] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  /* 屏幕端学科页签：一科一个页面，切换查看，互不混杂 */
  const [activeSubj, setActiveSubj] = useState('chinese');

  const anyLoading = SUBJECTS.some(s => subjState[s.key].loading);
  const gradeLabel = GRADES.find(g => g.v === cfg.grade)?.l || '';
  const title = `${gradeLabel}综合测试卷`;

  /* 选中题（打印/导出的卷面内容），按学科固定顺序排列 */
  const picked = useMemo(() => {
    const set = new Set(sel);
    return questions.filter(q => set.has(q.id));
  }, [questions, sel]);

  /* A4 @page 规则（与 Practice 一致） */
  useEffect(() => {
    document.documentElement.dataset.paper = 'a4';
    const id = 'paper-style';
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = '@page { size: A4 portrait; margin: 14mm 16mm; }';
  }, []);

  /* ---------- 批次计划：lean/full 按题型耗时权重分批（每批 ≤45s），custom 按 ≤4 题分批 ---------- */
  const batchesOf = (key) => {
    const mode = subjMode[key];
    if (mode === 'lean') return splitBatches(LEAN_QTYPES[key]).map(qt => ({ qtypes: qt }));
    if (mode === 'full') return splitBatches(FULL_QTYPES[key]).map(qt => ({ qtypes: qt }));
    const n = cfg.subjects[key];
    if (!n) return [];
    const batches = [];
    let left = n;
    while (left > 0) { batches.push(Math.min(4, left)); left -= 4; }
    return batches.map(c => ({ count: c }));
  };

  /* ---------- 分科分批生成（每批一次请求，题量小稳过 60s，逐批追加显示） ---------- */
  const genSubject = async (key) => {
    if (subjState[key].loading) return;
    const batches = batchesOf(key);
    if (!batches.length) return;
    /* 生成开始时刻该科旧题（第一批替换后不再变化） */
    const oldIds = new Set(questions.filter(q => q.subject === key).map(q => q.id));
    setSubjState(s => ({ ...s, [key]: { loading: true, err: '', done: 0, progress: `0/${batches.length}` } }));
    let done = 0, curBatch = 0;
    try {
      for (let i = 0; i < batches.length; i++) {
        curBatch = i + 1;
        const b = batches[i];
        const d = await ai.exam({
          grade: cfg.grade, difficulty: cfg.difficulty, trend: cfg.trend,
          keyword: cfg.keyword,
          subjects: [{ subject: key, ...(b.qtypes ? { qtypes: b.qtypes } : { count: b.count }) }],
        });
        const qs = d.questions || [];
        /* 第一批替换该科旧题，后续批追加 */
        setQuestions(list => i === 0
          ? [...list.filter(q => q.subject !== key), ...qs]
          : [...list, ...qs]);
        setSel(prev => [...new Set([...prev.filter(id => i > 0 || !oldIds.has(id)), ...qs.map(q => q.id)])]);
        done += qs.length;
        setSubjState(s => ({ ...s, [key]: { loading: true, err: '', done, progress: `${i + 1}/${batches.length}` } }));
        setGenerated(true);
        setActiveSubj(key);
        if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
      }
      setExpanded({});
      setRegenFor(null);
      setSubjState(s => ({ ...s, [key]: { loading: false, err: '', done, progress: '' } }));
    } catch (e) {
      const msg = e.message || '生成失败';
      const suffix = done > 0
        ? `（第 ${curBatch}/${batches.length} 批中断，已生成 ${done} 题，可重新生成）`
        : (/fetch|网络|Network|timeout|Failed/i.test(msg) ? '（生成超时或网络中断，建议减少题量重试）' : '');
      setSubjState(s => ({ ...s, [key]: { loading: false, err: msg + suffix, done, progress: '' } }));
    }
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

  /* ---------- 题量步进（自定义模式，1-25 题，>4 题生成时自动分批） ---------- */
  const setSubj = (key, n) => setCfg(f => ({
    ...f, subjects: { ...f.subjects, [key]: Math.max(0, Math.min(25, n)) },
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

  /* ---------- 打印页面数据：语数英各自独立成部分 ----------
   * 每部分独立编号（1. 2. 3. …）、独立分页，部分之间强制另起一页 */
  const subjectBlocks = useMemo(() => {
    let pageNo = 0;
    return SUBJECTS.map(s => {
      const qs = picked.filter(q => q.subject === s.key);
      const no = new Map(qs.map((q, i) => [q.id, i + 1]));
      const points = qs.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
      const pages = paginate(qs, qWeight, 7, 9)
        .map((items, i) => ({ items, first: i === 0, pageNo: ++pageNo }));
      return { key: s.key, label: s.label, chip: s.chip, qs, no, points, pages };
    }).filter(b => b.qs.length);
  }, [picked]);

  const totalQP = subjectBlocks.reduce((s, b) => s + b.pages.length, 0);

  /* 答案页：沿用学科分组（跨页标注「续」），作文/阅读答案占位更大 */
  const answerBlocks = useMemo(() => {
    const items = subjectBlocks.flatMap(b => b.qs);
    const pages = paginate(items,
      q => q.qtype === '作文题' ? 3 : (q.qtype === '阅读理解' || q.qtype === '完形填空' ? 2 : 1), 12, 14);
    const started = new Set();
    return pages.map(itemsOnPage => {
      const groups = [];
      subjectBlocks.forEach(b => {
        const gItems = itemsOnPage.filter(q => q.subject === b.key);
        if (!gItems.length) return;
        const cont = started.has(b.key);
        started.add(b.key);
        groups.push({ ...b, items: gItems, cont });
      });
      return groups;
    });
  }, [picked, subjectBlocks]);

  const totalPages = totalQP + answerBlocks.length;

  /* ---------- 屏幕端单题卡片（no = 科内题号） ---------- */
  const QuestionCard = ({ q, no }) => {
    const checked = sel.includes(q.id);
    const meta = SUBJ_META[q.subject] || SUBJECTS[0];
    const showAns = !!expanded[q.id];
    const regenOpen = regenFor === q.id;
    return (
      <div className={`card p-4 transition ${checked ? '' : 'opacity-55'}`}>
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={checked} aria-label={`选中第 ${no} 题`}
            onChange={() => setSel(list => checked ? list.filter(x => x !== q.id) : [...list, q.id])}
            className="mt-1.5 h-4 w-4 shrink-0 accent-[#0071e3]" />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums">{no}.</span>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <Badge tone="purple">{q.qtype}</Badge>
              <span className="text-xs text-ink-secondary">{q.points} 分</span>
              {q.qtype === '作文题' && <span className="text-xs text-ink-secondary">· 含稿纸答题区</span>}
            </div>
            {/* 阅读材料（阅读理解 / 完形填空） */}
            {q.passage && (
              <div className="mb-2 rounded-xl border-l-2 border-black/10 bg-bg-light px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-secondary whitespace-pre-wrap">{q.passage}</div>
            )}
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
      <SectionHeader title="综合测试" desc="语数英逐科独立生成 · 精练 / 整卷 23 题 / 自定义三种模式 · 仿中考题型 · 逐题勾选 · 单题重出 · A4 打印" />

      {/* ============ 组卷配置卡：三科独立生成 ============ */}
      <div className="card space-y-4 p-5">
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
        {cfg.trend && (
          <p className="rounded-xl bg-[#ff9500]/10 px-3 py-2 text-xs leading-relaxed text-[#c77700]">
            已开启新风向：每科至少 1 道新题型——真实情境化、跨学科融合、开放性设问、新材料。
          </p>
        )}
        {/* 三科独立生成卡：语数英彻底分开，每科可选出题模式 */}
        <div className="grid gap-3 sm:grid-cols-3">
          {SUBJECTS.map(s => {
            const st = subjState[s.key];
            const n = cfg.subjects[s.key];
            const mode = subjMode[s.key];
            const batches = batchesOf(s.key);
            const cost = batches.length * 2;
            const modeInfo = mode === 'lean'
              ? `精练卷 · 全题型各 1 题（共 ${LEAN_QTYPES[s.key].length} 题）`
              : mode === 'full'
                ? `仿中考整卷 · ${FULL_QTYPES[s.key].length} 题全题型（${batches.length} 批生成）`
                : `自定义 · ${n} 题${batches.length > 1 ? `（${batches.length} 批生成）` : ''}`;
            return (
              <div key={s.key}
                className={`rounded-2xl border p-4 transition ${
                  st.loading ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.04]'
                  : st.done ? 'border-[#28cd41]/40 bg-[#28cd41]/[0.04]'
                  : st.err ? 'border-[#ff3b30]/30 bg-[#ff3b30]/[0.03]'
                  : 'border-black/10 bg-bg-light/50'
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${s.chip}`}>{s.label}</span>
                  {/* 出题模式 */}
                  <div className="flex gap-1">
                    {MODES.map(m => (
                      <button key={m.key} title={m.desc} onClick={() => setSubjMode(f => ({ ...f, [s.key]: m.key }))} disabled={st.loading}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition active:scale-95 disabled:opacity-40 ${
                          mode === m.key ? 'bg-[#0071e3] text-white' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10'
                        }`}>{m.label}</button>
                    ))}
                  </div>
                </div>
                {/* 模式说明 / 自定义步进 */}
                <div className="mt-3 flex min-h-9 items-center justify-between gap-2">
                  <span className="text-xs leading-relaxed text-ink-secondary">{modeInfo}</span>
                  {mode === 'custom' && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setSubj(s.key, n - 1)} disabled={st.loading}
                        className="h-7 w-7 rounded-full bg-black/[0.05] text-sm leading-none text-ink-secondary transition hover:bg-black/10 active:scale-90 disabled:opacity-30">−</button>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums">{n}</span>
                      <button onClick={() => setSubj(s.key, n + 1)} disabled={st.loading}
                        className="h-7 w-7 rounded-full bg-black/[0.05] text-sm leading-none text-ink-secondary transition hover:bg-black/10 active:scale-90 disabled:opacity-30">＋</button>
                    </div>
                  )}
                </div>
                <Button className="mt-3 w-full justify-center" onClick={() => genSubject(s.key)}
                  disabled={st.loading || anyLoading || (mode === 'custom' && !n)}>
                  {st.loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {st.loading
                    ? `命题中 ${st.progress} · 已得 ${st.done} 题`
                    : st.done ? `重新生成（${st.done} 题）` : `生成${s.label}`}
                </Button>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-secondary">
                  {st.err
                    ? <span className="text-[#ff3b30]">{st.err}</span>
                    : st.done
                      ? <span className="font-medium text-[#1fa733]">✓ 已生成 {st.done} 题 · 扣 2 算力/批</span>
                      : `本次约扣 ${cost} 算力（${batches.length} 批 × 2）`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input placeholder="主题/关键词（选填，三科共用）" value={cfg.keyword}
            onChange={e => setCfg(f => ({ ...f, keyword: e.target.value }))}
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0071e3]" />
        </div>
        <p className="text-xs leading-relaxed text-ink-secondary">
          三种出题模式：<span className="font-medium text-ink">精练</span> 同类型只留一题、全题型覆盖；
          <span className="font-medium text-ink">整卷 23 题</span> 仿中考结构全题型真实配比；
          <span className="font-medium text-ink">自定义</span> 手动 1-25 题。
          题量大时自动分批生成、逐批到账（每批扣 2 算力，稳过平台时限）；三科独立管理，跨科勾选汇总导出 A4 整卷。
        </p>
      </div>

      {/* ============ 空状态 ============ */}
      {!generated && !anyLoading && (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-3xl text-white shadow-lg shadow-blue-500/25">
            <GraduationCap size={26} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">选好模式，逐科生成综合测试卷</h2>
          <p className="max-w-md text-sm leading-relaxed text-ink-secondary">
            每科三种模式：精练（同类型只留一题）、整卷 23 题（仿中考全题型）、自定义题量；
            数学不含画图题，语文含阅读理解与作文，英语含完形填空与书面表达——三科就绪后逐题勾选，一键导出 A4 整卷
          </p>
        </div>
      )}

      {/* ============ 试卷预览：一科一个页面（Tab 切换），可勾选 ============ */}
      {questions.length > 0 && (
        <div className="space-y-4">
          {/* 学科页签：每科显示 已选/总数，生成中的科显示转圈 */}
          <div className="card sticky top-20 z-10 flex flex-wrap items-center gap-1.5 p-2">
            {SUBJECTS.map(s => {
              const qs = questions.filter(q => q.subject === s.key);
              const st = subjState[s.key];
              if (!qs.length && !st.loading) return null;
              const pickedN = qs.filter(q => sel.includes(q.id)).length;
              const active = activeSubj === s.key;
              return (
                <button key={s.key} onClick={() => setActiveSubj(s.key)}
                  className={`btn-pill flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition active:scale-95 ${
                    active ? `${s.chip} shadow-sm` : 'text-ink-secondary hover:bg-black/[0.04] hover:text-ink'
                  }`}>
                  {st.loading && <Loader2 size={13} className="animate-spin" />}
                  {s.label}
                  {qs.length
                    ? <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-ink-secondary/60'}`}>{pickedN}/{qs.length}</span>
                    : <span className={`text-xs ${active ? 'text-white/80' : 'text-ink-secondary/60'}`}>命题中…</span>}
                </button>
              );
            })}
          </div>

          {/* 当前学科页：部分标题 + 题目（该科生成中且暂无题目时显示占位） */}
          {(() => {
            const si = SUBJECTS.findIndex(s => s.key === activeSubj);
            if (si < 0) return null;
            const s = SUBJECTS[si];
            const qs = questions.filter(q => q.subject === s.key);
            if (!qs.length) {
              if (subjState[s.key].loading) return (
                <div className="card flex flex-col items-center gap-3 p-12 text-center">
                  <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-3xl text-white shadow-lg shadow-blue-500/25">
                    <Loader2 size={26} className="animate-spin" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">{s.label} · AI 命题中…</h3>
                  <p className="max-w-sm text-sm text-ink-secondary">单科生成约 30-60 秒，完成后自动展示；期间可切换其它学科页查看已生成的题目</p>
                </div>
              );
              return null;
            }
            const pickedN = qs.filter(q => sel.includes(q.id)).length;
            const pts = qs.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
            return (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${s.chip}`}>第{CN_NUM[si]}部分</span>
                  <h3 className="text-base font-semibold">{s.label}部分</h3>
                  <span className="text-xs text-ink-secondary">已选 {pickedN}/{qs.length} 题 · 共 {pts} 分</span>
                </div>
                <div className="space-y-3">
                  {qs.map((q, i) => <QuestionCard key={q.id} q={q} no={i + 1} />)}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ============ 底部悬浮岛 ============ */}
      {generated && questions.length > 0 && (
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0px)] sm:bottom-6 sm:px-4">
          <div className="pointer-events-auto relative flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-full p-1.5 shadow-2xl shadow-black/20 ring-1 ring-white/40"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'saturate(180%) blur(24px)', WebkitBackdropFilter: 'saturate(180%) blur(24px)' }}>
            <span className="flex items-center gap-1.5 px-3 text-xs text-ink-secondary">
              <Sparkles size={13} className="text-[#0071e3]" />已选 <b className="text-ink">{picked.length}</b>/{questions.length} 题
            </span>
            <button
              onClick={() => setSel(list => [...new Set([...list, ...questions.filter(q => q.subject === activeSubj).map(q => q.id)])])}
              title={`全选当前学科（${SUBJECTS.find(s => s.key === activeSubj)?.label || ''}）`}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-ink transition hover:bg-black/5 active:scale-90">
              <CheckSquare size={15} /><span className="hidden sm:inline">全选本科</span>
            </button>
            <button
              onClick={() => setSel(list => list.filter(id => !questions.some(q => q.id === id && q.subject === activeSubj)))}
              title={`清空当前学科（${SUBJECTS.find(s => s.key === activeSubj)?.label || ''}）`}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-ink transition hover:bg-black/5 active:scale-90">
              <Square size={15} /><span className="hidden sm:inline">清空本科</span>
            </button>
            <span className="mx-1 h-5 w-px bg-black/10" />
            <button onClick={downloadPDF} disabled={pdfBusy || !picked.length}
              title="生成 PDF 打印版（A4 标准分页，语数英独立成部分，含答案页）"
              className="brand-gradient ml-1 flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition active:scale-90 disabled:opacity-60">
              {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {pdfBusy ? '生成中' : `PDF（${picked.length} 题）`}
            </button>
          </div>
        </div>
      )}

      {/* ============ 打印视图：题目页（语数英独立成部分，独立编号分页） ============ */}
      <div className="print-only">
        {subjectBlocks.map((b, bi) =>
          b.pages.map(pg => (
            <div key={`${b.key}-${pg.pageNo}`} className="exam-page print-sheet"
              style={bi === 0 && pg.first ? undefined : { pageBreakBefore: 'always' }}>
              {bi === 0 && pg.first && (
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
              {pg.first ? (
                <div className="exam-sec">第{CN_NUM[bi]}部分 {b.label}（共 {b.qs.length} 题 · 满分 {b.points} 分）</div>
              ) : (
                <div className="exam-sec">第{CN_NUM[bi]}部分 {b.label}（续）</div>
              )}
              <ol className="print-list" style={{ gridTemplateColumns: '1fr' }}>
                {pg.items.map(q => (
                  <li key={q.id} className="print-item">
                    <div className="print-head">
                      <span className="print-no">{b.no.get(q.id)}.</span>
                      <span className="print-prompt">（{q.points} 分）{q.stem}</span>
                    </div>
                    {q.passage && <div className="exam-passage">{q.passage}</div>}
                    {q.qtype === '选择题' && Array.isArray(q.choices) && (
                      <div className="exam-choices">
                        {q.choices.map((c, i) => <span key={i}>{LETTERS[i]}. {c}</span>)}
                      </div>
                    )}
                    <div className="print-answers-area"><PrintAnswerArea q={q} /></div>
                  </li>
                ))}
              </ol>
              <div className="print-footer">教师工作台 · {title} · 第 {pg.pageNo} / {totalPages} 页</div>
            </div>
          ))
        )}

        {/* ============ 打印视图：答案页（另起页，按学科分组） ============ */}
        {answerBlocks.map((groups, pi) => (
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
            {groups.map(g => (
              <div key={g.key}>
                <div className="exam-sec">第{CN_NUM[SUBJECTS.findIndex(s => s.key === g.key)]}部分 {g.label}{g.cont ? '（续）' : ''}</div>
                <ol className="print-list" style={{ gridTemplateColumns: '1fr' }}>
                  {g.items.map(q => (
                    <li key={q.id} className="print-item">
                      <div className="print-no">{g.no.get(q.id)}.</div>
                      <div className="print-body">
                        <div className="print-prompt">
                          【{g.label} · {q.qtype}】<b className="font-mono">{q.answer}</b>
                        </div>
                        {q.explanation && <div className="print-explain">解析：{q.explanation}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <div className="print-footer">教师工作台 · 答案卷 · 第 {totalQP + pi + 1} / {totalPages} 页</div>
          </div>
        ))}
      </div>
    </div>
  );
}
