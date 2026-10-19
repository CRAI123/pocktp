/** 共享题目 UI：屏幕显示单题 + 工具栏；打印时渲染为整卷试卷（A4/A3）。
 *  - 中文专项按钮：开始练习 / 上一题 / 下一题 / 提交答案 / 查看解析 / 重置练习
 *  - 英文专项按钮：开始答题 / 切换题目 / 提交校验 / 显示答案 / 重新练习
 *  - 打印卷按学科/题型渲染不同答题区：语文田字格、英语四线三格、病句横线；参考答案另起一页
 *  - AI 接入：提交答案后自动调 /api/ai/grade，弹窗显示订正建议；浮动岛可单独触发 AI 提示
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Play, RotateCcw, CheckCircle2, Lightbulb, Send, Eye, FileText, Sparkles, Download, Loader2, Sliders, Wand2 } from 'lucide-react';
import { ai, auth } from '../api.js';
import { Button } from './ui.jsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ExerciseConfig from './ExerciseConfig.jsx';

const todayStr = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* 中文字数（汉字数）—— 用于田字格数量 */
const hanCount = (s) => {
  if (!s) return 1;
  const m = String(s).match(/[一-龥]/g);
  return Math.max(1, m ? m.length : 1);
};

/* 屏幕对错判定 */
function isAnswerCorrect(q, user) {
  if (user == null || user === '') return null;
  if (typeof q.match === 'function') return q.match(user);
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (Array.isArray(q.answer)) return q.answer.some(a => norm(a) === norm(user));
  return norm(q.answer) === norm(user);
}

/* ===== 打印答题区：按 subject/type 渲染（SVG 矢量，印刷清晰） ===== */
function TianZiGe({ count }) {
  return (
    <span className="print-grid">
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} className="tzg" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="96" height="96" fill="none" stroke="#000" strokeWidth="2.2" />
          <line x1="50" y1="2" x2="50" y2="98" stroke="#000" strokeWidth="1" strokeDasharray="3 2" />
          <line x1="2" y1="50" x2="98" y2="50" stroke="#000" strokeWidth="1" strokeDasharray="3 2" />
          <line x1="6"  y1="6"  x2="94" y2="94" stroke="#bbb" strokeWidth="0.6" />
          <line x1="94" y1="6"  x2="6"  y2="94" stroke="#bbb" strokeWidth="0.6" />
        </svg>
      ))}
    </span>
  );
}

function FourLineBox({ width = 80 }) {
  return (
    <span className="fl" style={{ width: `${width}pt` }}>
      <svg viewBox="0 0 200 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="2"  x2="200" y2="2"  stroke="#000" strokeWidth="1.4" />
        <line x1="0" y1="22" x2="200" y2="22" stroke="#888" strokeWidth="0.7" strokeDasharray="3 2" />
        <line x1="0" y1="40" x2="200" y2="40" stroke="#000" strokeWidth="1.4" />
        <line x1="0" y1="58" x2="200" y2="58" stroke="#000" strokeWidth="1.4" />
      </svg>
    </span>
  );
}

function PrintGrid({ subject, type, q }) {
  if (subject === 'chinese') {
    if (type === 'fix') {
      /* 病句修改：留 4 行横线写整句 */
      return (
        <div className="print-lines">
          {Array.from({ length: 4 }, (_, k) => <div key={k} className="print-line" />)}
        </div>
      );
    }
    /* 生字 / 拼音：田字格 */
    return <TianZiGe count={hanCount(q.answer)} />;
  }
  if (subject === 'english') {
    if (type === 'sentence') {
      const ans = String(q.answer || '');
      const w = Math.max(64, ans.length * 7 + 18);
      return <FourLineBox width={w} />;
    }
    if (type === 'wordbank') {
      const slotCount = (q.passage.match(/____\d+____/g) || []).length;
      return (
        <span className="print-grid">
          {Array.from({ length: slotCount }, (_, i) => <FourLineBox key={i} width={64} />)}
        </span>
      );
    }
  }
  /* 兜底：3 行横线 */
  return (
    <div className="print-lines">
      {Array.from({ length: 3 }, (_, k) => <div key={k} className="print-line" />)}
    </div>
  );
}

