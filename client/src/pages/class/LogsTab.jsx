import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, NotebookPen, CalendarDays } from 'lucide-react';
import { api, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const CATEGORIES = ['班级事件', '活动', '荣誉', '问题', '其他'];
const CAT_TONE = { 班级事件: 'blue', 活动: 'purple', 荣誉: 'orange', 问题: 'red', 其他: 'gray' };

/** 班级日志：按时间倒序记录班级事件，学期末不用回忆 */
export default function LogsTab({ classId }) {
  const [rows, setRows] = useState(null);
  const [month, setMonth] = useState('');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api.get(`/classes/${classId}/logs${month ? `?month=${month}` : ''}`).then(setRows);
  useEffect(() => { load(); }, [classId, month]);

  /* 按日期分组，形成时间轴 */
  const groups = useMemo(() => {
    const map = {};
    for (const r of rows || []) (map[r.log_date] ||= []).push(r);
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  if (!rows) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const save = async () => {
    if (!edit.title.trim()) return;
    setErr('');
    try {
      if (edit.id) await api.put(`/logs/${edit.id}`, edit);
      else await api.post(`/classes/${classId}/logs`, edit);
      setEdit(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <CalendarDays size={15} />
          <input type="month" className="rounded-xl border border-black/10 bg-bg-light px-3 py-1.5 text-sm outline-none focus:border-[#0071e3]"
            value={month} onChange={e => setMonth(e.target.value)} />
          {month && <button onClick={() => setMonth('')} className="text-xs text-[#0071e3] hover:underline">查看全部</button>}
        </div>
        <Button onClick={() => { setErr(''); setEdit({ title: '', content: '', category: '班级事件', log_date: todayStr() }); }}>
          <Plus size={15} />写一条日志
        </Button>
      </div>

      {groups.length ? (
        <div className="space-y-5">
          {groups.map(([date, items]) => (
            <div key={date}>
              <div className="mb-2 flex items-center gap-2">
                <span className="brand-gradient h-2 w-2 rounded-full" />
                <span className="text-sm font-semibold tabular-nums">{date}</span>
                <span className="text-xs text-ink-secondary">{items.length} 条</span>
              </div>
              <div className="relative space-y-3 border-l-2 border-black/[0.06] pl-4">
                {items.map(l => (
                  <div key={l.id} className="card group relative p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{l.title}</span>
                          <Badge tone={CAT_TONE[l.category] || 'gray'}>{l.category}</Badge>
                        </div>
                        {l.content && (
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{l.content}</p>
                        )}
                      </div>
                      <button onClick={() => { setErr(''); setEdit({ ...l }); }}
                        className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#0071e3]/10 hover:text-[#0071e3] sm:opacity-0 sm:group-hover:opacity-100" title="编辑">
                        <Pencil size={14} />
                      </button>
                      <button onClick={async () => { await api.del(`/logs/${l.id}`); load(); }}
                        className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={NotebookPen} text={month ? '这个月还没有日志' : '还没有班级日志'}
          desc="班级事件、活动、荣誉都记一笔，学期末写总结直接翻这里" />
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '编辑日志' : '写一条日志'} width="max-w-xl">
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_150px] gap-3">
              <Field label="标题">
                <input className={inputCls} placeholder="如：秋季运动会班级接力赛第一名" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
              </Field>
              <Field label="日期">
                <input type="date" className={inputCls} value={edit.log_date} onChange={e => setEdit({ ...edit, log_date: e.target.value })} />
              </Field>
            </div>
            <Field label="分类">
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setEdit({ ...edit, category: c })}
                    className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${
                      edit.category === c ? 'bg-[#0071e3] text-white' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
                    }`}>{c}</button>
                ))}
              </div>
            </Field>
            <Field label="详细记录（可选）">
              <textarea className={`${inputCls} min-h-[140px] resize-y`} placeholder="发生了什么、哪些学生参与、后续要跟进什么…"
                value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })} />
            </Field>
            {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
            <Button className="w-full justify-center" onClick={save} disabled={!edit.title.trim()}>保存</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
