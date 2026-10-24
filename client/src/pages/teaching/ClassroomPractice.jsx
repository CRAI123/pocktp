/** 课堂练习：全科目 · 课题/知识点 + 题型清单 → 自动生成描述词 → 确认（可修改）→ 生成练习 */
import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Printer, Trash2, Plus, BookOpenCheck, CheckSquare, Eye, EyeOff, RotateCcw, TrendingUp } from 'lucide-react';
import { SectionHeader, Button, Badge, Empty } from '../../components/ui.jsx';
import { ai, auth } from '../../api.js';

const GRADES = [
  { v: '1', l: '一年级' }, { v: '2', l: '二年级' }, { v: '3', l: '三年级' },
  { v: '4', l: '四年级' }, { v: '5', l: '五年级' }, { v: '6', l: '六年级' },
  { v: '7', l: '七年级' }, { v: '8', l: '八年级' }, { v: '9', l: '九年级' }, { v: 'zk', l: '中考' },
];
const SUBJECT_OPTIONS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '科学', '信息技术', '心理健康', '音乐', '美术', '体育与健康'];
const QTYPE_OPTIONS = ['选择题', '填空题', '判断题', '简答题', '论述题', '计算题', '应用题', '连线题', '排序题', '作图题', '翻译题', '写作题'];
const LETTERS = ['A', 'B', 'C', 'D'];

/* 非选择/判断题在打印端给答题横线 */
const linesOf = (t) => /论述|写作/.test(t) ? 4 : /简答|应用/.test(t) ? 3 : /计算|作图/.test(t) ? 5 : /翻译/.test(t) ? 4 : 2;

/* 题型耗时权重（秒，与综合测试同源校准）：按权重分批，每批 ≤38s 预算（服务端 AI 调用总预算 55s，留足估算误差余量稳过 Vercel 60s） */
const QTYPES_W = { '选择题': 9, '填空题': 10, '判断题': 9, '简答题': 13, '论述题': 14, '计算题': 14, '应用题': 13, '排序题': 11, '连线题': 11, '阅读理解': 16, '完形填空': 15, '材料分析题': 16, '作图题': 14, '翻译题': 13, '写作题': 24, '作文题': 27 };
const wOf = (t) => QTYPES_W[t] || (/材料|阅读|综/.test(t) ? 16 : /论|写|作/.test(t) ? 20 : 12);
/* 把题型清单展开成单题序列，按权重切成批次，再聚合回 [{qtype, count}] 形式
 * 带材料/长文的大题（阅读/完形/材料分析/作文/写作，含自定义命名）单题实测 25-40s，
 * 强制单独成批（一篇一批），避免与其它题混批超 Vercel 60s 上限 */
const isSolo = (t) => /阅读|完形|材料|作文|写作/.test(t);
function splitBatches(items, cap = 38) {
  const seq = [];
  items.filter(i => i.qtype && i.count > 0).forEach(i => { for (let k = 0; k < i.count; k++) seq.push(i.qtype); });
  const batches = [[]];
  let w = 0;
  for (const t of seq) {
    if (isSolo(t)) {
      if (batches[batches.length - 1].length) batches.push([]);
      batches[batches.length - 1].push(t);
      batches.push([]);
      w = 0;
      continue;
    }
    if (w + wOf(t) > cap && batches[batches.length - 1].length) { batches.push([]); w = 0; }
    batches[batches.length - 1].push(t);
    w += wOf(t);
  }
  return batches.filter(b => b.length).map(b => {
    const tally = {};
    b.forEach(t => { tally[t] = (tally[t] || 0) + 1; });
    return Object.entries(tally).map(([qtype, count]) => ({ qtype, count }));
  });
}

