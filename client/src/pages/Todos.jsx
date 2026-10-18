import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, CalendarDays, Wand2, Upload, RefreshCw } from 'lucide-react';
import { api, ai, auth } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty, statusTone } from '../components/ui.jsx';

const CATEGORIES = ['班级事务', '活动组织', '家校沟通', '环境布置', '行政事务', '安全教育'];

export default function Todos() {
  const [todos, setTodos] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', category: '班级事务', due_date: '', priority: '中' });

  const load = () => api.get('/todos').then(setTodos).catch(console.error);
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    await api.post('/todos', form);
    setOpen(false);
    setForm({ title: '', category: '班级事务', due_date: '', priority: '中' });
    load();
  };

  const pending = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);
  const today = new Date().toISOString().slice(0, 10);

  /* ---- AI 解析聊天记录 → 批量提取待办 ---- */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState(null); // [{title, due_date, priority, checked}]
  const [creating, setCreating] = useState(false);
  const aiFileRef = useRef(null);

  const runExtract = async () => {
    if (!aiText.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const d = await ai.extract('todos', aiText.trim());
      setAiItems((d.items || []).slice(0, 15).map(it => ({
        title: String(it.title || '').slice(0, 40),
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(it.due_date || '') ? it.due_date : '',
        priority: ['高', '中', '低'].includes(it.priority) ? it.priority : '中',
        checked: true,
      })));
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      alert(e.message || '解析失败');
    } finally { setAiLoading(false); }
  };

  const readAiFile = async (file) => {
    if (!file) return;
    const text = (await file.text()).replace(/^﻿/, '');
    setAiText(t => (t ? t + '\n' : '') + text.slice(0, 8000));
    if (aiFileRef.current) aiFileRef.current.value = '';
  };

  const createFromAi = async () => {
    const sel = (aiItems || []).filter(i => i.checked && i.title.trim());
    if (!sel.length) return;
    setCreating(true);
    try {
      for (const it of sel) {
        await api.post('/todos', { title: it.title.trim(), category: '班级事务', due_date: it.due_date, priority: it.priority });
      }
      setAiOpen(false); setAiItems(null); setAiText('');
      load();
    } finally { setCreating(false); }
  };

  return (
    <div>
      <SectionHeader
        title="班级事务待办"
        desc={`${pending.length} 项待处理 · ${done.length} 项已完成`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setAiOpen(true); setAiItems(null); }}><Wand2 size={15} />AI 提取</Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} />新建待办</Button>
          </div>
        }
      />

      {todos.length === 0 ? <Empty text="暂无待办事项" /> : (
        <div className="card divide-y divide-black/5">
          {todos.map(t => {
            const overdue = !t.done && t.due_date && t.due_date < today;
            return (
              <div key={t.id} className={`group flex items-center gap-4 px-5 py-4 transition hover:bg-bg-light/60 ${t.done ? 'opacity-55' : ''}`}>
                <button onClick={async () => { await api.patch(`/todos/${t.id}/toggle`); load(); }} className="shrink-0 text-[#0071e3]">
                  {t.done ? <CheckCircle2 size={22} className="text-[#28cd41]" /> : <Circle size={22} className="text-black/20 hover:text-[#0071e3]" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`font-medium ${t.done ? 'line-through' : ''}`}>{t.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="purple">{t.category}</Badge>
                    <Badge tone={statusTone[t.priority]}>{t.priority}优先级</Badge>
                    {t.due_date && (
                      <span className={`flex items-center gap-1 text-xs ${overdue ? 'font-semibold text-[#ff3b30]' : 'text-ink-secondary'}`}>
                        <CalendarDays size={12} />{overdue ? '已逾期 · ' : '截止 '}{t.due_date}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => { if (confirm('确认删除该待办？')) { await api.del(`/todos/${t.id}`); load(); } }}
                  className="btn-pill p-1.5 text-ink-secondary/50 opacity-0 transition group-hover:opacity-100 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="新建待办">
        <form onSubmit={submit} className="space-y-4">
          <Field label="待办事项">
            <input required className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：统计秋游回执单" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="分类">
              <select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="优先级">
              <select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option>高</option><option>中</option><option>低</option>
              </select>
            </Field>
          </div>
          <Field label="截止日期">
            <input type="date" className={inputCls} value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit">创建</Button>
          </div>
        </form>
      </Modal>
      {/* AI 解析聊天记录提取待办 */}
      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="AI 提取待办" width="max-w-2xl">
        {!aiItems ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-bg-light p-3 text-xs leading-relaxed text-ink-secondary">
              把家长群/同事聊天记录粘贴到下面（或上传 txt 文件），AI 自动提取需要你跟进的待办事项，确认后批量创建。<b className="text-ink">每次解析扣 2 算力</b>
            </p>
            <textarea
              className={`${inputCls} resize-y font-normal`}
              rows={8}
              placeholder={'例：\n李妈妈：老师，周三运动会需要带水杯吗？\n张爸爸：孩子请病假两天，周四返校\n王老师：下周一下午交交通安全主题班会材料'}
              value={aiText}
              onChange={e => setAiText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={runExtract} disabled={!aiText.trim() || aiLoading}>
                {aiLoading ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
                {aiLoading ? 'AI 解析中…' : '开始解析'}
              </Button>
              <Button variant="secondary" onClick={() => aiFileRef.current?.click()}><Upload size={15} />上传 txt</Button>
              <input ref={aiFileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={e => readAiFile(e.target.files?.[0])} />
              <span className="ml-auto text-xs text-ink-secondary">{aiText.length}/8000 字</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">解析出 <b className="text-[#0071e3]">{aiItems.length}</b> 条待办，可修改后勾选创建</p>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {aiItems.map((it, i) => (
                <div key={i} className={`rounded-xl border p-2.5 transition ${it.checked ? 'border-[#0071e3]/30 bg-[#0071e3]/[0.04]' : 'border-black/5 opacity-60'}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={it.checked}
                      onChange={() => setAiItems(items => items.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))}
                      className="h-4 w-4 accent-[#0071e3]" />
                    <input className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#0071e3]"
                      value={it.title} onChange={e => setAiItems(items => items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-6">
                    <input type="date" className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-[#0071e3]"
                      value={it.due_date} onChange={e => setAiItems(items => items.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} />
                    <select className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-[#0071e3]"
                      value={it.priority} onChange={e => setAiItems(items => items.map((x, j) => j === i ? { ...x, priority: e.target.value } : x))}>
                      <option>高</option><option>中</option><option>低</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={createFromAi} disabled={creating || !aiItems.some(i => i.checked && i.title.trim())}>
                {creating ? '创建中…' : `创建 ${aiItems.filter(i => i.checked && i.title.trim()).length} 项待办`}
              </Button>
              <Button variant="secondary" onClick={() => { setAiItems(null); setAiText(''); }}>重新粘贴</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
