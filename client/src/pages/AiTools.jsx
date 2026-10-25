/** AI 工具集：备课助手 / 作业提效 / 作文评语 / 资料库检索（统一开关与模型设置） */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bot, BookOpen, ClipboardCheck, PenLine, Search, Loader2, Copy, Check, Settings2,
  Sparkles, Download, Eye, EyeOff, FileText, Lightbulb,
} from 'lucide-react';
import { SectionHeader, Button, Badge, Empty, Modal, Field, inputCls } from '../components/ui.jsx';
import { ai, api, auth } from '../api.js';

const GRADES = [
  { v: '1', l: '一年级' }, { v: '2', l: '二年级' }, { v: '3', l: '三年级' },
  { v: '4', l: '四年级' }, { v: '5', l: '五年级' }, { v: '6', l: '六年级' },
  { v: '7', l: '七年级' }, { v: '8', l: '八年级' }, { v: '9', l: '九年级' }, { v: 'zk', l: '中考' },
];
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '科学', '信息技术', '音乐', '美术', '体育与健康'];
const TONES = ['温暖鼓励', '严谨中肯', '幽默亲切', '简明扼要'];

const TABS = [
  { key: 'lesson', label: 'AI 备课助手', icon: BookOpen },
  { key: 'homework', label: '作业提效', icon: ClipboardCheck },
  { key: 'comment', label: '作文 / 作业评语', icon: PenLine },
  { key: 'material', label: '资料库检索', icon: Search },
];

const gradeLabel = (v) => GRADES.find(g => g.v === v)?.l || v;

/* AI 调用后同步顶栏算力余额 */
const syncCredits = (d) => {
  if (d?.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
};

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* 忽略剪贴板权限问题 */ }
  };
  return [copied, copy];
}

const ErrorBox = ({ msg }) => msg ? (
  <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{msg}</div>
) : null;

export default function AiTools() {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(t => t.key === sp.get('tab')) ? sp.get('tab') : 'lesson';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [st, setSt] = useState({ enabled: true, model: '', models: [] });

  const loadSettings = () => ai.settings().then(setSt).catch(() => {});
  useEffect(() => { loadSettings(); }, []);

  const Panel = { lesson: LessonPanel, homework: HomeworkPanel, comment: CommentPanel, material: MaterialPanel }[tab];

  return (
    <div>
      <SectionHeader
        title="AI 工具"
        desc="备课、作业、评语与资料检索一站搞定；模型与开关随时可调"
        action={(
          <div className="flex items-center gap-2">
            <Badge tone={st.enabled ? 'green' : 'red'}>{st.enabled ? 'AI 已开启' : 'AI 已关闭'}</Badge>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Settings2 size={16} />设置</Button>
          </div>
        )}
      />

      {!st.enabled && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#ff9500]/30 bg-[#ff9500]/[0.08] px-4 py-3 text-sm text-[#8a4b00]">
          <Bot size={17} />
          <span>AI 功能当前已关闭，所有生成接口不可用。</span>
          <Button className="ml-auto" onClick={() => setSettingsOpen(true)}>去开启</Button>
        </div>
      )}

      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSp({ tab: t.key }, { replace: true })}
            className={`btn-pill flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07] hover:text-ink'
            }`}
          >
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      <Panel disabled={!st.enabled} openSettings={() => setSettingsOpen(true)} />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} st={st} reload={loadSettings} />
    </div>
  );
}