export default function ClassroomPractice() {
  /* ---- 表单 ---- */
  const [form, setForm] = useState({ subject: '语文', grade: '7', topic: '', knowledge: '' });
  const [trend, setTrend] = useState(true);
  const [items, setItems] = useState([{ qtype: '选择题', count: 2 }, { qtype: '填空题', count: 3 }]);
  /* ---- 描述词（自动生成后可编辑） ---- */
  const [draft, setDraft] = useState('');
  /* ---- 生成结果 ---- */
  const [loading, setLoading] = useState(false);
  const [prog, setProg] = useState(null);   /* { cur, total, done } 分批进度 */
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');
  const [questions, setQuestions] = useState([]);
  const [sel, setSel] = useState([]);
  const [showAns, setShowAns] = useState({});
  const [done, setDone] = useState(false);

  const total = items.reduce((s, i) => s + (i.qtype ? i.count : 0), 0);
  const gradeLabel = GRADES.find(g => g.v === form.grade)?.l || '';
  const picked = questions.filter(q => sel.includes(q.id));

  /* A4 @page 规则（与综合测试一致）：浏览器打印/导出 PDF 时按 A4 纵向 + 均匀页边距 */
  useEffect(() => {
    document.documentElement.dataset.paper = 'a4';
    const id = 'paper-style';
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = '@page { size: A4 portrait; margin: 14mm 16mm; }';
  }, []);

  const setItem = (i, patch) => setItems(list => list.map((it, j) => j === i ? { ...it, ...patch } : it));

  /* ---------- 自动生成描述词（模板拼装，直接可编辑） ---------- */
  const buildPrompt = () => {
    const list = items.filter(i => i.qtype && i.count > 0).map(i => `${i.qtype} ${i.count} 道`).join('、');
    return `请为《${form.topic}》命制一份${gradeLabel}${form.subject}课堂练习。
本节课知识点：${form.knowledge || '本节课核心内容'}。
题型与数量：${list}。
要求：紧扣本节课知识点，难度适中，适合课堂即时检测；题干表述清晰规范，选择题提供四个选项，所有题目附答案与简要解析。${trend ? '\n命题风向：融入中考新风向——真实情境化、跨学科融合、开放性设问，题量允许时至少 1 道新风向题。' : ''}`;
  };

  const genDraft = () => {
    if (!form.topic.trim()) { setErr('请先填写本节课课题'); return; }
    if (!total) { setErr('请至少设置一种题型与数量'); return; }
    setErr('');
    setDraft(buildPrompt());
  };

  /* ---------- 确认描述词并生成（题量大自动分批：每批 ≤45s 预算稳过 60s，逐批追加显示） ---------- */
  const generate = async () => {
    if (loading) return;
    if (!form.topic.trim()) { setErr('请先填写本节课课题'); return; }
    if (!total) { setErr('请至少设置一种题型与数量'); return; }
    const batches = splitBatches(items);
    setLoading(true); setErr(''); setWarn('');
    let done = 0, curBatch = 0;
    try {
      for (let i = 0; i < batches.length; i++) {
        curBatch = i + 1;
        setProg({ cur: curBatch, total: batches.length, done });
        const d = await ai.practice({
          subject: form.subject.trim(), grade: form.grade, topic: form.topic.trim(),
          knowledge: form.knowledge.trim(), prompt: draft.trim(), trend,
          items: batches[i],
        });
        const qs = d.questions || [];
        setQuestions(list => (i === 0 ? qs : [...list, ...qs]));
        setSel(prev => [...new Set([...prev, ...qs.map(q => q.id)])]);
        done += qs.length;
        setProg({ cur: curBatch, total: batches.length, done });
        if (d.requested && qs.length < d.requested) {
          setWarn(`第 ${curBatch} 批请求 ${d.requested} 题、实际生成 ${qs.length} 题，如需补齐可重新生成`);
        }
        if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
      }
      setShowAns({});
      setDone(true);
    } catch (e) {
      const msg = e.message || '生成失败';
      setErr(msg + (done > 0 ? `（第 ${curBatch}/${batches.length} 批中断，已生成 ${done} 题，可重新生成）` : ''));
      if (done > 0) setDone(true);
    } finally {
      setLoading(false); setProg(null);
    }
  };

  const reset = () => {
    setQuestions([]); setSel([]); setDraft(''); setDone(false); setErr(''); setWarn(''); setShowAns({});
  };

  return (
    <div className="space-y-6">
      {/* 屏幕端内容整体 no-print：打印/导出 PDF 时只输出下方 print-only 卷面，不混入配置卡与题目列表 */}
      <div className="no-print space-y-6">
      <SectionHeader title="课堂练习" desc="全科目 · 输入课题与知识点，选择题型数量，确认描述词后 AI 命题 · 按题扣算力（1 算力/题）" />

      {/* ============ 配置卡 ============ */}
      <div className="card space-y-4 p-5">
        {/* 科目 + 年级 */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-40">
            <span className="mb-1.5 block text-sm font-medium text-ink-secondary">科目（全科目，可手动输入）</span>
            <input list="cp-subjects" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-bg-light px-3.5 py-2.5 text-sm outline-none focus:border-[#0071e3] focus:bg-white" />
            <datalist id="cp-subjects">{SUBJECT_OPTIONS.map(s => <option key={s} value={s} />)}</datalist>
          </label>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-secondary">年级</span>
            <div className="flex flex-wrap items-center gap-1">
              {GRADES.map(g => (
                <button key={g.v} onClick={() => setForm(f => ({ ...f, grade: g.v }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                    form.grade === g.v ? 'bg-[#0071e3] text-white' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10'
                  }`}>{g.l}</button>
              ))}
              <span className="mx-1 h-4 w-px bg-black/10" />
              <button onClick={() => setTrend(t => !t)} title="融入真实情境化、跨学科融合、开放性设问"
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                  trend ? 'bg-[#ff9500] text-white' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10'
                }`}>
                <TrendingUp size={13} />中考新风向
              </button>
            </div>
          </div>
        </div>
        {/* 课题 + 知识点 */}
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-sm font-medium text-ink-secondary">本节课课题 <span className="text-[#ff3b30]">*</span></span>
            <input placeholder="如：浮力 / 赤壁之战 / 现在完成时" value={form.topic}
              onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-bg-light px-3.5 py-2.5 text-sm outline-none focus:border-[#0071e3] focus:bg-white" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium text-ink-secondary">简要知识点（选填）</span>
            <input placeholder="如：浮力产生原因、阿基米德原理（顿号分隔）" value={form.knowledge}
              onChange={e => setForm(f => ({ ...f, knowledge: e.target.value }))}
              className="w-full rounded-xl border border-black/10 bg-bg-light px-3.5 py-2.5 text-sm outline-none focus:border-[#0071e3] focus:bg-white" />
          </label>
        </div>
        {/* 题型清单构造器 */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-secondary">题型与数量（共 {total} 题，题量大自动分批生成）</span>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <input list="cp-qtypes" value={it.qtype} placeholder="题型（可手动输入）"
                  onChange={e => setItem(i, { qtype: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-black/10 bg-bg-light px-3.5 py-2 text-sm outline-none focus:border-[#0071e3] focus:bg-white" />
                <datalist id="cp-qtypes">{QTYPE_OPTIONS.map(t => <option key={t} value={t} />)}</datalist>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setItem(i, { count: Math.max(0, it.count - 1) })}
                    className="h-8 w-8 rounded-full bg-black/[0.05] text-sm leading-none text-ink-secondary transition hover:bg-black/10 active:scale-90">−</button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{it.count}</span>
                  <button onClick={() => setItem(i, { count: Math.min(50, it.count + 1) })}
                    className="h-8 w-8 rounded-full bg-black/[0.05] text-sm leading-none text-ink-secondary transition hover:bg-black/10 active:scale-90">＋</button>
                </div>
                <button title="删除该题型" onClick={() => setItems(list => list.filter((_, j) => j !== i))}
                  className="btn-pill p-2 text-ink-secondary/60 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setItems(list => [...list, { qtype: '', count: 1 }])}
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-3 py-1.5 text-xs font-medium text-ink-secondary transition hover:bg-black/10">
            <Plus size={13} /> 添加题型
          </button>
        </div>

        {/* 描述词：自动生成 → 用户确认/修改 */}
        {draft ? (
          <div className="rounded-2xl border border-[#0071e3]/30 bg-[#0071e3]/[0.03] p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                <BookOpenCheck size={15} className="text-[#0071e3]" /> 命题描述词（可直接在文本上修改）
              </span>
              <button onClick={() => setDraft(buildPrompt())} title="按当前表单重新拼装"
                className="inline-flex items-center gap-1 text-xs text-ink-secondary transition hover:text-[#0071e3]">
                <RotateCcw size={12} /> 重新生成描述词
              </button>
            </div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={7}
              className="w-full resize-y rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-[#0071e3]" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={generate} disabled={loading || !total}>
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {loading ? `命题中 ${prog ? `${prog.cur}/${prog.total} · 已得 ${prog.done} 题` : '…'}` : `确认描述词并生成练习（约 ${total} 算力）`}
              </Button>
              <span className="text-xs text-ink-secondary">按题扣费 1 算力/题 · 题量大时自动分批、逐批到账</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={genDraft}>
              <Sparkles size={15} /> 生成描述词
            </Button>
            <span className="text-xs text-ink-secondary">按表单自动拼装命题描述词，确认或修改后再正式生成</span>
          </div>
        )}
        {err && <p className="rounded-lg bg-[#ff3b30]/10 px-3 py-2 text-xs text-[#ff3b30]">{err}</p>}
        {warn && <p className="rounded-lg bg-[#ff9500]/10 px-3 py-2 text-xs text-[#c77700]">{warn}</p>}
      </div>

      {/* ============ 生成中 ============ */}
      {loading && (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-3xl text-white shadow-lg shadow-blue-500/25">
            <Loader2 size={26} className="animate-spin" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">AI 命题中{prog ? ` · 第 ${prog.cur}/${prog.total} 批 · 已得 ${prog.done} 题` : '…'}</h2>
          <p className="max-w-md text-sm text-ink-secondary">正在按确认的描述词命制《{form.topic}》课堂练习，每批约 30-60 秒、逐批到账</p>
        </div>
      )}

      {/* ============ 题目列表 ============ */}
      {!loading && done && questions.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">《{form.topic}》课堂练习 · 共 {questions.length} 题</h2>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setSel(sel.length === questions.length ? [] : questions.map(q => q.id))}>
                <CheckSquare size={15} /> {sel.length === questions.length ? '清空' : '全选'}
              </Button>
              <Button variant="secondary" onClick={reset}><RotateCcw size={15} /> 重新配置</Button>
              <Button onClick={() => window.print()} disabled={!sel.length}>
                <Printer size={15} /> 打印 / 导出 PDF（{sel.length} 题）
              </Button>
            </div>
          </div>
          {questions.map((q, i) => (
            <div key={q.id} className={`card p-5 transition ${sel.includes(q.id) ? '' : 'opacity-55'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`选择第 ${i + 1} 题`} checked={sel.includes(q.id)}
                  onChange={() => setSel(s => s.includes(q.id) ? s.filter(x => x !== q.id) : [...s, q.id])}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#0071e3]" />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{i + 1}.</span>
                    <Badge tone="blue">{q.qtype}</Badge>
                    <span className="text-xs text-ink-secondary">{q.points} 分</span>
                    <button onClick={() => setShowAns(s => ({ ...s, [q.id]: !s[q.id] }))}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[#0071e3]">
                      {showAns[q.id] ? <><EyeOff size={13} />收起答案</> : <><Eye size={13} />查看答案</>}
                    </button>
                  </div>
                  {q.passage && (
                    <div className="mb-2 rounded-xl border-l-2 border-black/10 bg-bg-light px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-secondary whitespace-pre-wrap">{q.passage}</div>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{q.stem}</p>
                  {q.choices?.length ? (
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {q.choices.map((c, j) => (
                        <div key={j} className={`rounded-lg px-3 py-1.5 text-sm ${
                          showAns[q.id] && q.answer === LETTERS[j] ? 'bg-[#28cd41]/15 font-medium text-[#1f9e33]' : 'bg-black/[0.03]'
                        }`}>{LETTERS[j]}. {c}</div>
                      ))}
                    </div>
                  ) : null}
                  {showAns[q.id] && (
                    <div className="mt-3 rounded-xl bg-bg-light p-3.5 text-sm leading-relaxed">
                      <p><span className="font-medium text-[#1f9e33]">答案：</span>{q.answer}</p>
                      {q.explanation && <p className="mt-1 text-ink-secondary"><span className="font-medium">解析：</span>{q.explanation}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <Empty text="取消勾选的题目不会进入打印卷" />
        </div>
      )}
      </div>{/* /no-print 屏幕端内容 */}

      {/* ============ 打印卷（题目卷 + 独立答案页） ============ */}
      <div className="print-only">
        <div className="print-sheet print-roomy">
          <div className="print-header"><h1>{form.topic} · 课堂练习</h1></div>
          <div className="print-sub">{form.subject} · {gradeLabel} · 共 {picked.length} 题 · 满分 {picked.reduce((s, q) => s + (q.points || 0), 0)} 分</div>
          <div className="print-meta">
            <span>科目：{form.subject}</span><span>课题：{form.topic}</span>
            <span>班级：________</span><span>姓名：________</span><span>得分：________</span>
          </div>
          <ol className="print-list" style={{ listStyle: 'none' }}>
            {picked.map((q, i) => (
              <li key={q.id} className="print-item">
                <div className="print-head">
                  <span className="print-no">{i + 1}.</span>
                  <span className="print-prompt">{q.stem}（{q.points} 分）</span>
                </div>
                {q.passage && <div className="exam-passage">{q.passage}</div>}
                {q.choices?.length ? (
                  <div className="exam-choices">
                    {q.choices.map((c, j) => <span key={j}>{LETTERS[j]}. {c}</span>)}
                  </div>
                ) : (
                  <div className="print-lines" style={{ '--n': linesOf(q.qtype) }}>
                    {Array.from({ length: linesOf(q.qtype) }).map((_, j) => <div key={j} className="print-line" />)}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="print-footer">教师工作台 · 连接创意与未来教育</div>

          {/* 答案页 */}
          <div className="print-answer-page">
            <div className="print-header"><h1>{form.topic} · 参考答案</h1></div>
            <ol className="print-list" style={{ listStyle: 'none' }}>
              {picked.map((q, i) => (
                <li key={q.id} className="print-item">
                  <div className="print-head">
                    <span className="print-no">{i + 1}.</span>
                    <span className="print-prompt">
                      <b>{q.answer}</b>
                      {q.explanation && <span className="print-explain">（{q.explanation}）</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
