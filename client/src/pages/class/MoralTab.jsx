import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Trash2, Trophy, Check, Wand2, Upload, RefreshCw } from 'lucide-react';
import { api, ai, auth, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const CATEGORIES = ['课堂表现', '作业完成', '纪律卫生', '文明礼仪', '活动竞赛', '助人为乐'];
const QUICK = [
  { label: '+5', v: 5 }, { label: '+2', v: 2 }, { label: '+1', v: 1 },
  { label: '-1', v: -1 }, { label: '-2', v: -2 }, { label: '-5', v: -5 },
];

/** 德育量化：排行榜 + 快速加减分 + 最近记录 */
export default function MoralTab({ classId }) {
  const [data, setData] = useState(null); // { ranking, recent }
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [form, setForm] = useState({ score: 1, reason: '', category: '课堂表现' });
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/classes/${classId}/moral`).then(setData);
  useEffect(() => { load(); }, [classId]);

  const top3 = useMemo(() => (data?.ranking || []).slice(0, 3), [data]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const toggle = (sid) => {
    const next = new Set(picked);
    next.has(sid) ? next.delete(sid) : next.add(sid);
    setPicked(next);
  };

  const submit = async () => {
    if (!picked.size || !form.reason.trim()) return;
    setSaving(true);
    try {
      await api.post(`/classes/${classId}/moral`, {
        items: [...picked].map(sid => ({ student_id: sid, score: form.score, reason: form.reason, category: form.category, date: todayStr() })),
      });
      setOpen(false); setPicked(new Set()); setForm({ score: 1, reason: '', category: '课堂表现' });
      await load();
    } finally { setSaving(false); }
  };

  const medal = ['text-[#ff9500]', 'text-ink-secondary', 'text-[#c93400]'];

  /* ---- AI 解析聊天记录 → 批量加减分 ---- */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState(null); // [{student_id|null, aiName, score, reason, checked}]
  const [aiSaving, setAiSaving] = useState(false);
  const aiFileRef = useRef(null);

  const runMoralExtract = async () => {
    if (!aiText.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const names = data.ranking.map(s => s.name);
      const d = await ai.extract('moral', aiText.trim(), names);
      setAiItems((d.items || []).slice(0, 20).map(it => {
        const stu = data.ranking.find(s => s.name === String(it.student_name || '').trim());
        let score = Math.round(Number(it.score) || 1);
        score = Math.max(-5, Math.min(5, score)) || 1;
        return { student_id: stu?.student_id ?? null, aiName: String(it.student_name || ''), score, reason: String(it.reason || '').slice(0, 30), checked: !!stu };
      }));
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      alert(e.message || '解析失败');
    } finally { setAiLoading(false); }
  };

  const readMoralFile = async (file) => {
    if (!file) return;
    const text = (await file.text()).replace(/^﻿/, '');
    setAiText(t => (t ? t + '\n' : '') + text.slice(0, 8000));
    if (aiFileRef.current) aiFileRef.current.value = '';
  };

  const submitAiItems = async () => {
    const sel = (aiItems || []).filter(i => i.checked && i.student_id && i.reason.trim());
    if (!sel.length) return;
    setAiSaving(true);
    try {
      await api.post(`/classes/${classId}/moral`, {
        items: sel.map(i => ({ student_id: i.student_id, score: i.score, reason: i.reason.trim(), category: '日常记录', date: todayStr() })),
      });
      setAiOpen(false); setAiItems(null); setAiText('');
      await load();
    } finally { setAiSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* 前三名领奖台 */}
      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {top3.map((s, i) => (
            <div key={s.student_id} className={`card flex items-center gap-3 p-4 ${i === 0 ? 'border-[#ff9500]/40 bg-gradient-to-br from-[#ff9500]/5 to-[#ffcc00]/5' : ''}`}>
              <Trophy size={20} className={medal[i]} />
              <div className="min-w-0">
                <div className="truncate font-medium">{s.name}</div>
                <div className="text-xs text-ink-secondary">总分 <b className={s.total >= 0 ? 'text-[#1fa733]' : 'text-[#ff3b30]'}>{s.total}</b></div>
              </div>
              <div className="ml-auto text-2xl font-bold text-ink-secondary/30">{i + 1}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setAiOpen(true); setAiItems(null); }}><Wand2 size={15} />AI 提取</Button>
        <Button onClick={() => setOpen(true)}><Plus size={15} />快速加减分</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 排行榜 */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-black/5 bg-bg-light px-4 py-3 text-sm font-medium">量化排行</div>
          <div className="max-h-[420px] overflow-y-auto">
            {data.ranking.map((s, i) => (
              <div key={s.student_id} className="flex items-center gap-3 border-b border-black/[0.04] px-4 py-2.5 last:border-0">
                <span className={`w-6 text-center text-sm font-semibold ${i < 3 ? 'text-[#ff9500]' : 'text-ink-secondary/50'}`}>{i + 1}</span>
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-ink-secondary">{s.record_count} 条记录</span>
                <span className={`ml-auto text-lg font-bold ${s.total > 0 ? 'text-[#1fa733]' : s.total < 0 ? 'text-[#ff3b30]' : 'text-ink-secondary'}`}>
                  {s.total > 0 ? `+${s.total}` : s.total}
                </span>
              </div>
            ))}
            {!data.ranking.length && <Empty text="暂无学生" />}
          </div>
        </div>

        {/* 最近记录 */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-black/5 bg-bg-light px-4 py-3 text-sm font-medium">最近记录</div>
          <div className="max-h-[420px] overflow-y-auto">
            {data.recent.map(r => (
              <div key={r.id} className="group flex items-start gap-3 border-b border-black/[0.04] px-4 py-2.5 last:border-0">
                <span className={`mt-0.5 w-10 shrink-0 text-center text-sm font-bold ${r.score > 0 ? 'text-[#1fa733]' : 'text-[#ff3b30]'}`}>
                  {r.score > 0 ? `+${r.score}` : r.score}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><b>{r.student_name}</b> · {r.reason}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-secondary">
                    <Badge tone="gray">{r.category}</Badge>{r.date}
                  </div>
                </div>
                <button onClick={async () => { await api.del(`/moral-scores/${r.id}`); load(); }}
                  className="btn-pill p-1 text-ink-secondary opacity-0 hover:text-[#ff3b30] group-hover:opacity-100" title="删除">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {!data.recent.length && <Empty text="暂无加减分记录" />}
          </div>
        </div>
      </div>

      {/* 快速加减分弹窗 */}
      <Modal open={open} onClose={() => setOpen(false)} title="快速加减分" width="max-w-xl">
        <div className="space-y-4">
          <Field label={`选择学生（已选 ${picked.size} 人）`}>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-black/10 p-2.5">
              {data.ranking.map(s => (
                <button key={s.student_id} onClick={() => toggle(s.student_id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
                    picked.has(s.student_id) ? 'brand-gradient text-white shadow' : 'bg-black/[0.05] text-ink hover:bg-[#0071e3]/10'
                  }`}>
                  {picked.has(s.student_id) && <Check size={10} className="mr-0.5 inline" />}{s.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="分值">
            <div className="flex gap-1.5">
              {QUICK.map(q => (
                <button key={q.label} onClick={() => setForm({ ...form, score: q.v })}
                  className={`btn-pill flex-1 py-2 text-sm font-bold transition ${
                    form.score === q.v
                      ? q.v > 0 ? 'bg-[#28cd41] text-white shadow' : 'bg-[#ff3b30] text-white shadow'
                      : 'bg-black/[0.05] text-ink-secondary hover:bg-black/[0.08]'
                  }`}>{q.label}</button>
              ))}
            </div>
          </Field>
          <Field label="类别">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setForm({ ...form, category: c })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${form.category === c ? 'bg-[#0071e3] text-white' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/[0.08]'}`}>
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="事由">
            <input className={inputCls} placeholder="如：主动帮助同学讲解难题 / 上课讲话" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <Button className="w-full justify-center" onClick={submit} disabled={!picked.size || !form.reason.trim() || saving}>
            {saving ? '提交中…' : `为 ${picked.size} 名学生${form.score > 0 ? '加' : '减'} ${Math.abs(form.score)} 分`}
          </Button>
        </div>
      </Modal>
      {/* AI 解析聊天记录批量加减分 */}
      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="AI 提取加减分" width="max-w-2xl">
        {!aiItems ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-bg-light p-3 text-xs leading-relaxed text-ink-secondary">
              把家长群/科任老师反馈聊天记录粘贴到下面（或上传 txt），AI 自动识别学生表扬/批评事件并匹配本班学生，确认后批量记入德育量化。<b className="text-ink">每次解析扣 2 算力</b>
            </p>
            <textarea
              className={`${inputCls} resize-y font-normal`}
              rows={8}
              placeholder={'例：\n数学老师：今天小组讨论王小明组织得特别好\n李妈妈：孩子回家说张三主动帮他补习功课\n体育委员：刘五跑操又迟到'}
              value={aiText}
              onChange={e => setAiText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={runMoralExtract} disabled={!aiText.trim() || aiLoading}>
                {aiLoading ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
                {aiLoading ? 'AI 解析中…' : '开始解析'}
              </Button>
              <Button variant="secondary" onClick={() => aiFileRef.current?.click()}><Upload size={15} />上传 txt</Button>
              <input ref={aiFileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={e => readMoralFile(e.target.files?.[0])} />
              <span className="ml-auto text-xs text-ink-secondary">{aiText.length}/8000 字</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              解析出 <b className="text-[#0071e3]">{aiItems.length}</b> 条记录，
              <span className="text-[#1fa733]">匹配成功 {aiItems.filter(i => i.student_id).length}</span> 条
              {aiItems.some(i => !i.student_id) && <span className="text-[#ff3b30]">，{aiItems.filter(i => !i.student_id).length} 条未匹配学生（可手动选择或忽略）</span>}
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {aiItems.map((it, i) => (
                <div key={i} className={`rounded-xl border p-2.5 transition ${it.checked && it.student_id ? 'border-[#0071e3]/30 bg-[#0071e3]/[0.04]' : 'border-black/5 opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" checked={it.checked} disabled={!it.student_id}
                      onChange={() => setAiItems(items => items.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                      className="h-4 w-4 accent-[#0071e3]" />
                    {it.student_id ? (
                      <Badge tone="green">{data.ranking.find(s => s.student_id === it.student_id)?.name}</Badge>
                    ) : (
                      <select value="" onChange={e => setAiItems(items => items.map((x, j) => j === i ? { ...x, student_id: Number(e.target.value) || null, checked: !!e.target.value } : x))}
                        className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-[#0071e3]">
                        <option value="">未匹配：{it.aiName}</option>
                        {data.ranking.map(s => <option key={s.student_id} value={s.student_id}>{s.name}</option>)}
                      </select>
                    )}
                    <select value={it.score}
                      onChange={e => setAiItems(items => items.map((x, j) => j === i ? { ...x, score: Number(e.target.value) } : x))}
                      className={`rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-bold outline-none focus:border-[#0071e3] ${it.score > 0 ? 'text-[#1fa733]' : 'text-[#ff3b30]'}`}>
                      {[5, 3, 2, 1, -1, -2, -3, -5].map(v => <option key={v} value={v}>{v > 0 ? `+${v}` : v} 分</option>)}
                    </select>
                    <input className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#0071e3]"
                      value={it.reason} onChange={e => setAiItems(items => items.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={submitAiItems} disabled={aiSaving || !aiItems.some(i => i.checked && i.student_id && i.reason.trim())}>
                {aiSaving ? '记录中…' : `记入 ${aiItems.filter(i => i.checked && i.student_id && i.reason.trim()).length} 条记录`}
              </Button>
              <Button variant="secondary" onClick={() => { setAiItems(null); setAiText(''); }}>重新粘贴</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
