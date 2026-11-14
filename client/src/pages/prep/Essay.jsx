import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Upload, PenTool, Library } from 'lucide-react';
import { api } from '../../api.js';
import { SectionHeader, Button, Field, inputCls, Badge, Empty, Modal } from '../../components/ui.jsx';
import ImportDialog from '../../components/ImportDialog.jsx';
import { splitFields } from '../../lib/docx.js';
import { MAT_TYPES, todayStr } from './shared.js';

const typeTone = { 课本素材: 'blue', 时事焦点: 'green', 哲学思想素材: 'purple' };

export default function Essay() {
  const [materials, setMaterials] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [filter, setFilter] = useState('全部');
  const [matOpen, setMatOpen] = useState(false);
  const [trOpen, setTrOpen] = useState(false);
  const [impMod, setImpMod] = useState('');
  const [matForm, setMatForm] = useState({ type: '课本素材', content: '', theme: '' });
  const [trForm, setTrForm] = useState({ name: '', target: '', fanwen: '', date: todayStr() });
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([
    api.get('/cp/materials'), api.get('/cp/trainings'),
  ]).then(([m, t]) => { setMaterials(m); setTrainings(t); }).catch(console.error);
  useEffect(() => { load(); }, []);

  const list = filter === '全部' ? materials : materials.filter(m => m.type === filter);
  const filtered = useMemo(() => list.slice(), [list]);

  const addMat = async (e) => {
    e.preventDefault();
    if (!matForm.content.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/materials', matForm);
      setMatOpen(false);
      setMatForm({ type: '课本素材', content: '', theme: '' });
      load();
    } finally { setBusy(false); }
  };

  const addTr = async (e) => {
    e.preventDefault();
    if (!trForm.name.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/trainings', trForm);
      setTrOpen(false);
      setTrForm({ name: '', target: '', fanwen: '', date: todayStr() });
      load();
    } finally { setBusy(false); }
  };

  const removeMat = async (id) => { if (!confirm('确认删除该素材？')) return; await api.del(`/cp/materials/${id}`); load(); };
  const removeTr = async (id) => { if (!confirm('确认删除该训练题目？')) return; await api.del(`/cp/trainings/${id}`); load(); };

  const dialogs = {
    materials: {
      title: '作文素材库 · 批量导入', mod: 'materials',
      example: '每行一条，可用 | 或空格分隔：\n类型(课本素材/时事焦点/哲学思想素材) 素材内容 适用主题\n例：时事焦点 航天团队彰显家国情怀 家国·奋斗',
      parse: (lines) => lines.map(ln => {
        const p = splitFields(ln);
        const isType = MAT_TYPES.includes(p[0]);
        return { type: isType ? p[0] : '课本素材', content: isType ? (p[1] || '') : (p[0] || ''), theme: isType ? (p[2] || '') : (p[1] || '') };
      }).filter(r => r.content),
    },
    trainings: {
      title: '作文训练 · 批量导入', mod: 'trainings',
      example: '每行一条，可用 | 或空格分隔：\n训练题目 对象/班 解析范文 日期(YYYY-MM-DD)\n例：一模作文 13班 以问与答展开思辨 2026-09-10',
      parse: (lines) => lines.map(ln => {
        const p = splitFields(ln);
        return { name: p[0], target: p[1] || '', fanwen: p[2] || '', date: /^\d{4}-\d{2}-\d{2}$/.test(p[3] || '') ? p[3] : todayStr() };
      }).filter(r => r.name),
    },
  };

  return (
    <div>
      <SectionHeader
        title="作文素材与训练"
        desc="按课本 / 时事 / 哲学思想分类积累素材，沉淀每次训练的题目、对象与解析范文。"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImpMod('materials')}><Upload size={15} />导入素材</Button>
            <Button onClick={() => setMatOpen(true)}><Plus size={16} />添加素材</Button>
          </div>
        }
      />

      {/* 素材库 */}
      <div className="card mb-4 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Library size={17} className="text-[#0071e3]" />
          <h3 className="text-[15px] font-semibold text-ink">作文素材库</h3>
          <Badge tone="blue">{materials.length} 条</Badge>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {['全部', ...MAT_TYPES].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`btn-pill px-3.5 py-1.5 text-[13px] font-medium transition ${filter === t ? 'brand-gradient text-white' : 'border border-black/[0.08] bg-white text-ink-secondary hover:text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? <p className="py-4 text-sm text-ink-secondary">暂无素材，先添加或批量导入。</p> : (
          <div className="divide-y divide-black/5">
            {filtered.map(m => (
              <div key={m.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{m.content}</span>
                    <Badge tone={typeTone[m.type] || 'gray'}>{m.type}</Badge>
                  </div>
                  {m.theme && <div className="mt-1 text-xs text-ink-secondary">适用主题：{m.theme}</div>}
                </div>
                <button onClick={() => removeMat(m.id)} className="btn-pill shrink-0 p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 训练题目 */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PenTool size={17} className="text-[#af52de]" />
          <h3 className="text-[15px] font-semibold text-ink">训练题目和解析范文</h3>
          <Badge tone="purple">{trainings.length} 组</Badge>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setImpMod('trainings')}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setTrOpen(true)}><Plus size={16} />添加训练</Button>
          </div>
        </div>
        {trainings.length === 0 ? <Empty icon={PenTool} text="暂无训练题目与范文" desc="添加一条训练题目，并沉淀解析范文。" /> : (
          <div className="divide-y divide-black/5">
            {trainings.map(t => (
              <div key={t.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{t.name}</span>
                    {t.target && <Badge tone="blue">{t.target}</Badge>}
                    {t.date && <span className="text-[11px] text-ink-secondary">{t.date}</span>}
                  </div>
                  {t.fanwen && <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">解析范文：{t.fanwen}</div>}
                </div>
                <button onClick={() => removeTr(t.id)} className="btn-pill shrink-0 p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={matOpen} onClose={() => setMatOpen(false)} title="添加作文素材">
        <form onSubmit={addMat} className="space-y-4">
          <Field label="类型">
            <select className={inputCls} value={matForm.type} onChange={e => setMatForm({ ...matForm, type: e.target.value })}>
              {MAT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="素材内容">
            <textarea className={inputCls} rows={3} value={matForm.content} onChange={e => setMatForm({ ...matForm, content: e.target.value })} placeholder="名言 / 事例 / 观点" required />
          </Field>
          <Field label="适用主题">
            <input className={inputCls} value={matForm.theme} onChange={e => setMatForm({ ...matForm, theme: e.target.value })} placeholder="如：逆境·志向" />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setMatOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>添加</Button>
          </div>
        </form>
      </Modal>

      <Modal open={trOpen} onClose={() => setTrOpen(false)} title="添加训练题目">
        <form onSubmit={addTr} className="space-y-4">
          <Field label="训练题目">
            <input className={inputCls} value={trForm.name} onChange={e => setTrForm({ ...trForm, name: e.target.value })} placeholder="如：一模作文" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="对象 / 班级">
              <input className={inputCls} value={trForm.target} onChange={e => setTrForm({ ...trForm, target: e.target.value })} placeholder="如：13班" />
            </Field>
            <Field label="日期">
              <input type="date" className={inputCls} value={trForm.date} onChange={e => setTrForm({ ...trForm, date: e.target.value })} />
            </Field>
          </div>
          <Field label="解析范文">
            <textarea className={inputCls} rows={6} value={trForm.fanwen} onChange={e => setTrForm({ ...trForm, fanwen: e.target.value })} placeholder="范文或解析要点" />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setTrOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>添加</Button>
          </div>
        </form>
      </Modal>

      <ImportDialog
        open={!!impMod} onClose={() => setImpMod('')}
        title={dialogs[impMod]?.title} example={dialogs[impMod]?.example}
        mod={dialogs[impMod]?.mod} parse={dialogs[impMod]?.parse} onDone={load}
      />
    </div>
  );
}
