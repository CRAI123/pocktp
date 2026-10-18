import { useEffect, useState } from 'react';
import { Plus, Trash2, FileText, Presentation, PenSquare, Video, Folder } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty, statusTone } from '../components/ui.jsx';

const TYPE_ICON = { 课件: Presentation, 教案: FileText, 习题: PenSquare, 视频: Video, 其他: Folder };

export default function Materials() {
  const [materials, setMaterials] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ course_id: '', title: '', type: '课件', file_size: '', summary: '' });

  const load = () => api.get(`/materials${filter ? `?course_id=${filter}` : ''}`).then(setMaterials).catch(console.error);
  useEffect(() => { api.get('/courses').then(setCourses).catch(console.error); }, []);
  useEffect(() => { load(); }, [filter]);

  const submit = async (e) => {
    e.preventDefault();
    await api.post('/materials', form);
    setOpen(false);
    setForm({ course_id: '', title: '', type: '课件', file_size: '', summary: '' });
    load();
  };

  return (
    <div>
      <SectionHeader
        title="备课资料库"
        desc="课件、教案、习题与教学视频统一管理"
        action={<Button onClick={() => setOpen(true)}><Plus size={16} />上传资料</Button>}
      />

      {/* 课程筛选 */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setFilter('')} className={chipCls(!filter)}>全部课程</button>
        {courses.map(c => (
          <button key={c.id} onClick={() => setFilter(String(c.id))} className={chipCls(filter === String(c.id))}>{c.name}</button>
        ))}
      </div>

      {materials.length === 0 ? <Empty text="该课程下暂无资料" /> : (
        <div className="card divide-y divide-black/5">
          {materials.map(m => {
            const Icon = TYPE_ICON[m.type] || Folder;
            return (
              <div key={m.id} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-bg-light/60">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{m.title}</span>
                    <Badge tone={statusTone[m.type]}>{m.type}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-ink-secondary">
                    {m.course_name}{m.summary ? ` · ${m.summary}` : ''}{m.file_size ? ` · ${m.file_size}` : ''}
                  </div>
                </div>
                <span className="hidden shrink-0 text-xs text-ink-secondary sm:block">{(m.created_at || '').slice(0, 10)}</span>
                <button
                  onClick={async () => { if (confirm('确认删除该资料？')) { await api.del(`/materials/${m.id}`); load(); } }}
                  className="btn-pill shrink-0 p-1.5 text-ink-secondary/50 opacity-0 transition group-hover:opacity-100 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="上传备课资料">
        <form onSubmit={submit} className="space-y-4">
          <Field label="所属课程">
            <select required className={inputCls} value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}>
              <option value="">请选择课程</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="资料标题">
            <input required className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：第3讲 基本体组合建模" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="类型">
              <select className={inputCls} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {Object.keys(TYPE_ICON).map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="文件大小">
              <input className={inputCls} value={form.file_size} onChange={e => setForm({ ...form, file_size: e.target.value })} placeholder="如：4.2 MB" />
            </Field>
          </div>
          <Field label="内容摘要">
            <textarea className={`${inputCls} h-20 resize-none`} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="简要说明资料内容与适用课时" />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function chipCls(active) {
  return `btn-pill px-4 py-1.5 text-sm font-medium ${
    active ? 'brand-gradient text-white shadow-md shadow-blue-500/20' : 'bg-white text-ink-secondary shadow-sm hover:text-ink'
  }`;
}
