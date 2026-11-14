import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload, ScrollText } from 'lucide-react';
import { api } from '../../api.js';
import { SectionHeader, Button, Field, inputCls, Badge, Empty, Modal } from '../../components/ui.jsx';
import ImportDialog from '../../components/ImportDialog.jsx';
import { splitFields } from '../../lib/docx.js';
import { READ_SECTIONS } from './shared.js';

export default function ReviewPoints() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('全部');
  const [open, setOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [form, setForm] = useState({ section: READ_SECTIONS[0], content: '', note: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/cp/points').then(setRows).catch(console.error);
  useEffect(() => { load(); }, []);

  const list = filter === '全部' ? rows : rows.filter(r => r.section === filter);

  const add = async (e) => {
    e.preventDefault();
    if (!form.content.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/points', form);
      setOpen(false);
      setForm({ section: READ_SECTIONS[0], content: '', note: '' });
      load();
    } finally { setBusy(false); }
  };

  const remove = async (id) => { if (!confirm('确认删除该要点？')) return; await api.del(`/cp/points/${id}`); load(); };

  return (
    <div>
      <SectionHeader
        title="复习要点"
        desc="按阅读版块沉淀核心方法、易错点与答题模板，二轮复习随取随用。"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImpOpen(true)}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} />添加要点</Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {['全部', ...READ_SECTIONS].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`btn-pill px-3.5 py-1.5 text-[13px] font-medium transition ${filter === s ? 'brand-gradient text-white' : 'border border-black/[0.08] bg-white text-ink-secondary hover:text-ink'}`}>
            {s}
          </button>
        ))}
      </div>

      {list.length === 0 ? <Empty icon={ScrollText} text="该版块暂无复习要点" desc="点击右上角添加，或批量导入已有整理稿。" /> : (
        <div className="card divide-y divide-black/5">
          {list.map(r => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{r.section}</Badge>
                  {r.date && <span className="text-[11px] text-ink-secondary">{r.date}</span>}
                </div>
                <div className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{r.content}</div>
                {r.note && <div className="mt-1 text-xs text-ink-secondary">备注：{r.note}</div>}
              </div>
              <button onClick={() => remove(r.id)} className="btn-pill shrink-0 p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="添加复习要点">
        <form onSubmit={add} className="space-y-4">
          <Field label="版块">
            <select className={inputCls} value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}>
              {READ_SECTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="复习要点">
            <textarea className={inputCls} rows={4} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="核心方法 / 易错 / 模板" required />
          </Field>
          <Field label="备注">
            <input className={inputCls} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="可选" />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>添加</Button>
          </div>
        </form>
      </Modal>

      <ImportDialog
        open={impOpen} onClose={() => setImpOpen(false)}
        title="复习要点 · 批量导入" mod="points" onDone={load}
        example={'每行一条，可用 | 或空格分隔：\n版块(信息类阅读/散文阅读/小说阅读/文言文阅读/古诗阅读/语言文字运用) 要点内容 备注\n例：小说阅读 人物形象题抓细节与变化 二轮'}
        parse={(lines) => lines.map(ln => {
          const p = splitFields(ln);
          const isSec = READ_SECTIONS.includes(p[0]);
          return { section: isSec ? p[0] : READ_SECTIONS[0], content: isSec ? (p[1] || '') : (p[0] || ''), note: isSec ? (p[2] || '') : (p[1] || '') };
        }).filter(r => r.content)}
      />
    </div>
  );
}