export default function Practice({
  title, subtitle, mode = 'chinese', subject = 'chinese', type = 'dictation',
  questions, renderPrompt, renderAnswerInput, renderAnswerKey, renderGroupHeader, state = {},
  loading = false, error = '', onReload,
  configDefaults = {}, onConfigApply,
}) {
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState({});
  const [revealed, setRevealed] = useState({});
  const [explain, setExplain] = useState({});
  /* AI 批改：{ [qid]: { loading, correct, score, diagnosis, suggestion, credits, error } } */
  const [aiGrade, setAiGrade] = useState({});
  const [paper] = useState('a4');
  const [busy, setBusy] = useState(false);

  /* 配置面板状态：受控 working 题目集 */
  const [working, setWorking] = useState(questions);
  const [configOpen, setConfigOpen] = useState(false);
  const [cfgMeta, setCfgMeta] = useState(null);
  /* 追加题目（举一反三/勾选追加）时跳过重置，避免清掉作答进度 */
  const appendRef = useRef(false);
  /* 父级题目到达/重载后同步到 working（挂载自动出题、重试重新出题） */
  useEffect(() => {
    setWorking(questions);
  }, [questions]);
  useEffect(() => {
    if (appendRef.current) { appendRef.current = false; return; }
    /* 配置变更时重置练习状态（保留 cfgMeta，配置面板可回显） */
    setCurrent(0);
    setAnswers({});
    setSubmitted({});
    setRevealed({});
    setExplain({});
    setAiGrade({});
  }, [working]);

  /* 举一反三：基于当前题生成 3 道同型变式，直接追加到试卷 */
  const [similarMsg, setSimilarMsg] = useState('');
  const [similarBusy, setSimilarBusy] = useState(false);
  const runSimilar = async () => {
    if (!q || similarBusy) return;
    setSimilarBusy(true); setSimilarMsg('');
    try {
      const d = await ai.similar(type, q, 3);
      appendRef.current = true;
      setWorking(p => [...p, ...(d.questions || [])]);
      setSimilarMsg(`已追加 ${d.questions?.length || 0} 道同类题 · 扣 ${d.cost} 算力`);
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
      setTimeout(() => setSimilarMsg(''), 3000);
    } catch (e) {
      setSimilarMsg(e.message || '举一反三失败');
    } finally { setSimilarBusy(false); }
  };

  const q = working[current] || null;
  const isFirst = current === 0;
  const isLast = working.length > 0 && current === working.length - 1;
  const hasQuestions = working.length > 0;

  /* 提交答案后调 AI 自动批改（首次调用扣 1 算力，缓存到 aiGrade） */
  const gradeWithAI = async (qq) => {
    if (!qq || !answers[qq.id] || aiGrade[qq.id]) return;
    setAiGrade(p => ({ ...p, [qq.id]: { loading: true } }));
    try {
      const r = await ai.grade({ type, question: qq, userAnswer: answers[qq.id] });
      setAiGrade(p => ({ ...p, [qq.id]: { loading: false, ...r } }));
    } catch (e) {
      setAiGrade(p => ({ ...p, [qq.id]: { loading: false, error: e.message } }));
    }
  };
  useEffect(() => {
    if (submitted[q?.id]) gradeWithAI(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, current]);

  /* 固定 A4 纸张（用户使用最频繁的尺寸），@page 规则只注一次 */
  useEffect(() => {
    document.documentElement.dataset.paper = 'a4';
    const id = 'paper-style';
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = '@page { size: A4 portrait; margin: 14mm 16mm; }';
  }, []);

  const reset = () => {
    setStarted(false); setAnswers({}); setSubmitted({}); setRevealed({}); setExplain({}); setCurrent(0);
  };
  const start = () => { setStarted(true); setCurrent(0); };

  const isChinese = mode === 'chinese';
  const setAns = (v) => setAnswers(p => ({ ...p, [q.id]: v }));
  /* 题目列表为空（首题生成前/生成失败）时 q 为 null，需守卫避免渲染崩溃 */
  const correct = q ? isAnswerCorrect(q, answers[q.id]) : false;

  /* 打印列数：按题型自适应（多列省纸，单列保阅读） */
  const cols = { dictation: 3, pinyin: 3, fix: 2, sentence: 2, wordbank: 1 }[type] || 2;

  /* 屏幕工具栏 → 改为底部浮动岛（macOS 灵动岛风格）：固定居中、玻璃质感、始终可达 */
  const screenToolbar = (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0px)] sm:bottom-6 sm:px-4">
      <div
        data-float-island
        className="pointer-events-auto relative flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-full p-1.5 shadow-2xl shadow-black/20 ring-1 ring-white/40"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'saturate(180%) blur(24px)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
        }}
      >
        {!started && (
          <>
            <span className="mx-1 h-5 w-px bg-black/10" />
            <span className="flex items-center gap-1.5 px-3 text-xs text-ink-secondary">
              <Sparkles size={13} className="text-[#0071e3]" />共 {working.length} 题
            </span>
          </>
        )}
        {started && hasQuestions && q && (
          <>
            <button
              onClick={() => setCurrent(c => Math.max(0, c - 1))}
              disabled={isFirst}
              title={isChinese ? '上一题' : '切换题目'}
              className="h-9 w-9 rounded-full text-ink hover:bg-black/5 flex items-center justify-center transition active:scale-90 disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[3.5ch] px-1 text-center text-sm font-semibold tabular-nums">
              {current + 1}<span className="text-ink-secondary">/{working.length}</span>
            </span>
            <button
              onClick={() => setCurrent(c => Math.min(working.length - 1, c + 1))}
              disabled={isLast}
              title={isChinese ? '下一题' : '下一道'}
              className="h-9 w-9 rounded-full text-ink hover:bg-black/5 flex items-center justify-center transition active:scale-90 disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
            <span className="mx-1 h-5 w-px bg-black/10" />
            <button
              onClick={() => setSubmitted(p => ({ ...p, [q.id]: true }))}
              title={isChinese ? '提交答案' : '提交校验'}
              className="h-9 px-3 rounded-full text-[#0071e3] hover:bg-[#0071e3]/10 flex items-center gap-1.5 text-sm transition active:scale-90"
            >
              <Send size={15} /><span className="hidden sm:inline">{isChinese ? '提交' : '校验'}</span>
            </button>
            <button
              onClick={() => setRevealed(p => ({ ...p, [q.id]: !p[q.id] }))}
              title={isChinese ? '查看解析' : '显示答案'}
              className="h-9 px-3 rounded-full text-[#28cd41] hover:bg-[#28cd41]/10 flex items-center gap-1.5 text-sm transition active:scale-90"
            >
              <Eye size={15} /><span className="hidden sm:inline">{revealed[q.id] ? '隐藏' : (isChinese ? '解析' : '答案')}</span>
            </button>
            <button
              onClick={() => { setAiGrade(p => { const n = { ...p }; delete n[q.id]; return n; }); gradeWithAI(q); }}
              disabled={!answers[q.id]}
              title="重新让 AI 批改当前题（扣 1 算力）"
              className="h-9 px-3 rounded-full text-[#af52de] hover:bg-[#af52de]/10 flex items-center gap-1.5 text-sm transition active:scale-90 disabled:opacity-30"
            >
              <Wand2 size={15} /><span className="hidden sm:inline">AI 批改</span>
            </button>
            <button
              onClick={runSimilar}
              disabled={similarBusy}
              title="AI 举一反三：基于当前题生成 3 道同类变式并追加到试卷（扣 2 算力）"
              className="h-9 px-3 rounded-full text-[#ff9500] hover:bg-[#ff9500]/10 flex items-center gap-1.5 text-sm transition active:scale-90 disabled:opacity-50"
            >
              {similarBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}<span className="hidden sm:inline">举一反三</span>
            </button>
            <button
              onClick={reset}
              title={isChinese ? '重置练习' : '重新练习'}
              className="h-9 px-3 rounded-full text-[#ff3b30] hover:bg-[#ff3b30]/10 flex items-center gap-1.5 text-sm transition active:scale-90"
            >
              <RotateCcw size={15} /><span className="hidden sm:inline">{isChinese ? '重置' : '重练'}</span>
            </button>
          </>
        )}
        {similarMsg && (
          <span className="ml-1 max-w-[220px] truncate rounded-full bg-[#ff9500]/10 px-2.5 py-1 text-xs font-medium text-[#ff9500]">{similarMsg}</span>
        )}
        <span className="mx-1 h-5 w-px bg-black/10" />
        <button
          onClick={() => setConfigOpen(true)}
          title="配置本题（年级/难度/数量/提示词/选题）"
          className="h-9 px-3 rounded-full text-ink hover:bg-black/5 flex items-center gap-1.5 text-sm transition active:scale-90"
        >
          <Sliders size={15} /><span className="hidden sm:inline">配置</span>
        </button>
        <button
          onClick={downloadPDF}
          disabled={busy}
          title="生成 PDF 打印版（A4 标准，含答案页）"
          className="brand-gradient ml-1 h-9 rounded-full px-4 text-white flex items-center gap-1.5 text-sm font-medium transition active:scale-90 disabled:opacity-60 shadow-lg shadow-blue-500/30"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {busy ? '生成中' : 'PDF'}
        </button>
      </div>
    </div>
  );

  /* 屏幕：单题视图 */
  const screenView = (
    <div className="no-print space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-secondary">
        <FileText size={15} />{title} · 第 <b className="text-ink">{current + 1}</b> / {working.length} 题
        {started && <span className="ml-2 inline-flex gap-1.5">{working.map((_, i) => (
          <span key={i} className={`h-1.5 w-5 rounded-full transition ${i === current ? 'brand-gradient' : submitted[working[i].id] ? 'bg-[#28cd41]' : 'bg-black/10'}`} />
        ))}</span>}
      </div>

      {!started && (
        loading ? (
          <div className="card flex flex-col items-center gap-3 p-12 text-center">
            <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-3xl text-white shadow-lg shadow-blue-500/25">
              <Loader2 size={26} className="animate-spin" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">AI 出题中...</h2>
            <p className="max-w-md text-sm text-ink-secondary">首次进入自动出题（扣 5 算力）</p>
          </div>
        ) : error ? (
          <div className="card flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#ff3b30]/15 text-[#ff3b30]">
              <AlertCircle size={26} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">AI 出题失败</h2>
            <p className="max-w-md text-sm text-ink-secondary">{error}</p>
            <div className="mt-3 flex gap-2">
              {onReload && <Button onClick={onReload}><RefreshCw size={16} />重试</Button>}
              <Button variant="secondary" onClick={() => setConfigOpen(true)}><Sliders size={16} />手动配置</Button>
            </div>
          </div>
        ) : (
          <div className="card flex flex-col items-center gap-3 p-12 text-center">
            <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-3xl text-white shadow-lg shadow-blue-500/25">
              <Sparkles size={26} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="max-w-md text-sm text-ink-secondary">{subtitle}</p>
            <div className="mt-2 flex gap-2 text-xs text-ink-secondary">
              <span>题目数：<b className="text-ink">{working.length}</b></span>
              <span>·</span>
              <span>支持 A4 标准打印</span>
              <span>·</span>
              <span>AI 出题已接入 · 扣算力</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={start} className="px-5"><Play size={16} />{isChinese ? '开始练习' : '开始答题'}</Button>
              <Button variant="secondary" onClick={() => setConfigOpen(true)}><Sliders size={16} />配置本题</Button>
            </div>
          </div>
        )
      )}
      {started && q && (
        <div className="card p-6 sm:p-8">
          {renderGroupHeader && q.groupIndex !== undefined && (current === 0 || working[current - 1]?.groupIndex !== q.groupIndex) && renderGroupHeader(q)}
          <div className="text-sm font-medium text-ink-secondary">第 {current + 1} 题{q.groupSize > 1 ? ` / 共 ${q.groupSize} 题（本短文）` : ''}</div>
          <div className="mt-2 text-xl leading-relaxed sm:text-2xl">{renderPrompt(q, state)}</div>
          <div className="mt-6">{renderAnswerInput(q, answers[q.id] || '', setAns, submitted[q.id], state)}</div>
          {submitted[q.id] && (
            <div className={`mt-5 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ${correct ? 'bg-[#28cd41]/10 text-[#1f9e33]' : 'bg-[#ff3b30]/8 text-[#ff3b30]'}`}>
              {correct ? <CheckCircle2 size={18} /> : <RotateCcw size={18} className="rotate-180" />}
              {correct ? '回答正确，继续保持' : '答案不正确，请查看解析或重新作答'}
            </div>
          )}
          {/* AI 自动批改结果：提交后自动触发一次，浮动岛「AI 批改」按钮可重批 */}
          {submitted[q.id] && aiGrade[q.id]?.loading && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#af52de]/[0.08] px-4 py-3 text-sm text-[#7a36a3]">
              <Loader2 size={15} className="animate-spin" />AI 正在批改...
            </div>
          )}
          {submitted[q.id] && aiGrade[q.id] && !aiGrade[q.id].loading && (
            <div className="mt-3 rounded-2xl bg-gradient-to-r from-[#af52de]/[0.08] to-[#0071e3]/[0.08] p-4 text-sm leading-relaxed">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-[#7a36a3]">
                  <Wand2 size={15} />AI 批改
                </div>
                {typeof aiGrade[q.id].score === 'number' && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    aiGrade[q.id].score >= 90 ? 'bg-[#28cd41]/15 text-[#1f9e33]' :
                    aiGrade[q.id].score >= 60 ? 'bg-[#ff9500]/15 text-[#ff9500]' :
                    'bg-[#ff3b30]/15 text-[#ff3b30]'
                  }`}>
                    {aiGrade[q.id].score} 分
                    {aiGrade[q.id].correct === true ? ' · 全对' : aiGrade[q.id].correct === false ? ' · 有误' : ''}
                  </span>
                )}
              </div>
              {aiGrade[q.id].diagnosis && (
                <div className="mb-1"><b className="text-ink">诊断：</b>{aiGrade[q.id].diagnosis}</div>
              )}
              {aiGrade[q.id].suggestion && (
                <div className="text-ink-secondary"><b className="text-ink">建议：</b>{aiGrade[q.id].suggestion}</div>
              )}
              {aiGrade[q.id].error && (
                <div className="text-[#ff3b30]">批改失败：{aiGrade[q.id].error}</div>
              )}
              {aiGrade[q.id].credits != null && (
                <div className="mt-2 text-[10px] text-ink-secondary">本次扣 1 算力 · 余额 {aiGrade[q.id].credits}</div>
              )}
            </div>
          )}
          {revealed[q.id] && (
            <div className="mt-4 rounded-2xl bg-[#0071e3]/[0.07] p-4 text-sm leading-relaxed">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-[#0071e3]">
                <Lightbulb size={15} />参考答案 / 解析
              </div>
              {renderAnswerKey(q, state)}
              {q.explanation && <p className="mt-2 text-ink-secondary">{q.explanation}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* 打印试卷视图：题目页（无答案，答题区按题型渲染） */
  const printView = (
    <div id="sheet-questions" className="print-only print-sheet">
      <div className="print-header">
        <h1>{title}</h1>
        <div className="print-sub">{subtitle}</div>
        <div className="print-meta">
          <span>姓名：____________</span>
          <span>班级：____________</span>
          <span>日期：{todayStr()}</span>
          <span>得分：________</span>
        </div>
      </div>
      <ol className="print-list" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {working.map((qq, i) => (
          <li key={qq.id} className="print-item">
            <div className="print-head"><span className="print-no">{i + 1}.</span><span className="print-prompt">{renderPrompt(qq, state)}</span></div>
            <div className="print-answers-area"><PrintGrid subject={subject} type={type} q={qq} /></div>
          </li>
        ))}
      </ol>
      <div className="print-footer">
        教师工作台 · 教学专项练习卷 · 共 {working.length} 题 · A4 标准排版
      </div>
    </div>
  );

  /* 打印答案页：另起一页，仅供教师参考 */
  const printAnswerPage = (
    <div id="sheet-answers" className="print-only print-sheet print-answer-page">
      <div className="print-header">
        <h1>{title} · 参考答案</h1>
        <div className="print-sub">仅供教师阅卷使用，请勿随卷下发</div>
        <div className="print-meta">
          <span>学科：{subject === 'chinese' ? '语文' : '英语'}</span>
          <span>题目数：{working.length}</span>
          <span>日期：{todayStr()}</span>
        </div>
      </div>
      <ol className="print-list" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {working.map((qq, i) => (
          <li key={qq.id} className="print-item">
            <div className="print-no">{i + 1}.</div>
            <div className="print-body">
              {qq.blanks ? (
                <div className="print-prompt">
                  {qq.blanks.map((b, k) => (
                    <span key={k} className="mr-3">空 {b.index + 1}：<b className="font-mono">{b.answer}</b></span>
                  ))}
                </div>
              ) : (
                <div className="print-prompt">参考答案：<b className="font-mono">{Array.isArray(qq.answer) ? qq.answer.join(' / ') : qq.answer}</b></div>
              )}
              {qq.explanation && <div className="print-explain">解析：{qq.explanation}</div>}
            </div>
          </li>
        ))}
      </ol>
      <div className="print-footer">教师工作台 · 答案卷 · 第 2 页起</div>
    </div>
  );

  /* ===== 渲染快照：把 print-only 显示 + 临时强制 A4 物理尺寸，截完恢复 ===== */
  async function renderAndCapture() {
    const sheets = ['sheet-questions', 'sheet-answers']
      .map(id => document.getElementById(id))
      .filter(Boolean);
    /* 显示 .print-only */
    const hidden = document.querySelectorAll('.print-only');
    const prevDisplay = [];
    hidden.forEach(el => { prevDisplay.push(el.style.display); el.style.display = 'block'; });
    /* 临时把 .print-sheet 设为 A4 物理尺寸（@96dpi：210×297mm = 794×1123px），
       内边距 ~15mm = 56px，box-sizing:border-box 防止 padding 撑大 */
    const A4_W = 794, A4_H = 1123, PAD = 56;
    const prevStyle = sheets.map(el => ({
      width: el.style.width,
      minHeight: el.style.minHeight,
      padding: el.style.padding,
      boxSizing: el.style.boxSizing,
    }));
    sheets.forEach(el => {
      el.style.width = `${A4_W}px`;
      el.style.minHeight = `${A4_H}px`;
      el.style.padding = `${PAD}px`;
      el.style.boxSizing = 'border-box';
    });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const out = [];
      for (const el of sheets) {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        out.push(canvas);
      }
      return out;
    } finally {
      hidden.forEach((el, i) => { el.style.display = prevDisplay[i] || ''; });
      sheets.forEach((el, i) => {
        const p = prevStyle[i] || {};
        el.style.width = p.width || '';
        el.style.minHeight = p.minHeight || '';
        el.style.padding = p.padding || '';
        el.style.boxSizing = p.boxSizing || '';
      });
    }
  }

  /* 下载 PDF：两张标准 A4 满铺（210×297mm），无变形、无 letterbox */
  async function downloadPDF() {
    try {
      setBusy(true);
      const [ca, cb] = await renderAndCapture();
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = pdf.internal.pageSize.getHeight();
      pdf.addImage(ca.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
      pdf.addPage();
      pdf.addImage(cb.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
      pdf.save(`${title}.pdf`);
    } catch (e) {
      console.error(e);
      alert('PDF 生成失败：' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-32">
      <div className="no-print">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
      </div>

      {screenToolbar}
      {screenView}
      {printView}
      {printAnswerPage}

      <ExerciseConfig
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        type={type}
        initial={cfgMeta || {}}
        canAppend={working.length > 0}
        onApply={(meta) => {
          /* 统一应用入口：meta = { questions, mode, append, grade, difficulty, count, keyword, trend }
             - 替换：整卷替换并重置练习进度
             - 追加：保留当前进度，把勾选题目拼到卷尾（AI/历史/手动/举一反三 均走此入口） */
          setCfgMeta(meta);
          appendRef.current = !!meta.append && working.length > 0;
          setWorking(meta.append && working.length > 0 ? [...working, ...(meta.questions || [])] : (meta.questions || []));
          /* 记录页面级配置，供"重试"按钮按最新配置重新出题（hook 不随 cfg 自动生成，无双重扣费） */
          if (onConfigApply) {
            onConfigApply({
              grade: meta.grade || configDefaults.grade,
              difficulty: meta.difficulty || configDefaults.difficulty,
              count: meta.count || configDefaults.count,
              keyword: meta.keyword || configDefaults.keyword,
            });
          }
        }}
      />
    </div>
  );
}