/* ==================== 设置 ==================== */
function SettingsModal({ open, onClose, st, reload }) {
  const [form, setForm] = useState({ enabled: st.enabled, model: st.model });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setForm({ enabled: st.enabled, model: st.model }); setErr(''); }
  }, [open, st.enabled, st.model]);

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await ai.saveSettings(form);
      await reload();
      onClose();
    } catch (e) { setErr(e.message || '保存失败'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="AI 设置" width="max-w-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-black/[0.08] bg-bg-light px-4 py-3">
          <div>
            <div className="text-sm font-semibold">启用 AI 功能</div>
            <div className="mt-0.5 text-xs text-ink-secondary">关闭后所有 AI 接口不可用，已生成的历史仍保留</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.enabled}
            onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${form.enabled ? 'bg-[#28cd41]' : 'bg-black/15'}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${form.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <Field label="使用的模型">
          <select className={inputCls} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}>
            {(st.models || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <p className="text-xs leading-relaxed text-ink-secondary">
          模型由服务端统一接入，密钥不经过浏览器；如需新增模型请联系管理员配置。
        </p>

        <ErrorBox msg={err} />
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存设置'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ==================== 备课助手 ==================== */
function LessonPanel({ disabled }) {
  const [form, setForm] = useState({ subject: '语文', grade: '7', topic: '', duration: 1, textbook: '', style: '' });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, copy] = useCopy();

  const run = async () => {
    if (!form.topic.trim()) { setErr('请填写课题'); return; }
    setLoading(true); setErr('');
    try {
      const d = await ai.lessonPlan({ ...form, topic: form.topic.trim() });
      setPlan(d.plan); syncCredits(d);
    } catch (e) { setErr(e.message || '生成失败'); } finally { setLoading(false); }
  };

  const asText = () => {
    if (!plan) return '';
    const lines = [`《${plan.topic}》备课方案`, `学科：${plan.subject} · ${gradeLabel(plan.grade)} · ${plan.duration} 课时`, ''];
    if (plan.overview) lines.push(`【备课思路】\n${plan.overview}`, '');
    const sec = (t, arr) => arr?.length ? [`【${t}】`, ...arr.map((x, i) => `${i + 1}. ${x}`), ''] : [];
    lines.push(...sec('教学目标', plan.objectives), ...sec('教学重点', plan.key_points), ...sec('教学难点', plan.difficulties), ...sec('课前准备', plan.preparation));
    if (plan.stages?.length) {
      lines.push('【课堂环节】');
      plan.stages.forEach(s => lines.push(`${s.name}（${s.minutes} 分钟）\n  教师：${s.teacher}\n  学生：${s.student}${s.note ? `\n  设计意图：${s.note}` : ''}`));
      lines.push('');
    }
    const hw = plan.homework || {};
    if (hw.basic?.length || hw.improve?.length || hw.extend?.length) {
      lines.push('【分层作业】');
      if (hw.basic?.length) lines.push(`基础：${hw.basic.join('；')}`);
      if (hw.improve?.length) lines.push(`提升：${hw.improve.join('；')}`);
      if (hw.extend?.length) lines.push(`拓展：${hw.extend.join('；')}`);
      lines.push('');
    }
    if (plan.reflection) lines.push(`【课后反思】\n${plan.reflection}`);
    return lines.join('\n');
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="学科">
            <input className={inputCls} list="ai-subjects" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="如：语文 / 物理" />
            <datalist id="ai-subjects">{SUBJECTS.map(s => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="课题">
            <input className={inputCls} value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="如：《背影》第二课时" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {GRADES.map(g => (
            <button key={g.v} type="button" onClick={() => setForm(f => ({ ...f, grade: g.v }))}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${form.grade === g.v ? 'bg-[#0071e3] text-white' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10'}`}>
              {g.l}
            </button>
          ))}
          <span className="ml-2 flex items-center gap-1.5 text-xs text-ink-secondary">
            课时
            <input type="number" min="0.5" max="4" step="0.5" className="w-16 rounded-lg border border-black/10 bg-bg-light px-2 py-1 text-center text-xs outline-none focus:border-[#0071e3]"
              value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="教材版本 / 单元（选填）">
            <input className={inputCls} value={form.textbook} onChange={e => setForm({ ...form, textbook: e.target.value })} placeholder="如：部编版 八年级上册 第二单元" />
          </Field>
          <Field label="教学风格 / 特别要求（选填）">
            <input className={inputCls} value={form.style} onChange={e => setForm({ ...form, style: e.target.value })} placeholder="如：小组合作、少讲多练" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={loading || disabled}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? '生成中…' : '生成备课方案（3 算力）'}
          </Button>
          {plan && <Button variant="secondary" onClick={() => copy(asText())}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制全文'}</Button>}
        </div>
        <div className="mt-3"><ErrorBox msg={err} /></div>
      </div>

      {plan ? (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold tracking-tight">{plan.topic}</h3>
              <Badge tone="blue">{plan.subject}</Badge>
              <Badge>{gradeLabel(plan.grade)}</Badge>
              <Badge tone="purple">{plan.duration} 课时</Badge>
            </div>
            {plan.overview && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{plan.overview}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ListCard title="教学目标" items={plan.objectives} tone="blue" />
            <ListCard title="课前准备" items={plan.preparation} tone="purple" />
            <ListCard title="教学重点" items={plan.key_points} tone="green" />
            <ListCard title="教学难点" items={plan.difficulties} tone="orange" />
          </div>

          {!!plan.stages?.length && (
            <div className="card p-5">
              <h3 className="mb-3 font-semibold">课堂环节</h3>
              <div className="space-y-3">
                {plan.stages.map((s, i) => (
                  <div key={i} className="rounded-2xl bg-bg-light p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0071e3]/10 text-xs font-bold text-[#0071e3]">{i + 1}</span>
                      <span className="font-medium">{s.name}</span>
                      <Badge tone="blue">{s.minutes} 分钟</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-ink-secondary sm:grid-cols-2">
                      <div><span className="font-medium text-ink">教师：</span>{s.teacher}</div>
                      <div><span className="font-medium text-ink">学生：</span>{s.student}</div>
                    </div>
                    {s.note && <div className="mt-1.5 text-xs text-ink-secondary/80">设计意图：{s.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(plan.homework?.basic?.length || plan.homework?.improve?.length || plan.homework?.extend?.length) ? (
            <div className="card p-5">
              <h3 className="mb-3 font-semibold">分层作业</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[['基础', plan.homework.basic, 'gray'], ['提升', plan.homework.improve, 'blue'], ['拓展', plan.homework.extend, 'purple']].map(([label, arr, tone]) => (
                  <div key={label} className="rounded-2xl bg-bg-light p-4">
                    <Badge tone={tone}>{label}</Badge>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink-secondary">
                      {(arr || []).map((x, i) => <li key={i} className="flex gap-1.5"><span className="text-ink-secondary/50">·</span>{x}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {plan.reflection && (
            <div className="card flex gap-3 border-l-4 border-l-[#28cd41] p-5">
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-[#1fa733]" />
              <div>
                <div className="text-sm font-semibold">课后反思提示</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-secondary">{plan.reflection}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Empty icon={BookOpen} text="填入课题即可生成一份完整备课方案" desc="包含教学目标、重难点、课堂环节时间分配、分层作业与反思提示" />
      )}
    </div>
  );
}

function ListCard({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone={tone}>{title}</Badge>
      </div>
      <ul className="space-y-1.5 text-sm text-ink-secondary">
        {items.map((x, i) => <li key={i} className="flex gap-1.5"><span className="text-ink-secondary/40">{i + 1}.</span>{x}</li>)}
      </ul>
    </div>
  );
}

/* ==================== 作业提效 ==================== */
function HomeworkPanel({ disabled }) {
  const [form, setForm] = useState({ subject: '数学', grade: '7', topic: '', count: 5, difficulty: 'medium', types: '' });
  const [list, setList] = useState([]);
  const [showAns, setShowAns] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, copy] = useCopy();

  const run = async () => {
    if (!form.topic.trim()) { setErr('请填写作业主题或知识点'); return; }
    setLoading(true); setErr('');
    try {
      const d = await ai.homework({ ...form, count: Number(form.count) || 5, topic: form.topic.trim() });
      setList(d.questions || []); setShowAns({}); syncCredits(d);
    } catch (e) { setErr(e.message || '生成失败'); } finally { setLoading(false); }
  };

  const asText = () => [
    `作业：${form.subject} · ${gradeLabel(form.grade)} · ${form.topic}`,
    '',
    ...list.map((q, i) => {
      const choices = (q.choices || []).map((c, j) => `${'ABCD'[j]}. ${c}`).join('  ');
      return `${i + 1}. ${q.stem}${choices ? `\n${choices}` : ''}\n答案：${q.answer}${q.comment ? `\n批注：${q.comment}` : ''}`;
    }),
  ].join('\n');

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="学科">
            <input className={inputCls} list="ai-subjects-hw" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            <datalist id="ai-subjects-hw">{SUBJECTS.map(s => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="知识点 / 作业主题">
            <input className={inputCls} value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="如：一元二次方程的应用" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {GRADES.map(g => (
            <button key={g.v} type="button" onClick={() => setForm(f => ({ ...f, grade: g.v }))}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${form.grade === g.v ? 'bg-[#0071e3] text-white' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10'}`}>
              {g.l}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="题量">
            <input type="number" min="1" max="15" className={inputCls} value={form.count} onChange={e => setForm({ ...form, count: e.target.value })} />
          </Field>
          <Field label="难度">
            <select className={inputCls} value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
              <option value="easy">基础</option>
              <option value="medium">中等</option>
              <option value="hard">拔高</option>
            </select>
          </Field>
          <Field label="题型偏好（选填）">
            <input className={inputCls} value={form.types} onChange={e => setForm({ ...form, types: e.target.value })} placeholder="如：选择、填空、解答" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={loading || disabled}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? '生成中…' : '生成作业（5 算力）'}
          </Button>
          {!!list.length && <Button variant="secondary" onClick={() => copy(asText())}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制全部'}</Button>}
        </div>
        <div className="mt-3"><ErrorBox msg={err} /></div>
      </div>

      {list.length ? (
        <div className="space-y-3">
          {list.map((q, i) => (
            <div key={q.id || i} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tabular-nums">{i + 1}.</span>
                <Badge tone="blue">{q.qtype}</Badge>
                <Badge>{q.points} 分</Badge>
                <button className="btn-pill ml-auto flex items-center gap-1 px-2.5 py-1 text-xs text-[#0071e3] hover:bg-[#0071e3]/10"
                  onClick={() => setShowAns(s => ({ ...s, [i]: !s[i] }))}>
                  {showAns[i] ? <EyeOff size={13} /> : <Eye size={13} />}{showAns[i] ? '隐藏答案' : '查看答案'}
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{q.stem}</p>
              {!!q.choices?.length && (
                <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-ink-secondary sm:grid-cols-2">
                  {q.choices.map((c, j) => <div key={j}>{'ABCDEFG'[j]}. {c}</div>)}
                </div>
              )}
              {showAns[i] && (
                <div className="mt-3 rounded-xl bg-[#28cd41]/[0.06] p-3 text-sm">
                  <div><span className="font-medium text-[#1fa733]">答案：</span>{q.answer || '（未提供）'}</div>
                  {q.comment && <div className="mt-1 text-ink-secondary"><span className="font-medium text-ink">批注：</span>{q.comment}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={ClipboardCheck} text="输入知识点，生成题目 + 答案 + 批注" desc="批注包含评分要点与常见错误，方便直接布置与讲评" />
      )}
    </div>
  );
}

/* ==================== 作文 / 作业评语 ==================== */
function CommentPanel({ disabled }) {
  const [form, setForm] = useState({ text: '', title: '', tone: '温暖鼓励', focus: '' });
  const [result, setResult] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, copy] = useCopy();

  const run = async () => {
    if (!form.text.trim()) { setErr('请粘贴作文或作业内容'); return; }
    setLoading(true); setErr('');
    try {
      const d = await ai.essayComment({ ...form, text: form.text.trim() });
      setResult(d.result);
      setDraft(d.result.comment || '');
      syncCredits(d);
    } catch (e) { setErr(e.message || '生成失败'); } finally { setLoading(false); }
  };

  const asText = () => result ? [
    form.title ? `【${form.title}】` : '',
    result.score != null ? `得分：${result.score}${result.grade ? `（${result.grade}）` : ''}` : '',
    draft,
    result.highlights?.length ? `亮点：${result.highlights.join('；')}` : '',
    result.issues?.length ? `建议：${result.issues.join('；')}` : '',
    result.rewrite ? `示范修改：${result.rewrite}` : '',
  ].filter(Boolean).join('\n') : '';

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="题目 / 作业名称（选填）">
            <input className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：作文《那一刻，我长大了》" />
          </Field>
          <Field label="重点关注（选填）">
            <input className={inputCls} value={form.focus} onChange={e => setForm({ ...form, focus: e.target.value })} placeholder="如：结构 / 论证 / 语言表达" />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="评语语气">
            <div className="flex flex-wrap gap-1.5">
              {TONES.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tone: t }))}
                  className={`btn-pill px-3.5 py-1.5 text-xs font-medium transition ${form.tone === t ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/10'}`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-4">
          <Field label={`原文（${form.text.length} / 8000 字）`}>
            <textarea className={`${inputCls} h-40 resize-y font-mono text-[13px] leading-relaxed`} maxLength={8000}
              value={form.text} onChange={e => setForm({ ...form, text: e.target.value })}
              placeholder="粘贴学生作文或作业正文，AI 会引用原文语句写评语" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={loading || disabled}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? '生成中…' : '生成评语（2 算力）'}
          </Button>
          {result && <Button variant="secondary" onClick={() => copy(asText())}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制评语'}</Button>}
        </div>
        <div className="mt-3"><ErrorBox msg={err} /></div>
      </div>

      {result ? (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <FileText size={17} className="text-[#0071e3]" />
              <span className="font-semibold">评语结果</span>
              {result.score != null && <Badge tone="green">{result.score} 分</Badge>}
              {result.grade && <Badge tone="blue">{result.grade}</Badge>}
              <span className="ml-auto text-xs text-ink-secondary">可直接修改后再复制</span>
            </div>
            <textarea className={`${inputCls} mt-3 h-32 resize-y`} value={draft} onChange={e => setDraft(e.target.value)} />
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {!!result.highlights?.length && (
                <div className="rounded-2xl bg-[#28cd41]/[0.06] p-4">
                  <div className="mb-1.5 text-sm font-semibold text-[#1fa733]">亮点</div>
                  <ul className="space-y-1 text-sm text-ink-secondary">{result.highlights.map((x, i) => <li key={i}>· {x}</li>)}</ul>
                </div>
              )}
              {!!result.issues?.length && (
                <div className="rounded-2xl bg-[#ff9500]/[0.08] p-4">
                  <div className="mb-1.5 text-sm font-semibold text-[#8a4b00]">改进建议</div>
                  <ul className="space-y-1 text-sm text-ink-secondary">{result.issues.map((x, i) => <li key={i}>· {x}</li>)}</ul>
                </div>
              )}
            </div>
            {result.rewrite && (
              <div className="mt-3 rounded-2xl border border-[#0071e3]/20 bg-[#0071e3]/[0.04] p-4">
                <div className="mb-1 text-sm font-semibold text-[#0071e3]">示范修改片段</div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{result.rewrite}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <Empty icon={PenLine} text="粘贴原文，一键生成有依据的评语" desc="先肯定真实亮点，再给可操作的修改建议，措辞可改后复制" />
      )}
    </div>
  );
}

/* ==================== 资料库检索 ==================== */
function MaterialPanel({ disabled }) {
  const [query, setQuery] = useState('');
  const [materials, setMaterials] = useState([]);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, copy] = useCopy();

  useEffect(() => { api.get('/materials').then(setMaterials).catch(console.error); }, []);

  const byId = useMemo(() => new Map(materials.map(m => [String(m.id), m])), [materials]);

  const run = async () => {
    if (!query.trim()) { setErr('请输入检索关键词'); return; }
    setLoading(true); setErr('');
    try {
      const d = await ai.materialSearch(query.trim(), materials);
      setItems(d.items || []); syncCredits(d);
    } catch (e) { setErr(e.message || '检索失败'); } finally { setLoading(false); }
  };

  const download = async (m) => {
    try {
      const { url } = await api.get(`/materials/${m.id}/download`);
      window.open(url, '_blank', 'noopener');
    } catch (e) { alert(e.message || '获取下载地址失败'); }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <Field label="你想找什么资料？">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className={inputCls} value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') run(); }}
              placeholder="如：第 3 课时的课件 / 二次函数单元测 / 适合导入的视频" />
            <Button onClick={run} disabled={loading || disabled} className="shrink-0 justify-center">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {loading ? '检索中…' : 'AI 检索（1 算力）'}
            </Button>
          </div>
        </Field>
        <p className="mt-2 text-xs text-ink-secondary">
          已收录 {materials.length} 份资料；AI 只会在你的资料库范围内筛选，不会编造不存在的文件。
        </p>
        <div className="mt-3"><ErrorBox msg={err} /></div>
      </div>

      {items === null ? (
        <Empty icon={Search} text="用一句话描述你要找的资料" desc="AI 会结合标题、类型与摘要给出最相关的几条，并说明推荐理由" />
      ) : items.length === 0 ? (
        <Empty icon={FileText} text="没有匹配到资料" desc="换个关键词试试，或先在「备课资料」页上传相关课件 / 教案" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-secondary">找到 {items.length} 份相关资料</span>
            <Button variant="secondary" onClick={() => copy(items.map((m, i) => `${i + 1}. ${m.title}（${m.type}）— ${m.reason}`).join('\n'))}>
              {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制清单'}
            </Button>
          </div>
          {items.map((m, i) => {
            const full = byId.get(String(m.id));
            return (
              <div key={m.id || i} className="card card-hover flex items-start gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    {m.type && <Badge tone="blue">{m.type}</Badge>}
                    {m.course && <Badge>{m.course}</Badge>}
                  </div>
                  {m.summary && <div className="mt-0.5 truncate text-sm text-ink-secondary">{m.summary}</div>}
                  <div className="mt-1.5 flex gap-1.5 text-xs text-[#1fa733]"><Sparkles size={12} className="mt-0.5 shrink-0" />{m.reason}</div>
                </div>
                {full?.storage_path && (
                  <button onClick={() => download(full)} title="下载文件"
                    className="btn-pill shrink-0 p-2 text-[#0071e3] opacity-60 transition hover:bg-[#0071e3]/10 sm:opacity-0 sm:group-hover:opacity-100">
                    <Download size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
