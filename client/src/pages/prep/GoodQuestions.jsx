import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Upload, ListChecks } from 'lucide-react';
import { api } from '../../api.js';
import { SectionHeader, Button, Field, inputCls, Badge, Empty, Modal } from '../../components/ui.jsx';
import ImportDialog from '../../components/ImportDialog.jsx';
import { splitFields } from '../../lib/docx.js';
import { MASTER, masterTone } from './shared.js';

export default function GoodQuestions() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', q: '', a: '', master: '未掌握' });
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/cp/good').then(setRows).catch(console.error);
  useEffect(() => { load(); }, []);

  const chart = useMemo(() => {
    const map = {};
    rows.forEach(r => { const k = r.subject || '未分类'; map[k] = (map[k] || 0) + 1; });
    const arr = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...arr.map(a => a.count));
    return { arr, max };
  }, [rows]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.q.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/good', form);
      setOpen(false);
      setForm({ subject: '', q: '', a: '', master: '未掌握' });
      load();
    } finally { setBusy(false); }
  };

  const patch = async (id, master) => { await api.patch(`/cp/good/${id}`, { master }); load(); };
  const remove = async (id) => { if (!confirm('确认删除该题？')) return; await api.del(`/cp/good/${id}`); load(); };

  return (
    <div>
      <SectionHeader
        title="好题本"
        desc="按考点 / 题型积累好题，标注掌握度，随时回看解析要点。"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImpOpen(true)}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} />添加好题</Button>
          </div>
        }
      />

      <div className="card mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks size={17} className="text-[#0071e3]" />
          <h3 className="text-[15px] font-semibold text-ink">按考点分布</h3>
          <Badge tone="blue">{rows.length} 道</Badge>
        </div>
        {chart.arr.length === 0 ? <p className="text-sm text-ink-secondary">暂无数据</p> : (
          <div className="space-y-2.5">
            {chart.arr.map(c => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-ink-secondary" title={c.name}>{c.name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#0071e3] to-[#5ac8fa]" style={{ width: `${(c.count / chart.max) * 100}%` }} />
                </div>
                <span className="num w-8 shrink-0 text-right text-xs text-ink-secondary">{c.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? <Empty icon={ListChecks} text="暂无好题" desc="添加好题后，这里会按考点自动统计。" /> : (
        <div className="card divide-y divide-black/5">
          {rows.map(r => (
            <div key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{r.subject || '未分类'}</span>
                <Badge tone={masterTone[r.master]}>{r.master}</Badge>
                <button onClick={() => remove(r.id)} className="btn-pill ml-auto p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
              </div>
              {r.q && <div className="mt-1.5 whitespace-pre-wrap text-sm text-ink">题：{r.q}</div>}
              {r.a && <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">析：{r.a}</div>}
              <div className="mt-2.5">
                <select className={`${inputCls} w-auto py-1.5 text-xs`} value={r.master} onChange={e => patch(r.id, e.target.value)}>
                  {MASTER.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="添加好题">
        <form onSubmit={add} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="考点 / 题型">
              <input className={inputCls} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="如：文言文断句" required />
            </Field>
            <Field label="掌握度">
              <select className={inputCls} value={form.master} onChange={e => setForm({ ...form, master: e.target.value })}>
                {MASTER.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="题目">
            <textarea className={inputCls} rows={4} value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="题目或题干要点" required />
          </Field>
          <Field label="解析 / 要点">
            <textarea className={inputCls} rows={4} value={form.a} onChange={e => setForm({ ...form, a: e.target.value })} placeholder="解题思路与正解" />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>添加</Button>
          </div>
        </form>
      </Modal>

      <ImportDialog
        open={impOpen} onClose={() => setImpOpen(false)}
        title="好题本 · 批量导入" mod="good" onDone={load}
        example={'每行一条，可用 | 或空格分隔：\n考点/题型 题目 解析 掌握度(未掌握/复习中/已掌握)\n例：文言文断句 下列断句正确的一项 抓名词代词 复习中'}
        parse={(lines) => lines.map(ln => {
          const p = splitFields(ln);
          return { subject: p[0], q: p[1] || '', a: p[2] || '', master: MASTER.includes(p[3]) ? p[3] : '未掌握' };
        }).filter(r => r.subject)}
      />
    </div>
  );
}
