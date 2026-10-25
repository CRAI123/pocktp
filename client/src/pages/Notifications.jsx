import { useEffect, useState } from 'react';
import { Wand2, Copy, Check, Plus, MessageSquare, Undo2, Trash2, Send, RefreshCw } from 'lucide-react';
import { api, ai, auth } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty } from '../components/ui.jsx';

const TEMPLATES = [
  { type: 'activity', label: '活动通知', desc: '班级活动 / 研学 / 比赛', fields: [['name', '活动名称'], ['date', '活动日期'], ['detail', '补充说明']] },
  { type: 'attendance', label: '考勤提醒', desc: '学生考勤异常私信家长', fields: [['student_name', '学生姓名'], ['status', '考勤状态'], ['date', '日期']] },
  { type: 'homework', label: '作业提醒', desc: '作业布置与截止催交', fields: [['course', '课程名称'], ['title', '作业标题'], ['deadline', '截止时间']] },
  { type: 'score', label: '成绩反馈', desc: '测验成绩私信反馈', fields: [['exam', '考试名称'], ['score', '学生得分'], ['average', '班级均分']] },
];

export default function Notifications() {
  const [list, setList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState(TEMPLATES[0]);
  const [classId, setClassId] = useState('');
  const [params, setParams] = useState({});
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [queue, setQueue] = useState('全部');
  /* 撰写方式：template=场景模板（免算力）；ai=按要点让 AI 撰写（家长通知 / 班级周报） */
  const [mode, setMode] = useState('template');
  const [aiKind, setAiKind] = useState('notice');
  const [points, setPoints] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const load = () => api.get('/notifications').then(setList).catch(console.error);
  useEffect(() => {
    load();
    api.get('/classes').then(cs => { setClasses(cs); if (cs.length) setClassId(String(cs[0].id)); }).catch(console.error);
  }, []);

  const setStatus = async (n, status) => {
    await api.patch(`/notifications/${n.id}`, { status });
    load();
  };

  const remove = async (n) => {
    if (!confirm(`删除通知「${n.title}」？`)) return;
    await api.del(`/notifications/${n.id}`);
    load();
  };

  const copyOne = async (n) => {
    await navigator.clipboard.writeText(`【${n.title}】\n${n.content}`);
  };

  const shown = list.filter(n => queue === '全部' || (n.status || '待发送') === queue);
  const pendingCount = list.filter(n => (n.status || '待发送') === '待发送').length;

  const generate = async () => {
    const result = await api.post('/notifications/generate', { type: tpl.type, class_id: classId || null, params });
    setGenerated(result);
    setCopied(false);
  };

  /* AI 按要点撰写：家长通知（2 算力）/ 班级周报（3 算力），结果可编辑后存入待发队列 */
  const generateAI = async () => {
    if (!points.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const d = await ai.write(aiKind, { points: points.trim() });
      setGenerated({ title: aiKind === 'weekly' ? '班级周报' : '家长通知', content: d.text });
      setCopied(false);
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setAiError(e.message || '生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`【${generated.title}】\n${generated.content}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    await api.post('/notifications', {
      ...generated, target_class_id: classId || null,
      channel: mode === 'ai' ? '微信群' : (tpl.type === 'attendance' || tpl.type === 'score' ? '微信私聊' : '微信群'),
    });
    setGenerated(null);
    setParams({});
    setOpen(false);
    load();
  };

  return (
    <div>
      <SectionHeader
        title="消息通知"
        desc="模板或 AI 撰写家长通知、班级周报，存入待发队列后复制发送"
        action={<Button onClick={() => setOpen(true)}><Plus size={16} />撰写通知</Button>}
      />

      {/* 待发队列筛选 */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {['全部', '待发送', '已发送'].map(k => (
          <button key={k} onClick={() => setQueue(k)}
            className={`btn-pill px-4 py-1.5 text-sm font-medium transition ${queue === k ? 'brand-gradient text-white shadow-md shadow-blue-500/20' : 'bg-white text-ink-secondary shadow-sm hover:text-ink'}`}>
            {k}{k === '待发送' && pendingCount ? ` ${pendingCount}` : ''}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-secondary">生成文案后先存入待发队列，发到群里再标记「已发送」</span>
      </div>

      {shown.length === 0 ? <Empty text={queue === '全部' ? '还没有生成过通知' : `没有${queue}的通知`} /> : (
        <div className="space-y-3">
          {shown.map(n => {
            const st = n.status || '待发送';
            return (
              <div key={n.id} className="card card-hover group p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#28cd41]/12 text-[#1fa733]">
                    <MessageSquare size={17} />
                  </div>
                  <h3 className="font-semibold">{n.title}</h3>
                  <Badge tone={st === '已发送' ? 'green' : 'orange'}>{st}</Badge>
                  <Badge tone="green">{n.channel}</Badge>
                  {n.class_name && <Badge tone="blue">{n.class_name}</Badge>}
                  <span className="ml-auto text-xs text-ink-secondary">{st === '已发送' && n.sent_at ? `发送于 ${n.sent_at}` : (n.created_at || '').slice(0, 16)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-bg-light p-4 text-sm leading-relaxed text-ink-secondary">{n.content}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Button variant="secondary" onClick={() => copyOne(n)}><Copy size={14} />复制</Button>
                  {st === '待发送' ? (
                    <Button onClick={() => setStatus(n, '已发送')}><Send size={14} />标记已发送</Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setStatus(n, '待发送')}><Undo2 size={14} />撤回待发</Button>
                  )}
                  <button onClick={() => remove(n)} title="删除通知"
                    className="btn-pill ml-auto p-2 text-ink-secondary/50 opacity-60 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 撰写器：模板快速生成 / AI 按要点撰写（原「AI 文案助手」已合并到这里） */}
      <Modal open={open} onClose={() => { setOpen(false); setGenerated(null); setAiError(''); }} title="撰写通知 / 周报" width="max-w-2xl">
        <div className="space-y-4">
          {/* 撰写方式 */}
          <div className="flex rounded-xl bg-black/[0.04] p-1 text-sm font-medium">
            {[['template', '模板快速生成'], ['ai', 'AI 按要点撰写']].map(([k, label]) => (
              <button key={k} type="button"
                onClick={() => { setMode(k); setGenerated(null); setAiError(''); }}
                className={`flex-1 rounded-lg px-3 py-2 transition ${mode === k ? 'bg-white text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>

          {mode === 'template' ? (
            <>
              {/* 模板选择 */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {TEMPLATES.map(t => (
                  <button
                    key={t.type}
                    onClick={() => { setTpl(t); setGenerated(null); setParams({}); }}
                    className={`rounded-2xl border p-3.5 text-left transition ${tpl.type === t.type ? 'border-transparent brand-gradient text-white shadow-md shadow-blue-500/25' : 'border-black/10 hover:border-[#0071e3]/40'}`}
                  >
                    <div className="text-sm font-semibold">{t.label}</div>
                    <div className={`mt-0.5 text-xs ${tpl.type === t.type ? 'text-white/80' : 'text-ink-secondary'}`}>{t.desc}</div>
                  </button>
                ))}
              </div>

              <Field label="目标班级">
                <select className={inputCls} value={classId} onChange={e => setClassId(e.target.value)}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              {/* 动态参数 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {tpl.fields.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input className={inputCls} value={params[key] || ''} onChange={e => setParams({ ...params, [key]: e.target.value })} />
                  </Field>
                ))}
              </div>

              <Button onClick={generate} className="w-full justify-center"><Wand2 size={16} />生成文案</Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {[{ k: 'notice', label: '家长通知', cost: 2 }, { k: 'weekly', label: '班级周报', cost: 3 }].map(o => (
                  <button key={o.k} type="button"
                    onClick={() => { setAiKind(o.k); setGenerated(null); }}
                    className={`btn-pill px-4 py-1.5 text-sm font-medium transition ${aiKind === o.k ? 'brand-gradient text-white shadow-md shadow-blue-500/20' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'}`}>
                    {o.label}
                  </button>
                ))}
                <Badge tone="purple">每次 {aiKind === 'weekly' ? 3 : 2} 算力</Badge>
              </div>

              <Field label="目标班级">
                <select className={inputCls} value={classId} onChange={e => setClassId(e.target.value)}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              <Field label="要点（大白话写即可）">
                <textarea
                  className={`${inputCls} min-h-[96px] resize-y leading-relaxed`}
                  rows={4}
                  placeholder={aiKind === 'weekly'
                    ? '例：本周完成期中复习；表扬小明、小红进步明显；下周运动会，提醒穿运动鞋'
                    : '例：下周三下午三点开家长会，地点本班教室，请家长提前十分钟到场，带上笔记本'}
                  value={points}
                  onChange={e => setPoints(e.target.value)}
                />
              </Field>

              <Button onClick={generateAI} disabled={!points.trim() || aiLoading} className="w-full justify-center">
                {aiLoading ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
                {aiLoading ? 'AI 撰写中…' : generated ? '重新生成' : 'AI 生成'}
              </Button>
              {aiError && <div className="text-sm text-[#ff3b30]">{aiError}</div>}
            </>
          )}

          {generated && (
            <div className="rounded-2xl border border-[#28cd41]/30 bg-[#28cd41]/5 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <input
                  className={`${inputCls} max-w-[240px] font-semibold`}
                  value={generated.title}
                  onChange={e => setGenerated(g => ({ ...g, title: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : '复制'}</Button>
                  <Button onClick={save} disabled={!generated.content?.trim()}>保存到待发</Button>
                </div>
              </div>
              <textarea
                className="w-full resize-y rounded-xl border border-black/[0.06] bg-white/70 px-3.5 py-3 text-sm leading-relaxed text-ink-secondary outline-none transition focus:border-[#0071e3]"
                rows={8}
                value={generated.content}
                onChange={e => setGenerated(g => ({ ...g, content: e.target.value }))}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
