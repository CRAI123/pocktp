import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, History, PenLine, Trash2, Sparkles, Loader2, X, TrendingUp, Flame } from 'lucide-react';
import { ai, auth } from '../api.js';
import { Button, Modal, inputCls } from './ui.jsx';

/** 题目主文本预览（跨题型通用） */
const qText = (q) => {
  const t = q.sentence || q.word || q.pinyin || q.stem || q.chinese || q.passage || '';
  return String(t).slice(0, 80);
};
const qAnswer = (q) => {
  const a = Array.isArray(q.answer) ? q.answer.join(' / ') : q.answer;
  return String(a ?? '').slice(0, 40);
};

const GRADES = [
  { v: '1', l: '一年级' }, { v: '2', l: '二年级' }, { v: '3', l: '三年级' }, { v: '4', l: '四年级' },
  { v: '5', l: '五年级' }, { v: '6', l: '六年级' }, { v: '7', l: '初一' }, { v: '8', l: '初二' },
  { v: '9', l: '初三' }, { v: 'zk', l: '中考' },
];
const DIFFS = [
  { v: 'easy', l: '基础' }, { v: 'medium', l: '中等' }, { v: 'hard', l: '拔高' },
];

/** 手动出题字段（按题型） */
const MANUAL_FIELDS = {
  dictation: [
    { k: 'word', label: '要默写的词语', ph: '例：蜿蜒', req: true },
    { k: 'pinyin', label: '展示给学生的拼音', ph: '例：wān yán', req: true },
  ],
  pinyin: [
    { k: 'pinyin', label: '拼音（学生据此写汉字）', ph: '例：yán ěr', req: true },
    { k: 'answer', label: '答案（汉字词）', ph: '例：掩耳', req: true },
  ],
  poem: [
    { k: 'sentence', label: '给出句（诗题或上句）', ph: '例：海内存知己，', req: true },
    { k: 'answer', label: '应写出的句子', ph: '例：天涯若比邻', req: true },
  ],
  fix: [
    { k: 'sentence', label: '病句', ph: '例：通过这次活动，使我受到了深刻的教育。', req: true },
    { k: 'answer', label: '修改后的句子', ph: '例：通过这次活动，我受到了深刻的教育。', req: true },
    { k: 'explanation', label: '病因（选填）', ph: '例：缺主语，删"使"' },
  ],
  sentence: [
    { k: 'sentence', label: '题干（用 ____ 表示空格）', ph: '例：She ____ (go) to school yesterday.', req: true },
    { k: 'answer', label: '答案', ph: '例：went', req: true },
    { k: 'hint', label: '提示（选填）', ph: '例：过去式' },
  ],
  dictationEn: [
    { k: 'chinese', label: '中文释义', ph: '例：图书馆', req: true },
    { k: 'answer', label: '英文单词', ph: '例：library', req: true },
  ],
  wordbank: [
    { k: 'passage', label: '短文（空格写 ____1____ ____2____ ____3____）', ph: '把短文粘进来，空格用 ____1____ 格式', req: true, area: true },
    { k: 'choices', label: '候选词（逗号分隔，建议 6 个）', ph: '例：quickly, library, went', req: true },
    { k: 'answer', label: '答案（逗号分隔，按空格顺序）', ph: '例：went, quickly, library', req: true },
  ],
  reading: [
    { k: 'passage', label: '英语短文', ph: '粘入短文（80-150 词）', req: true, area: true },
    { k: 'stem', label: '题干', ph: '例：What can we learn from the passage?', req: true },
    { k: 'choices', label: '选项（逗号分隔 4 个）', ph: '例：A. ... B. ... C. ... D. ...', req: true },
    { k: 'answer', label: '正确答案（A/B/C/D）', ph: '例：B', req: true },
    { k: 'explanation', label: '解析（选填）', ph: '例：主旨题，末段点题' },
  ],
};

