import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Upload, ClipboardCheck, Users } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Field, inputCls, Badge, Empty, Modal } from '../components/ui.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import { splitFields } from '../lib/docx.js';
import { todayStr, groupByClass } from './prep/shared.js';

export default function HomeworkLog() {
  const [logs, setLogs] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [open, setOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [form, setForm] = useState({ name: '', class_id: '', date: todayStr(), should_count: '', done_count: '', absent_names: '' });
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.get('/cp/homework'), api.get('/classes'), api.get('/cp/students')])
    .then(([l, c, s]) => { setLogs(l); setClasses(c); setStudents(s); }).catch(console.error);
  useEffect(() => { load(); }, []);

  const byClass = useMemo(() => {
    const map = {};
    logs.forEach(l => {
      const key = l.class_id || 'unsorted';
      const o = map[key] = map[key] || { label: l.class_name || '未分班', should: 0, done: 0, times: 0 };
      o.should += l.should_count || 0;
      o.done += l.done_count || 0;
      o.times += 1;
    });
    return Object.entries(map).map(([key, v]) => ({ key, ...v, rate: v.should ? Math.round(v.done / v.should * 100) : 0 }));
  }, [logs]);

  const absentGroups = useMemo(
    () => groupByClass(students, logs, { names: r => r.absent_names, classOf: r => r.class_id }),
    [students, logs]
  );

  const pickClass = (cid) => {
    const n = students.filter(s => String(s.class_id) === String(cid)).length;
    setForm(f => ({ ...f, class_id: cid, should_count: cid ? n : f.should_count }));
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/homework', { ...form, class_id: form.class_id || null });
      setOpen(false);
      setForm({ name: '', class_id: '', date: todayStr(), should_count: '', done_count: '', absent_names: '' });
      load();
    } finally { setBusy(false); }
  };

  const remove = async (id) => { if (!confirm('确认删除该作业登记？')) return; await api.del(`/cp/homework/${id}`); load(); };

  return (
    <div>
      <SectionHeader
        title="作业登记"
        desc="按班级登记应交 / 实交 / 未交学生，自动汇总提交率与未交名单。班级与学生来自「班级成员」。"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImpOpen(true)}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} />登记作业</Button>
          </div>
        }
      />

      <div className="card mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardCheck size={17} className="text-[#0071e3]" />
          <h3 className="text-[15px] font-semibold text-ink">分班提交情况</h3>
        </div>
        {byClass.length === 0 ? <p className="text-sm text-ink-secondary">暂无登记记录</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-secondary">
                  <th className="pb-2 font-medium">班级</th>
                  <th className="pb-2 font-medium">登记次数</th>
                  <th className="pb-2 font-medium">应交</th>
                  <th className="pb-2 font-medium">实交</th>
                  <th className="pb-2 font-medium">提交率</th>
                </tr>
              </thead>
              <tbody>
                {byClass.map(c => (
                  <tr key={c.key} className="border-t border-black/5">
                    <td className="py-2.5 font-medium text-ink">{c.label}</td>
                    <td className="num py-2.5 text-ink-secondary">{c.times}</td>
                    <td className="num py-2.5 text-ink-secondary">{c.should}</td>
                    <td className="num py-2.5 text-ink-secondary">{c.done}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-black/[0.05]">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#0071e3] to-[#5ac8fa]" style={{ width: `${c.rate}%` }} />
                        </div>
                        <span className="num text-xs text-ink-secondary">{c.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mb-4 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users size={17} className="text-[#ff3b30]" />
          <h3 className="text-[15px] font-semibold text-ink">未交作业学生名单（按班）</h3>
        </div>
        {absentGroups.length === 0 ? <p className="text-sm text-ink-secondary">暂无未交记录</p> : (
          <div className="space-y-3">
            {absentGroups.map(g => (
              <div key={g.key}>
                <div className="mb-1.5 text-[13px] font-medium text-ink">{g.label}
                  <span className="ml-1 text-[11px] font-normal text-ink-secondary">（{g.total} 人次）</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map(it => (
                    <span key={it.name} className="rounded-full bg-[#ff3b30]/[0.07] px-2.5 py-1 text-xs font-medium text-[#b3251c] ring-1 ring-inset ring-[#ff3b30]/15">
                      {it.name} ×{it.count} 次
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="mb-2 text-[13px] font-semibold text-ink-secondary">登记记录</h3>
      {logs.length === 0 ? <Empty icon={ClipboardCheck} text="暂无作业登记" desc="点击右上角登记一次作业提交情况。" /> : (
        <div className="card divide-y divide-black/5">
          {logs.map(l => (
            <div key={l.id} className="flex items-start gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{l.name}</span>
                  <Badge tone="blue">{l.class_name || '未分班'}</Badge>
                  <span className="text-[11px] text-ink-secondary">{l.date}</span>
                </div>
                <div className="num mt-1 text-xs text-ink-secondary">应交 {l.should_count} · 实交 {l.done_count} · 未交 {Math.max(0, l.should_count - l.done_count)}</div>
                {l.absent_names && <div className="mt-0.5 text-xs text-ink-secondary">未交：{l.absent_names}</div>}
              </div>
              <button onClick={() => remove(l.id)} className="btn-pill shrink-0 p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="登记作业">
        <form onSubmit={add} className="space-y-4">
          <Field label="作业名">
            <input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：文言文实词整理" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="班级">
              <select className={inputCls} value={form.class_id} onChange={e => pickClass(e.target.value)}>
                <option value="">未分班</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="日期">
              <input type="date" className={inputCls} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="应交数">
              <input type="number" min="0" className={inputCls} value={form.should_count} onChange={e => setForm({ ...form, should_count: e.target.value })} />
            </Field>
            <Field label="实交数">
              <input type="number" min="0" className={inputCls} value={form.done_count} onChange={e => setForm({ ...form, done_count: e.target.value })} />
            </Field>
          </div>
          <Field label="未交学生（顿号分隔）">
            <input className={inputCls} value={form.absent_names} onChange={e => setForm({ ...form, absent_names: e.target.value })} placeholder="如：张伟、李响" />
          </Field>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>保存</Button>
          </div>
        </form>
      </Modal>

      <ImportDialog
        open={impOpen} onClose={() => setImpOpen(false)}
        title="作业登记 · 批量导入" mod="homework" onDone={load}
        example={'每行一条，可用 | 或空格分隔：\n作业名 班级 日期(YYYY-MM-DD) 应交数 实交数 未交学生(顿号分隔)\n例：文言实词整理 13班 2026-09-10 45 42 张伟、李响'}
        parse={(lines) => lines.map(ln => {
          const p = splitFields(ln);
          const c = classes.find(x => x.name === (p[1] || '').trim());
          return {
            name: p[0], class_id: c?.id || '',
            date: /^\d{4}-\d{2}-\d{2}$/.test(p[2] || '') ? p[2] : todayStr(),
            should_count: Number(p[3]) || 0, done_count: Number(p[4]) || 0,
            absent_names: p[5] || '',
          };
        }).filter(r => r.name)}
      />
    </div>
  );
}
