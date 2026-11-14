import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload, GraduationCap, BookOpen } from 'lucide-react';
import { api } from '../../api.js';
import { SectionHeader, Button, Field, inputCls, Badge, Empty, Modal } from '../../components/ui.jsx';
import ImportDialog from '../../components/ImportDialog.jsx';
import { splitFields } from '../../lib/docx.js';
import { EXAM_SECTIONS, VOLUMES } from './shared.js';

const YEAR = new Date().getFullYear();

export default function ExamPrep() {
  const [exams, setExams] = useState([]);
  const [texts, setTexts] = useState([]);
  const [secFilter, setSecFilter] = useState('全部');
  const [volFilter, setVolFilter] = useState('全部');
  const [exOpen, setExOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [impMod, setImpMod] = useState('');
  const [exForm, setExForm] = useState({ section: EXAM_SECTIONS[0], year: YEAR, title: '', q: '', a: '' });
  const [txForm, setTxForm] = useState({ volume: VOLUMES[0], piece: '', q: '', a: '' });
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.get('/cp/exams'), api.get('/cp/texts')])
    .then(([e, t]) => { setExams(e); setTexts(t); }).catch(console.error);
  useEffect(() => { load(); }, []);

  const exList = secFilter === '全部' ? exams : exams.filter(e => e.section === secFilter);
  const txList = volFilter === '全部' ? texts : texts.filter(t => t.volume === volFilter);

  const addEx = async (e) => {
    e.preventDefault();
    if (!exForm.title.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/exams', exForm);
      setExOpen(false);
      setExForm({ section: EXAM_SECTIONS[0], year: YEAR, title: '', q: '', a: '' });
      load();
    } finally { setBusy(false); }
  };

  const addTx = async (e) => {
    e.preventDefault();
    if (!txForm.q.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/texts', txForm);
      setTxOpen(false);
      setTxForm({ volume: VOLUMES[0], piece: '', q: '', a: '' });
      load();
    } finally { setBusy(false); }
  };

  const removeEx = async (id) => { if (!confirm('确认删除该真题？')) return; await api.del(`/cp/exams/${id}`); load(); };
  const removeTx = async (id) => { if (!confirm('确认删除该原创题？')) return; await api.del(`/cp/texts/${id}`); load(); };

  const dialogs = {
    exams: {
      title: '高考真题 · 批量导入', mod: 'exams',
      example: `每行一条，可用 | 或空格分隔：\n版块 年份 题名 题干材料 答案/解析\n例：文言文阅读 ${YEAR - 1} 全国甲卷断句题 材料… 答案…`,
      parse: (lines) => lines.map(ln => {
        const p = splitFields(ln);
        const isSec = EXAM_SECTIONS.includes(p[0]);
        const base = isSec ? 1 : 0;
        return {
          section: isSec ? p[0] : EXAM_SECTIONS[0],
          year: Number(p[base]) || YEAR,
          title: p[base + 1] || '',
          q: p[base + 2] || '', a: p[base + 3] || '',
        };
      }).filter(r => r.title),
    },
    texts: {
      title: '课本原创题 · 批量导入', mod: 'texts',
      example: '每行一条，可用 | 或空格分隔：\n册(必修 上/必修 下/选必 上/选必 中/选必 下) 篇目 原创题目 答案/解析\n例：必修 上 劝学 结合文本分析比喻论证 答案…',
      parse: (lines) => lines.map(ln => {
        const p = splitFields(ln);
        const isVol = VOLUMES.includes(p[0]);
        const base = isVol ? 1 : 0;
        return {
          volume: isVol ? p[0] : VOLUMES[0],
          piece: p[base] || '', q: p[base + 1] || '', a: p[base + 2] || '',
        };
      }).filter(r => r.q),
    },
  };

  return (
    <div>
      <SectionHeader
        title="高考备考"
        desc="近五年真题按版块分类汇编；五册课本原创题目随文沉淀，复习直接调取。"
        action={<Button variant="secondary" onClick={() => setImpMod('exams')}><Upload size={15} />导入真题</Button>}
      />

      {/* 真题 */}
      <div className="card mb-4 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <GraduationCap size={17} className="text-[#0071e3]" />
          <h3 className="text-[15px] font-semibold text-ink">近五年高考真题分类汇编</h3>
          <Badge tone="blue">{exams.length} 道</Badge>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setImpMod('exams')}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setExOpen(true)}><Plus size={16} />添加真题</Button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {['全部', ...EXAM_SECTIONS].map(s => (
            <button key={s} onClick={() => setSecFilter(s)}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${secFilter === s ? 'brand-gradient text-white' : 'border border-black/[0.08] bg-white text-ink-secondary hover:text-ink'}`}>{s}</button>
          ))}
        </div>
        {exList.length === 0 ? <p className="py-3 text-sm text-ink-secondary">该版块暂无真题。</p> : (
          <div className="divide-y divide-black/5">
            {exList.map(r => (
              <div key={r.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{r.title}</span>
                    <Badge tone="blue">{r.section}</Badge>
                    {r.year && <span className="num text-[11px] text-ink-secondary">{r.year}</span>}
                  </div>
                  {r.q && <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">题干：{r.q}</div>}
                  {r.a && <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">答案：{r.a}</div>}
                </div>
                <button onClick={() => removeEx(r.id)} className="btn-pill shrink-0 p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 原创题 */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <BookOpen size={17} className="text-[#af52de]" />
          <h3 className="text-[15px] font-semibold text-ink">五册课本原创题目</h3>
          <Badge tone="purple">{texts.length} 道</Badge>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setImpMod('texts')}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setTxOpen(true)}><Plus size={16} />添加原创题</Button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {['全部', ...VOLUMES].map(v => (
            <button key={v} onClick={() => setVolFilter(v)}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${volFilter === v ? 'brand-gradient text-white' : 'border border-black/[0.08] bg-white text-ink-secondary hover:text-ink'}`}>{v}</button>
          ))}
        </div>
        {txList.length === 0 ? <Empty icon={BookOpen} text="本册暂无原创题目" desc="点击右上角添加，按课文沉淀原创设问。" /> : (
          <div className="divide-y divide-black/5">
            {txList.map(r => (
              <div key={r.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.piece && <span className="text-sm font-medium text-ink">{r.piece}</span>}
                    <Badge tone="purple">{r.volume}</Badge>
                  </div>
                  {r.q && <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">题目：{r.q}</div>}
                  {r.a && <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">答案：{r.a}</div>}
                </div>
                <button onClick={() => removeTx(r.id)} className="btn-pill shrink-0 p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={exOpen} onClose={() => setExOpen(false)} title="添加高考真题">
        <form onSubmit={addEx} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="版块">
              <select className={inputCls} value={exForm.section} onChange={e => setExForm({ ...exForm, section: e.target.value })}>
                {EXAM_SECTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="年份">
              <input type="number" className={inputCls} value={exForm.year} onChange={e => setExForm({ ...exForm, year: e.target.value })} />
            </Field>
          </div>
          <Field label="题名">
            <input className={inputCls} value={exForm.title} onChange={e => setExForm({ ...exForm, title: e.target.value })} placeholder="如：2025 全国甲卷 文言文断句" required />
          </Field>
          <Field label="题干材料">
            <textarea className={inputCls} rows={3} value={exForm.q} onChange={e => setExForm({ ...exForm, q: e.target.value })} />
          </Field>
          <Field label="答案 / 解析">
            <textarea className={inputCls} rows={3} value={exForm.a} onChange={e => setExForm({ ...exForm, a: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setExOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>添加</Button>
          </div>
        </form>
      </Modal>

      <Modal open={txOpen} onClose={() => setTxOpen(false)} title="添加课本原创题">
        <form onSubmit={addTx} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="册">
              <select className={inputCls} value={txForm.volume} onChange={e => setTxForm({ ...txForm, volume: e.target.value })}>
                {VOLUMES.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="篇目">
              <input className={inputCls} value={txForm.piece} onChange={e => setTxForm({ ...txForm, piece: e.target.value })} placeholder="如：劝学" />
            </Field>
          </div>
          <Field label="原创题目">
            <textarea className={inputCls} rows={3} value={txForm.q} onChange={e => setTxForm({ ...txForm, q: e.target.value })} required />
          </Field>
          <Field label="答案 / 解析">
            <textarea className={inputCls} rows={3} value={txForm.a} onChange={e => setTxForm({ ...txForm, a: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setTxOpen(false)}>取消</Button>
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