/** 组卷配置中心：AI 出题 / 历史出题 / 手动出题 三板块，支持追加或替换试卷，任意题可 AI 举一反三 */
export default function ExerciseConfig({ open, onClose, type, subject = 'chinese', mode = 'chinese', initial = {}, canAppend = false, onApply }) {
  const [tab, setTab] = useState('ai');

  /* 出题配置 */
  const [form, setForm] = useState({ grade: '3', difficulty: 'medium', count: 10, keyword: '', trend: false });
  /* AI 板块 */
  const [aiQs, setAiQs] = useState(null);
  const [aiSel, setAiSel] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [aiAppend, setAiAppend] = useState(false);
  /* 历史板块 */
  const [hist, setHist] = useState(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histErr, setHistErr] = useState('');
  const [histId, setHistId] = useState(null);
  const [histQs, setHistQs] = useState(null);
  const [histSel, setHistSel] = useState([]);
  const [histAppend, setHistAppend] = useState(false);
  /* 手动板块 */
  const [manualQs, setManualQs] = useState([]);
  const [mSel, setMSel] = useState([]);
  const [mForm, setMForm] = useState({});
  const [mErr, setMErr] = useState('');
  const [mAppend, setMAppend] = useState(true);
  /* 举一反三（三板块共用结果区） */
  const [simQs, setSimQs] = useState(null);
  const [simSel, setSimSel] = useState([]);
  const [simBusyId, setSimBusyId] = useState(null);
  const [simAppend, setSimAppend] = useState(true);
  const [simSrc, setSimSrc] = useState('');
  const [simErr, setSimErr] = useState('');

  const fields = MANUAL_FIELDS[type] || MANUAL_FIELDS.sentence;

  /* 打开时回显配置 */
  useEffect(() => {
    if (!open) return;
    setForm(f => ({
      grade: initial.grade || '3',
      difficulty: initial.difficulty === 'manual' ? 'medium' : (initial.difficulty || 'medium'),
      count: initial.count || 10,
      keyword: initial.keyword || '',
      trend: !!initial.trend,
    }));
    setAiQs(null); setAiSel([]); setAiErr(''); setAiAppend(false);
    setHist(null); setHistId(null); setHistQs(null); setHistSel([]); setHistErr('');
    setSimQs(null); setSimSel([]); setSimSrc(''); setSimErr('');
  }, [open]);

  /* ---------- 统一应用 ---------- */
  const apply = (picks, modeName, append) => {
    if (!picks.length) return;
    onApply({
      questions: picks, mode: modeName, append: append && canAppend,
      grade: form.grade, difficulty: form.difficulty, count: picks.length,
      keyword: form.keyword, trend: form.trend,
    });
    onClose();
  };

  /* ---------- AI 出题 ---------- */
  const genAI = async () => {
    if (aiLoading) return;
    setAiLoading(true); setAiErr('');
    try {
      const d = await ai.generate({ type, ...form });
      setAiQs(d.questions || []);
      setAiSel((d.questions || []).map(q => q.id));
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setAiErr(e.message || '生成失败');
    } finally { setAiLoading(false); }
  };

  /* ---------- 历史出题 ---------- */
  const loadHist = async () => {
    if (hist) return;
    setHistLoading(true); setHistErr('');
    try {
      const d = await ai.history(type);
      setHist(d.history || []);
    } catch (e) {
      setHistErr(e.message || '加载失败');
    } finally { setHistLoading(false); }
  };
  const openHist = (row) => {
    setHistId(histId === row.id ? null : row.id);
    const qs = row.questions || [];
    setHistQs(qs);
    setHistSel(qs.map(q => q.id));
  };

  /* ---------- 手动出题 ---------- */
  const addManual = () => {
    setMErr('');
    for (const f of fields) {
      if (f.req && !String(mForm[f.k] || '').trim()) { setMErr(`请填写「${f.label}」`); return; }
    }
    const q = {
      id: `manual-${Date.now()}`,
      grade: form.grade, difficulty: 'manual', topic: '手动出题',
      ...mForm,
    };
    /* 按题型归一化 */
    if (type === 'dictation' && !q.answer) q.answer = q.word;
    if (type === 'wordbank') {
      const ans = String(q.answer || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
      q.answer = ans;
      q.blanks = ans.map((a, i) => ({ index: i, answer: a }));
      q.choices = String(q.choices || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
    }
    if (type === 'reading') {
      q.choices = String(q.choices || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
      q.answer = String(q.answer || '').trim().toUpperCase();
    }
    setManualQs(list => [...list, q]);
    setMSel(list => [...list, q.id]);
    setMForm({});
  };

  /* ---------- 举一反三 ---------- */
  const runSimilar = async (q) => {
    if (simBusyId) return;
    setSimBusyId(q.id); setSimErr('');
    try {
      const d = await ai.similar(type, q, 3);
      setSimQs(d.questions || []);
      setSimSel((d.questions || []).map(x => x.id));
      setSimSrc(qText(q));
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setSimErr(e.message || '举一反三失败');
    } finally { setSimBusyId(null); }
  };

  /* ---------- 预览列表（勾选 + 举一反三按钮） ---------- */
  const PreviewList = ({ questions, sel, setSel }) => (
    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
      {questions.map(q => {
        const checked = sel.includes(q.id);
        return (
          <label key={q.id}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-sm transition ${checked ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.05]' : 'border-black/[0.07] hover:border-black/20'}`}>
            <input type="checkbox" checked={checked} className="h-4 w-4 shrink-0 accent-[#0071e3]"
              onChange={() => setSel(list => checked ? list.filter(x => x !== q.id) : [...list, q.id])} />
            <span className="min-w-0 flex-1 truncate text-ink">{qText(q) || '(空题干)'}</span>
            <span className="shrink-0 text-xs text-ink-secondary">答案：{qAnswer(q) || '—'}</span>
            <button
              onClick={(e) => { e.preventDefault(); runSimilar(q); }}
              disabled={!!simBusyId}
              title="AI 举一反三：生成 3 道同类变式（扣 2 算力）"
              className="shrink-0 rounded-full p-1.5 text-[#ff9500] transition hover:bg-[#ff9500]/10 disabled:opacity-40"
            >
              {simBusyId === q.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            </button>
          </label>
        );
      })}
    </div>
  );

  /* ---------- 举一反三结果区 ---------- */
  const SimilarPanel = () => !simQs ? null : (
    <div className="rounded-xl border border-[#ff9500]/30 bg-[#ff9500]/[0.05] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#ff9500]">
        <Flame size={15} />举一反三（基于：{simSrc.slice(0, 20) || '—'}）
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-normal text-ink-secondary">
          <input type="checkbox" checked={simAppend && canAppend} disabled={!canAppend} className="h-3.5 w-3.5 accent-[#0071e3]"
            onChange={e => setSimAppend(e.target.checked)} />
          {canAppend ? '追加到试卷' : '替换试卷'}
        </label>
      </div>
      <PreviewList questions={simQs} sel={simSel} setSel={setSimSel} />
      <div className="mt-3 flex gap-2">
        <Button onClick={() => apply(simQs.filter(q => simSel.includes(q.id)), 'similar', simAppend)} disabled={!simSel.length}>
          应用 {simSel.length} 题到试卷
        </Button>
        <Button variant="secondary" onClick={() => { setSimQs(null); setSimSel([]); }}>收起</Button>
      </div>
    </div>
  );

  /* ---------- 通用小控件 ---------- */
  const Chip = ({ active, children, onClick, tone }) => (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
        active
          ? (tone === 'orange' ? 'bg-[#ff9500] text-white shadow shadow-orange-500/30' : 'brand-gradient text-white shadow shadow-blue-500/25')
          : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10 hover:text-ink'
      }`}>{children}</button>
  );
  const AppendBar = ({ checked, onChange }) => (
    <label className={`flex cursor-pointer items-center gap-1.5 text-xs ${canAppend ? 'text-ink-secondary' : 'text-ink-secondary/40'}`}>
      <input type="checkbox" checked={checked && canAppend} disabled={!canAppend} className="h-3.5 w-3.5 accent-[#0071e3]"
        onChange={e => onChange(e.target.checked)} />
      {canAppend ? '追加到当前试卷（不替换）' : '当前试卷为空，应用即替换'}
    </label>
  );

  return (
    <Modal open={open} onClose={onClose} title="组卷配置" width="max-w-3xl">
      {/* 板块切换 */}
      <div className="mb-4 flex gap-1.5">
        <Chip active={tab === 'ai'} onClick={() => setTab('ai')}>AI 出题</Chip>
        <Chip active={tab === 'history'} onClick={() => { setTab('history'); loadHist(); }}>
          <span className="inline-flex items-center gap-1"><History size={13} />历史出题</span>
        </Chip>
        <Chip active={tab === 'manual'} onClick={() => setTab('manual')}>
          <span className="inline-flex items-center gap-1"><PenLine size={13} />手动出题</span>
        </Chip>
      </div>

      {/* ============ AI 出题 ============ */}
      {tab === 'ai' && (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {GRADES.map(g => <Chip key={g.v} active={form.grade === g.v} onClick={() => setForm(f => ({ ...f, grade: g.v }))}>{g.l}</Chip>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {DIFFS.map(d => <Chip key={d.v} active={form.difficulty === d.v} onClick={() => setForm(f => ({ ...f, difficulty: d.v }))}>{d.l}</Chip>)}
            <span className="mx-1 h-4 w-px bg-black/10" />
            <Chip active={form.trend} tone="orange" onClick={() => setForm(f => ({ ...f, trend: !f.trend }))}
            ><span className="inline-flex items-center gap-1"><TrendingUp size={13} />中考新题型 · 新风向</span></Chip>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-ink-secondary">数量</span>
            <input type="number" min="1" max="30" value={form.count}
              onChange={e => setForm(f => ({ ...f, count: Math.max(1, Math.min(30, Number(e.target.value) || 1)) }))}
              className="w-20 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#0071e3]" />
            <input placeholder="主题/关键词（选填）" value={form.keyword}
              onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0071e3]" />
          </div>
          {form.trend && (
            <p className="rounded-xl bg-[#ff9500]/10 px-3 py-2 text-xs leading-relaxed text-[#c77700]">
              已开启新风向：AI 将按最新中考命题趋势出题——真实情境化、跨学科融合、开放性设问、新材料新题型。
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={genAI} disabled={aiLoading}>
              {aiLoading ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {aiLoading ? 'AI 出题中…' : '生成新题（扣 5 算力）'}
            </Button>
            <AppendBar checked={aiAppend} onChange={setAiAppend} />
          </div>
          {aiErr && <p className="rounded-lg bg-[#ff3b30]/10 px-3 py-2 text-xs text-[#ff3b30]">{aiErr}</p>}
          {aiQs && (
            <div className="space-y-3">
              <p className="text-sm">生成 <b className="text-[#0071e3]">{aiQs.length}</b> 题，已全选，可取消勾选</p>
              <PreviewList questions={aiQs} sel={aiSel} setSel={setAiSel} />
              <Button onClick={() => apply(aiQs.filter(q => aiSel.includes(q.id)), 'ai', aiAppend)} disabled={!aiSel.length}>
                应用 {aiSel.length} 题{aiAppend && canAppend ? '（追加）' : '（替换试卷）'}
              </Button>
            </div>
          )}
          <SimilarPanel />
        </div>
      )}

      {/* ============ 历史出题 ============ */}
      {tab === 'history' && (
        <div className="space-y-3.5">
          {histLoading && <p className="py-6 text-center text-sm text-ink-secondary">加载中…</p>}
          {histErr && <p className="rounded-lg bg-[#ff3b30]/10 px-3 py-2 text-xs text-[#ff3b30]">{histErr}</p>}
          {hist && !hist.length && <p className="py-6 text-center text-sm text-ink-secondary">还没有出题记录</p>}
          {hist?.length > 0 && (
            <>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {hist.map(row => (
                  <div key={row.id} className={`rounded-xl border transition ${histId === row.id ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.05]' : 'border-black/[0.07] hover:border-black/20'}`}>
                    <button onClick={() => openHist(row)} className="flex w-full items-center gap-2.5 p-2.5 text-left text-sm">
                      <History size={14} className="shrink-0 text-ink-secondary" />
                      <span className="min-w-0 flex-1 truncate">{row.keyword || '(无关键词)'}</span>
                      <span className="shrink-0 text-xs text-ink-secondary">{row.count} 题 · {row.created_at?.slice(0, 10)}</span>
                    </button>
                    {histId === row.id && histQs && (
                      <div className="space-y-2 border-t border-black/5 p-2.5">
                        <PreviewList questions={histQs} sel={histSel} setSel={setHistSel} />
                        <div className="flex items-center gap-3">
                          <Button onClick={() => apply(histQs.filter(q => histSel.includes(q.id)), 'history', histAppend)} disabled={!histSel.length}>
                            应用 {histSel.length} 题{histAppend && canAppend ? '（追加）' : '（替换试卷）'}
                          </Button>
                          <AppendBar checked={histAppend} onChange={setHistAppend} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-secondary">展开任意记录 → 勾选题目 → 可"追加"与 AI 新题混排组卷；也可对历史题目直接举一反三</p>
            </>
          )}
          <SimilarPanel />
        </div>
      )}

      {/* ============ 手动出题 ============ */}
      {tab === 'manual' && (
        <div className="space-y-3.5">
          <p className="rounded-xl bg-bg-light p-3 text-xs leading-relaxed text-ink-secondary">
            手动录入题目后加到列表，可继续对任意一题点 <Sparkles size={11} className="inline text-[#ff9500]" /> 让 AI 同类型举一反三批量扩题。
          </p>
          <div className="grid grid-cols-1 gap-2.5">
            {fields.map(f => (
              <div key={f.k}>
                <div className="mb-1 text-xs font-medium text-ink-secondary">{f.label}{f.req && <span className="text-[#ff3b30]"> *</span>}</div>
                {f.area ? (
                  <textarea rows={3} value={mForm[f.k] || ''} placeholder={f.ph}
                    onChange={e => setMForm(p => ({ ...p, [f.k]: e.target.value }))}
                    className={`${inputCls} resize-y font-normal`} />
                ) : (
                  <input value={mForm[f.k] || ''} placeholder={f.ph}
                    onChange={e => setMForm(p => ({ ...p, [f.k]: e.target.value }))}
                    className={inputCls} />
                )}
              </div>
            ))}
          </div>
          {mErr && <p className="rounded-lg bg-[#ff3b30]/10 px-3 py-2 text-xs text-[#ff3b30]">{mErr}</p>}
          <Button variant="secondary" onClick={addManual}><PenLine size={14} />添加到题目列表</Button>

          {manualQs.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm">已录 <b className="text-[#0071e3]">{manualQs.length}</b> 题，已全选</p>
              <PreviewList questions={manualQs} sel={mSel} setSel={setMSel} />
              <div className="flex items-center gap-3">
                <Button onClick={() => apply(manualQs.filter(q => mSel.includes(q.id)), 'manual', mAppend)} disabled={!mSel.length}>
                  应用 {mSel.length} 题{mAppend && canAppend ? '（追加）' : '（替换试卷）'}
                </Button>
                <AppendBar checked={mAppend} onChange={setMAppend} />
              </div>
            </div>
          )}
          <SimilarPanel />
        </div>
      )}
    </Modal>
  );
}
