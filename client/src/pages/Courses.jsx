import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, BookOpen, Clock, Users } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty, SkeletonList } from '../components/ui.jsx';

const EMPTY_FORM = { name: '', subject: '信息科技', class_id: '', schedule: '' };

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = () => api.get('/courses').then(setCourses).catch(console.error).finally(() => setLoading(false));
  useEffect(() => {
    load();
    api.get('/classes').then(setClasses).catch(console.error);
  }, []);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ name: c.name, subject: c.subject, class_id: c.class_id || '', schedule: c.schedule || '' });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form, class_id: form.class_id || null };
    if (editingId) await api.put(`/courses/${editingId}`, payload);
    else await api.post('/courses', payload);
    setOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    load();
  };

  const remove = async (id) => {
    if (!confirm('删除课程将同时删除其资料（含云端文件）、作业与成绩，确认删除？')) return;
    await api.del(`/courses/${id}`);
    load();
  };

  return (
    <div>
      <SectionHeader
        title="开设课程"
        desc="本学期所有课程的教学进度与资源概览"
        action={<Button onClick={openCreate}><Plus size={16} />新建课程</Button>}
      />
      {loading ? <SkeletonList rows={3} /> : courses.length === 0 ? (
        <Empty
          icon={BookOpen}
          text="还没有课程"
          desc="创建第一门课程，统一管理教学进度、资料与作业"
          action={<Button onClick={openCreate}><Plus size={16} />新建课程</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map(c => (
            <div key={c.id} className="card card-hover group flex flex-col p-6">
              <div className="flex items-start justify-between">
                <div className="brand-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white">
                  <BookOpen size={20} />
                </div>
                <div className="flex gap-1 opacity-60 transition sm:opacity-0 sm:group-hover:opacity-100">
                  <button onClick={() => openEdit(c)} title="编辑课程" className="btn-pill p-2 text-ink-secondary/70 hover:bg-black/5 hover:text-ink">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => remove(c.id)} title="删除课程" className="btn-pill p-2 text-ink-secondary/50 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{c.name}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="blue">{c.subject}</Badge>
                {c.class_name && <Badge tone="green">{c.class_name}</Badge>}
                <Badge>{c.semester}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm text-ink-secondary">
                <span className="flex items-center gap-1.5"><Clock size={14} />{c.schedule || '时间待定'}</span>
              </div>
              <div className="mt-4 flex gap-6 border-t border-black/5 pt-4 text-sm">
                <span><b className="text-base">{c.material_count}</b> 份资料</span>
                <span><b className="text-base">{c.assignment_count}</b> 次作业</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? '编辑课程' : '新建课程'}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="课程名称">
            <input required className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：趣味 3D 建模入门" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="学科">
              <input className={inputCls} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="授课班级">
              <select className={inputCls} value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })}>
                <option value="">不指定</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="上课时间">
            <input className={inputCls} value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} placeholder="如：周二/周四 14:00-15:00" />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit">{editingId ? '保存修改' : '创建'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
