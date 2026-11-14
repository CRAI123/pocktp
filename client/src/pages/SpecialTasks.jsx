import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Upload, Target, Users } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Field, inputCls, Badge, Empty, Modal } from '../components/ui.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import { splitFields } from '../lib/docx.js';
import { GROUPS, groupTone, todayStr } from './prep/shared.js';

export default function SpecialTasks() {
  const [tasks, setTasks] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [open, setOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [form, setForm] = useState({
    content: '', target: '', scope_type: 'all', class_id: '', group_name: GROUPS[0],
    repeat_mode: '每日', date: todayStr(),
  });
  const [busy, setBusy] = useState(false);
  const today = todayStr();

  const load = () => Promise.all([api.get('/cp/special'), api.get('/classes'), api.get('/cp/students')])
    .then(([t, c, s]) => { setTasks(t); setClasses(c); setStudents(s); }).catch(console.error);
  useEffect(() => { load(); }, []);

  const byClass = useMemo(() => {
    const map = {};
    students.forEach(s => {
      const k = s.class_id || 'unsorted';
      (map[k] = map[k] || { label: s.class_name || '未分班', list: [] }).list.push(s);
    });
    return map;
  }, [students]);

  const scopeLabel = (t) => {
    if (t.scope_type === 'class') return t.class_name || '指定班级';
    if (t.scope_type === 'group') return `${t.group_name}`;
    return '全班';
  };
  const isDone = (t) => (t.repeat_mode === '每日' ? t.done_date === today : t.done === 1);

  const add = async (e) => {
    e.preventDefault();
    if (!form.content.trim()) return;
    setBusy(true);
    try {
      await api.post('/cp/special', {
        ...form,
        class_id: form.scope_type === 'class' ? form.class_id || null : null,
        group_name: form.scope_type === 'group' ? form.group_name : '',
      });
      setOpen(false);
      setForm({ content: '', target: '', scope_type: 'all', class_id: '', group_name: GROUPS[0], repeat_mode: '每日', date: todayStr() });
      load();
    } finally { setBusy(false); }
  };

  const setGroup = async (id, g) => {
    setStudents(list => list.map(s => s.id === id ? { ...s, cp_group: g } : s));
    await api.put(`/cp/students/${id}/group`, { cp_group: g });
  };

  const remove = async (id) => { if (!confirm('确认删除该任务？')) return; await api.del(`/cp/special/${id}`); load(); };

  return (
    <div>
      <SectionHeader
        title="特殊学生任务"
        desc="给全体 / 指定班级 / 指定分组布置每日或单次任务，到期的任务会出现在工作台总览的「今天要处理」。"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImpOpen(true)}><Upload size={15} />批量导入</Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} />布置任务</Button>
          </div>
        }
      />

      <div className="card mb-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Users size={17} className="text-[#0071e3]" />
          <h3 className="text-[15px] font-semibold text-ink">学生分组</h3>
          <Badge tone="blue">{students.length} 名学生</Badge>
          <button className="btn-pill ml-auto px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink" onClick={() => setShowGroup(v => !v)}>
            {showGroup ? '收起' : '展开设置'}
          </button>
        </div>
        {showGroup && (
          students.length === 0 ? <p className="mt-3 text-sm text-ink-secondary">还没有学生，请先到「班级成员」添加。</p> : (
            <div className="mt-3 space-y-4">
              {Object.entries(byClass).map(([cid, g]) => (
                <div key={cid}>
                  <div className="mb-1.5 text-[13px] font-medium text-ink">{g.label}
                    <span className="ml-1 text-[11px] font-normal text-ink-secondary">（{g.list.length} 人）</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.list.map(s => (
                      <div key={s.id} className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-2.5 py-1">
                        <span className="text-xs text-ink">{s.name}</span>
                        <select className="rounded-full bg-black/[0.03] px-1.5 py-0.5 text-[11px] text-ink-secondary outline-none"
                          value={s.cp_group || ''} onChange={e => setGroup(s.id, e.target.value)}>
                          <option value="">未分组</option>
                          {GROUPS.map(x => <option key={x}>{x}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {tasks.length === 0 ? <Empty icon={Target} text="暂无特殊学生任务" desc="点击右上角布置一条每日任务或单次任务。" /> : (
        <div className="card divide-y divide-black/5">
          {tasks.map(t => (
            <div key={t.id} className="flex items-start gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{t.content}</span>
                  <Badge tone={t.scope_type === 'group' ? (groupTone[t.group_name] || 'gray') : 'blue'}>{scopeLabel(t)}</Badge>
                  <Badge tone={t.repeat_mode === '每日' ? 'green' : 'gray'}>{t.repeat_mode}</Badge>
                  {isDone(t) && <Badge tone="green">已完成</Badge>}
                </div>
                {t.target && <div className="mt-1 text-xs text-ink-secondary">适用学生：{t.target}</div>}
                <div className="mt-0.5 text-[11px] text-ink-secondary">
                  {t.repeat_mode === '每日' ? `今日 ${t.done_date === today ? '已完成' : '待完成'}` : `${t.date} ${t.done ? '已完成' : '待完成'}`}
                </div>
              </div>
              <button onClick={() => remove(t.id)} className="btn-pill shrink-0 p-2 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="布置特殊学生任务">
        <form onSubmit={add} className="space-y-4">
          <Field label="任务内容">
            <input className={inputCls} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="如：背诵《劝学》并默写第一段" required />
          </Field>
          <Field label="适用学生（可选，备注人名）">
            <input className={inputCls} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="如：张伟、李响" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="范围">
              <select className={inputCls} value={form.scope_type} onChange={e => setForm({ ...form, scope_type: e.target.value })}>
                <option value="all">全班</option>
                <option value="class">指定班级</option>
                <option value="group">指定分组</option>
              </select>
            </Field>
            {form.scope_type === 'class' && (
              <Field label="班级">
                <select className={inputCls} value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })}>
                  <option value="">请选择</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {form.scope_type === 'group' && (
              <Field label="分组">
                <select className={inputCls} value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })}>
                  {GROUPS.map(g => <option key={g}>{g}</option>)}
                </select>
              </Field>
            )}
            <Field label="重复">
              <select className={inputCls} value={form.repeat_mode} onChange={e => setForm({ ...form, repeat_mode: e.target.value })}>
                <option>每日</option>
                <option>单次</option>
              </select>
            </Field>
          </div>
          {form.repeat_mode === '单次' && (
            <Field label="单次日期">
              <input type="date" className={inputCls} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Field>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit" disabled={busy}>布置</Button>
          </div>
        </form>
      </Modal>

      <ImportDialog
        open={impOpen} onClose={() => setImpOpen(false)}
        title="特殊学生任务 · 批量导入" mod="special" onDone={load}
        example={'每行一条，可用 | 或空格分隔：\n任务内容 适用学生 范围(全班/班级名/分组名) 重复(每日/单次) 日期(单次填写)\n例：背诵《劝学》 张伟 全班 每日\n作文面批 李响 13班 单次 2026-09-12'}
        parse={(lines) => lines.map(ln => {
          const p = splitFields(ln);
          const scope = (p[2] || '').trim();
          const cls = classes.find(c => c.name === scope);
          const grp = GROUPS.includes(scope);
          return {
            content: p[0], target: p[1] || '',
            scope_type: cls ? 'class' : (grp ? 'group' : 'all'),
            class_id: cls?.id || '', group_name: grp ? scope : '',
            repeat_mode: p[3] === '单次' ? '单次' : '每日',
            date: /^\d{4}-\d{2}-\d{2}$/.test(p[4] || '') ? p[4] : todayStr(),
          };
        }).filter(r => r.content)}
      />
    </div>
  );
}
