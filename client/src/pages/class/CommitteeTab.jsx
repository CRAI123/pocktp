import { useEffect, useState } from 'react';
import { Plus, Trash2, Award } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const ROLES = ['班长', '副班长', '学习委员', '纪律委员', '卫生委员', '体育委员', '文艺委员', '生活委员', '宣传委员', '电教委员', '课代表', '小组长'];

/** 班委名单：职务 + 职责 + 学生 */
export default function CommitteeTab({ classId }) {
  const [data, setData] = useState(null); // { committees, students }
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: '', role: '班长', duty: '' });

  const load = () => api.get(`/classes/${classId}/committees`).then(setData);
  useEffect(() => { load(); }, [classId]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const add = async () => {
    if (!form.student_id) return;
    await api.post(`/classes/${classId}/committees`, form);
    setOpen(false);
    setForm({ student_id: '', role: '班长', duty: '' });
    await load();
  };

  const del = async (id) => {
    await api.del(`/committees/${id}`);
    await load();
  };

  /* 已有职务的学生（下拉仍可重复选，一个学生可任多职） */
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus size={15} />任命班委</Button>
      </div>

      {data.committees.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.committees.map(c => (
            <div key={c.id} className="card group flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#af52de] to-[#d783ff] text-white">
                <Award size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.student_name}</span>
                  <Badge tone="purple">{c.role}</Badge>
                </div>
                {c.duty && <div className="mt-0.5 truncate text-xs text-ink-secondary">{c.duty}</div>}
              </div>
              <button
                onClick={() => del(c.id)}
                className="btn-pill p-1.5 text-ink-secondary opacity-0 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] group-hover:opacity-100"
                title="移除"
              ><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      ) : (
        <Empty text="还没有班委，点击右上角「任命班委」" />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="任命班委">
        <div className="space-y-4">
          <Field label="学生">
            <select className={inputCls} value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
              <option value="">请选择</option>
              {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="职务">
            <select className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="职责说明（可选）">
            <input className={inputCls} placeholder="如：负责早读领读、收发作业" value={form.duty} onChange={e => setForm({ ...form, duty: e.target.value })} />
          </Field>
          <Button className="w-full justify-center" onClick={add} disabled={!form.student_id}>确认任命</Button>
        </div>
      </Modal>
    </div>
  );
}
