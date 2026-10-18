import { useEffect, useState } from 'react';
import { Plus, ChevronRight, CheckCircle2, Clock3, Send } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty, statusTone } from '../components/ui.jsx';

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [grading, setGrading] = useState(null); // 当前批改的作业
  const [form, setForm] = useState({ course_id: '', title: '', content: '', deadline: '' });

  const load = () => api.get('/assignments').then(setAssignments).catch(console.error);
  useEffect(() => {
    load();
    api.get('/courses').then(setCourses).catch(console.error);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    await api.post('/assignments', form);
    setCreateOpen(false);
    setForm({ course_id: '', title: '', content: '', deadline: '' });
    load();
  };

  return (
    <div>
      <SectionHeader
        title="作业布置与批改"
        desc="布置课后任务，在线查看提交情况并评分"
        action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} />布置作业</Button>}
      />

      {assignments.length === 0 ? <Empty text="还没有布置过作业" /> : (
        <div className="space-y-3">
          {assignments.map(a => {
            const progress = a.submitted_count ? Math.round((a.graded_count / a.submitted_count) * 100) : 0;
            return (
              <div key={a.id} className="card card-hover flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge tone="blue">{a.course_name}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-ink-secondary">{a.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
                    <span className="flex items-center gap-1"><Clock3 size={13} />截止 {a.deadline || '不限'}</span>
                    <span className="flex items-center gap-1"><Send size={13} />已交 {a.submitted_count}</span>
                    <span className="flex items-center gap-1"><CheckCircle2 size={13} />已批 {a.graded_count}</span>
                  </div>
                </div>
                {/* 批改进度 */}
                <div className="w-full sm:w-40">
                  <div className="mb-1 flex justify-between text-xs text-ink-secondary"><span>批改进度</span><span>{progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
                    <div className="brand-gradient h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <Button variant="secondary" onClick={() => setGrading(a)} className="shrink-0">
                  进入批改<ChevronRight size={15} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* 布置作业 */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="布置新作业">
        <form onSubmit={submit} className="space-y-4">
          <Field label="所属课程">
            <select required className={inputCls} value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}>
              <option value="">请选择课程</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="作业标题">
            <input required className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="作业要求">
            <textarea className={`${inputCls} h-24 resize-none`} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
          </Field>
          <Field label="截止时间">
            <input type="datetime-local" className={inputCls} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value.replace('T', ' ') })} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="submit">发布</Button>
          </div>
        </form>
      </Modal>

      {grading && <GradingModal assignment={grading} onClose={() => { setGrading(null); load(); }} />}
    </div>
  );
}

/** 批改面板 */
function GradingModal({ assignment, onClose }) {
  const [subs, setSubs] = useState([]);
  const [editing, setEditing] = useState({}); // id -> {score, feedback}

  const load = () => api.get(`/assignments/${assignment.id}/submissions`).then(setSubs).catch(console.error);
  useEffect(() => { load(); }, [assignment.id]);

  const grade = async (id) => {
    const g = editing[id];
    if (!g || g.score === '' || g.score == null) return alert('请先输入分数');
    await api.patch(`/submissions/${id}/grade`, g);
    load();
  };

  return (
    <Modal open onClose={onClose} title={`批改作业 · ${assignment.title}`} width="max-w-2xl">
      {subs.length === 0 ? <p className="py-6 text-center text-sm text-ink-secondary">暂无学生提交</p> : (
        <div className="space-y-3">
          {subs.map(s => (
            <div key={s.id} className="rounded-2xl bg-bg-light p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.student_name}</span>
                  <span className="text-xs text-ink-secondary">{s.student_no}</span>
                  <Badge tone={statusTone[s.status]}>{s.status}</Badge>
                  {s.score != null && <span className="brand-gradient-text text-lg font-semibold">{s.score} 分</span>}
                </div>
                <span className="text-xs text-ink-secondary">{(s.submitted_at || '').slice(0, 16)}</span>
              </div>
              <p className="mt-2 text-sm text-ink-secondary">提交内容：{s.content || '—'}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="number" min="0" max="100" placeholder="分数"
                  className={`${inputCls} sm:w-28`}
                  defaultValue={s.score ?? ''}
                  onChange={e => setEditing({ ...editing, [s.id]: { ...editing[s.id], score: +e.target.value, feedback: editing[s.id]?.feedback ?? s.feedback } })}
                />
                <input
                  placeholder="评语（可选）"
                  className={`${inputCls} flex-1`}
                  defaultValue={s.feedback || ''}
                  onChange={e => setEditing({ ...editing, [s.id]: { ...editing[s.id], score: editing[s.id]?.score ?? s.score, feedback: e.target.value } })}
                />
                <Button onClick={() => grade(s.id)} className="shrink-0">{s.status === '已批改' ? '更新评分' : '提交评分'}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
