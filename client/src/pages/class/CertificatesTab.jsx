import { useEffect, useState } from 'react';
import { Plus, Trash2, Printer, ScrollText, Check } from 'lucide-react';
import { api, todayStr } from '../../api.js';
import { Button, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const AWARDS = ['三好学生', '学习进步之星', '优秀班干部', '劳动小能手', '文明礼仪之星', '阅读小达人', '守纪标兵', '运动会优胜奖', '期末优秀学员'];

/** 电子奖状：选学生 + 填奖项与理由，即出可打印的奖状 */
export default function CertificatesTab({ classId }) {
  const [data, setData] = useState(null); // { certificates, students }
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [form, setForm] = useState({ title: '', reason: '', issuer: '', awarded_at: todayStr() });
  const [printCert, setPrintCert] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api.get(`/classes/${classId}/certificates`).then(setData);
  useEffect(() => { load(); }, [classId]);

  /* 待打印的奖状挂到页面后由浏览器打印，打印结束即卸载 */
  useEffect(() => {
    if (!printCert) return undefined;
    const t = setTimeout(() => { window.print(); setPrintCert(null); }, 80);
    return () => clearTimeout(t);
  }, [printCert]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const toggle = (sid) => {
    const next = new Set(picked);
    next.has(sid) ? next.delete(sid) : next.add(sid);
    setPicked(next);
  };

  const award = async () => {
    if (!picked.size || !form.title.trim()) return;
    setErr('');
    try {
      await api.post(`/classes/${classId}/certificates`, { ...form, student_ids: [...picked] });
      setOpen(false);
      setPicked(new Set());
      setForm({ title: '', reason: '', issuer: '', awarded_at: todayStr() });
      await load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setErr(''); setOpen(true); }}><Plus size={15} />颁发奖状</Button>
      </div>

      {data.certificates.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.certificates.map(c => (
            <div key={c.id} className="card group p-2">
              <div className="relative overflow-hidden rounded-2xl border-2 border-[#c9a227]/35 bg-[linear-gradient(160deg,#fffdf3,#ffffff_60%)] px-6 py-7 text-center">
                <div className="absolute inset-2 rounded-xl border border-[#c9a227]/20" />
                <div className="relative">
                  <div className="text-[10px] tracking-[0.35em] text-[#a9861e]">CERTIFICATE</div>
                  <div className="mt-1 text-2xl font-bold tracking-[0.3em] text-[#8a6d12]">奖 状</div>
                  <div className="mt-4 text-sm">
                    <span className="border-b border-[#8a6d12]/40 px-2 pb-0.5 text-base font-semibold">{c.student_name}</span>
                    <span className="ml-1">同学：</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-ink">
                    在 <span className="font-semibold text-[#8a6d12]">{c.title}</span> 中表现突出
                    {c.reason ? `，${c.reason}` : ''}。
                  </p>
                  <p className="mt-1.5 text-sm text-ink-secondary">特发此状，以资鼓励。</p>
                  <div className="mt-5 flex items-end justify-between text-xs text-ink-secondary">
                    <span>{c.issuer || '\u00A0'}</span>
                    <span className="tabular-nums">{c.awarded_at}</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-1 px-1 pt-2">
                <button onClick={() => setPrintCert(c)}
                  className="btn-pill inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-[#0071e3]/10 hover:text-[#0071e3]" title="打印奖状">
                  <Printer size={13} />打印
                </button>
                <button onClick={async () => { await api.del(`/certificates/${c.id}`); load(); }}
                  className="btn-pill p-1.5 text-ink-secondary opacity-60 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={ScrollText} text="还没有奖状" desc="填奖项与获奖理由，一次可为多位学生颁发" />
      )}

      {/* 颁发弹窗 */}
      <Modal open={open} onClose={() => setOpen(false)} title="颁发奖状" width="max-w-xl">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-ink-secondary">获奖学生（可多选）</span>
              <button className="text-xs text-[#0071e3] hover:underline"
                onClick={() => setPicked(picked.size === data.students.length ? new Set() : new Set(data.students.map(s => s.id)))}>
                {picked.size === data.students.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl bg-bg-light p-3">
              {data.students.map(s => {
                const on = picked.has(s.id);
                return (
                  <button key={s.id} onClick={() => toggle(s.id)}
                    className={`btn-pill inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition ${
                      on ? 'bg-[#0071e3] text-white shadow' : 'bg-white text-ink-secondary hover:bg-black/[0.04]'
                    }`}>
                    {on && <Check size={12} />}{s.name}
                  </button>
                );
              })}
              {!data.students.length && <span className="p-2 text-xs text-ink-secondary">班级暂无学生</span>}
            </div>
          </div>
          <Field label="奖项名称">
            <input className={inputCls} list="award-presets" placeholder="如：学习进步之星"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <datalist id="award-presets">
              {AWARDS.map(a => <option key={a} value={a} />)}
            </datalist>
          </Field>
          <Field label="获奖理由">
            <textarea className={`${inputCls} min-h-[90px] resize-y`} placeholder="如：本学期数学成绩稳步提升，课堂发言积极"
              value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="落款（班级 / 班主任）">
              <input className={inputCls} placeholder="如：三年级(2)班 班主任" value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })} />
            </Field>
            <Field label="颁发日期">
              <input type="date" className={inputCls} value={form.awarded_at} onChange={e => setForm({ ...form, awarded_at: e.target.value })} />
            </Field>
          </div>
          {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
          <Button className="w-full justify-center" onClick={award} disabled={!picked.size || !form.title.trim()}>
            颁发给 {picked.size} 位学生
          </Button>
        </div>
      </Modal>

      {/* 打印版奖状：isPrint 时只输出这一张 */}
      {printCert && (
        <div className="print-only">
          <div className="print-sheet" style={{
            border: '5pt double #b8962e', padding: '40pt 56pt', textAlign: 'center',
            minHeight: '660pt', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ fontSize: '10pt', letterSpacing: '6pt', color: '#8a6d12' }}>CERTIFICATE OF HONOR</div>
            <div style={{ fontSize: '34pt', fontWeight: 700, letterSpacing: '14pt', margin: '12pt 0 22pt', color: '#8a6d12' }}>奖 状</div>
            <div style={{ fontSize: '14pt', marginBottom: '10pt' }}>
              <span style={{ fontWeight: 700, borderBottom: '1pt solid #333', padding: '0 8pt' }}>{printCert.student_name}</span>
              <span style={{ marginLeft: '4pt' }}>同学：</span>
            </div>
            <p style={{ fontSize: '13pt', lineHeight: 2, margin: 0 }}>
              在 <b>{printCert.title}</b> 中表现突出{printCert.reason ? `，${printCert.reason}` : ''}。
            </p>
            <p style={{ fontSize: '13pt', lineHeight: 2, margin: '6pt 0 0' }}>特发此状，以资鼓励。</p>
            <div style={{ marginTop: '46pt', fontSize: '12pt', lineHeight: 2, textAlign: 'right', paddingRight: '12pt' }}>
              <div>{printCert.issuer || '\u00A0'}</div>
              <div>{printCert.awarded_at}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
