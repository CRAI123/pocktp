import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Upload, BookMarked, Users } from 'lucide-react';
import { api } from '../../api.js';
import { SectionHeader, Button, Field, inputCls, Badge, Empty, Modal } from '../../components/ui.jsx';
import ImportDialog from '../../components/ImportDialog.jsx';
import { splitFields } from '../../lib/docx.js';
import { POEM_STATUS, poemTone, groupByClass, splitNames } from './shared.js';

const FILTERS = ['全部', ...POEM_STATUS];

export default function Recite() {
  const [poems, setPoems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState('全部');
  const [open, setOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [form, setForm] = useState({ title: '', author: '', status: '未查', class_id: '', unmem: '' });
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([
    api.get('/cp/poems'),
    api.get('/classes'),
    api.get('/cp/students'),
  ]).then(([p, c, s]) => { setPoems(p); setClasses(c); setStudents(s); }).catch(console.error);

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const pass = poems.filter(p => p.status === '默写过关').length;
    const rec = poems.filter(p => p.status === '背诵').length;
    const un = poems.filter(p => !p.status || p.status === '未查').length;
    return { total: poems.length, pass, rec, un, rate: poems.length ? Math.round(pass / poems.length * 100) : 0 };
  }, [poems]);

  const groups = useMemo(
    () => groupByClass(students, poems, { names: r => r.unmem, classOf: r => r.class_id }),
    [students, poems]
  );

  const list = filter === '全部' ? poems : poems.filter(p => p.status === filter);
  const classIdByName = (name) => classes.find(c => c.name === String(name || '').trim())?.id || '';

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/poems', { ...form, class_id: form.class_id || null });
      setOpen(false);
      setForm({ title: '', author: '', status: '未查', class_id: '', unmem: '' });
      load();
    } finally { setBusy(false); }
  };

  const patch = async (id, body) => { await api.patch(`/cp/poems/${id}`, body); load(); };
  const remove = async (id) => { if (!confirm('确认删除该篇目？')) return; await api.del(`/cp/poems/${id}`); load(); };

  const parseImport = (lines) => lines.map(ln => {
    const p = splitFields(ln);
    return {
      title: p[0], author: p[1] || '',
      status: POEM_STATUS.includes(p[2]) ? p[2] : '未查',
      unmem: p[3] || '',
      class_id: classIdByName(p[4]),
    };
  }).filter(r => r.title);

  return (
    <div>
      <SectionHeader
        title="古诗文必背检查"
        desc="按篇目登记背诵 / 默写过关情况，未背过名单按班级自动汇总。班级与学生来自「班级成员」。"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImpOpen(true)}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} />添加篇目</Button>
          </div>
        }
      />

      {/* 统计 */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card flex items-center gap-4 p-5">
          <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(#0071e3 ${stats.rate}%, rgba(0,0,0,0.06) 0)` }}>
            <div className="grid h-[60px] w-[60px] place-items-center rounded-full bg-white">
              <span className="num text-[15px] font-semibold text-ink">{stats.rate}%</span>
            </div>
          </div>
          <div>
            <div className="eyebrow">过关率</div>
            <div className="mt-1 text-[13px] text-ink-secondary">共 {stats.total} 篇必背篇目</div>
          </div>
        </div>
        <div className="card p-5"><div className="eyebrow">默写过关</div><div className="num mt-2 text-[26px] font-semibold text-[#1a7f2b]">{stats.pass}</div></div>
        <div className="card p-5"><div className="eyebrow">背诵中</div><div className="num mt-2 text-[26px] font-semibold text-[#a85300]">{stats.rec}</div></div>
        <div className="card p-5"><div className="eyebrow">未查</div><div className="num mt-2 text-[26px] font-semibold text-ink">{stats.un}</div></div>
      </div>

      {/* 未背过名单 */}
      <div className="card mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users size={17} className="text-[#0071e3]" />
          <h3 className="text-[15px] font-semibold text-ink">未背过学生名单（按班）</h3>
        </div>
        {groups.length ? (
          <div className="space-y-3">
            {groups.map(g => (
              <div key={g.key}>
                <div className="mb-1.5 text-[13px] font-medium text-ink">{g.label}
                  <span className="ml-1 text-[11px] font-normal text-ink-secondary">（{g.total} 人次）</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map(it => (
                    <span key={it.name} className="rounded-full bg-[#ff3b30]/[0.07] px-2.5 py-1 text-xs font-medium text-[#b3251c] ring-1 ring-inset ring-[#ff3b30]/15">
                      {it.name} ×{it.count} 篇
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-ink-secondary">暂无未背过记录，继续保持。</p>}
      </div>

      {/* 筛选 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn-pill px-3.5 py-1.5 text-[13px] font-medium transition ${filter === f ? 'brand-gradient text-white' : 'border border-black/[0.08] bg-white text-ink-secondary hover:text-ink'}`}>
            {f}
          </button>
        ))}
      </div>

      {list.length === 0 ? <Empty icon={BookMarked} text="该状态下暂无篇目" desc="点击右上角添加篇目，或使用批量导入快速录入。" /> : (
        <div className="card divide-y divide-black/5">
          {list.map(p => {
            const un = splitNames(p.unmem);
            return (
              <div key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{p.title}</span>
                  {p.author && <span className="text-xs text-ink-secondary">{p.author}</span>}
                  <Badge tone={poemTone[p.status]}>{p.status}</Badge>
                  {un.length > 0 && <Badge tone="red">未背过 {un.length} 人</Badge>}
                  <button onClick={() => remove(p.id)} className="btn-pill ml-auto p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]">
                    <Trash2 size={15} />
                  </button>
                </div>
                {un.length > 0 && <div className="mt-1.5 text-xs text-ink-secondary">未背过：{un.join('、')}</div>}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select className={`${inputCls} w-auto py-1.5 text-xs`} value={p.status}
                    onChange={e => patch(p.id, { status: e.target.value })}>
                    {POEM_STATUS.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <select className={`${inputCls} w-auto py-1.5 text-xs`} value={p.class_id || ''}
                    onChange={e => patch(p.id, { class_id: e.target.value || null })}>
                    <option value="">未分班</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input className={`${inputCls} min-w-[180px] flex-1 py-1.5 text-xs`} defaultValue={p.unmem}
                    placeholder="未背过学生，顿号分隔"
                    onBlur={e => { if (e.target.value !== p.unmem) patch(p.id, { unmem: e.target.value }); }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="添加篇目">
        <form onSubmit={add} className="space-y-4">
          <Field label="篇目">
            <input className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：劝学" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="作者">
              <input className={inputCls} value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} placeholder="如：荀子" />
            </Field>
            <Field label="状态">
              <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {POEM_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="未背过班级">
              <select className={inputCls} value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })}>
                <option value="">未分班</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="未背过学生（顿号分隔）">
              <input className={inputCls} value={form.unmem} onChange={e => setForm({ ...form, unmem: e.target.value })} placeholder="如：张伟、李响" />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>添加</Button>
          </div>
        </form>
      </Modal>

      <ImportDialog
        open={impOpen} onClose={() => setImpOpen(false)}
        title="古诗文 · 批量导入" mod="poems" parse={parseImport} onDone={load}
        example={'每行一条，可用 | 或空格分隔，缺项可跳过：\n篇目 作者 状态(未查/背诵/默写过关) 未背过学生(顿号分隔) 班级\n例：劝学 荀子 背诵 张伟、李响 13班\n离骚 屈原 默写过关'}
      />
    </div>
  );
}
