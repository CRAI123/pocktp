import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, MessageSquare, Check, Clock3 } from 'lucide-react';
import { api, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

/* 常用谈话提纲：点一下自动填入，避免每次从零写 */
const OUTLINES = {
  学习状态: '1. 最近各科作业完成情况\n2. 课堂听讲与笔记习惯\n3. 本次测验失分点\n4. 下一步改进目标',
  情绪状态: '1. 最近情绪波动情况\n2. 与同学相处是否融洽\n3. 是否有压力来源\n4. 需要老师提供的支持',
  行为习惯: '1. 迟到 / 作业拖交情况\n2. 课堂纪律表现\n3. 手机与作息管理\n4. 约定改进措施',
  同学关系: '1. 最近和谁走得近\n2. 是否与同学有矛盾\n3. 集体活动参与度\n4. 如何修复关系',
  家庭情况: '1. 近期家庭变化\n2. 家长陪伴与监督\n3. 家庭作业环境\n4. 家校配合方式',
};
const STATUS_TONE = { 待跟进: 'orange', 已跟进: 'green', 无需跟进: 'gray' };

/** 谈话记录：带提纲、记录与重点学生跟进 */
export default function TalksTab({ classId }) {
  const [data, setData] = useState(null); // { talks, students }
  const [filter, setFilter] = useState('全部');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api.get(`/classes/${classId}/talks`).then(setData);
  useEffect(() => { load(); }, [classId]);

  const rows = useMemo(() => {
    if (!data) return [];
    return filter === '全部' ? data.talks : data.talks.filter(t => t.status === filter);
  }, [data, filter]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const blank = { student_id: '', topic: '', outline: '', content: '', follow_up: '', talked_at: todayStr(), status: '无需跟进' };

  const save = async () => {
    if (!edit.student_id || !edit.topic.trim()) return;
    setErr('');
    try {
      if (edit.id) await api.put(`/talks/${edit.id}`, edit);
      else await api.post(`/classes/${classId}/talks`, edit);
      setEdit(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  const markFollowed = async (t) => {
    await api.put(`/talks/${t.id}`, { ...t, status: '已跟进' });
    await load();
  };

  const fillOutline = (key) => {
    const text = OUTLINES[key];
    setEdit(prev => ({ ...prev, outline: prev.outline ? `${prev.outline}\n${text}` : text }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {['全部', '待跟进', '已跟进', '无需跟进'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${
                filter === f ? 'brand-gradient text-white shadow' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
              }`}>{f}</button>
          ))}
        </div>
        <Button onClick={() => { setErr(''); setEdit({ ...blank }); }}><Plus size={15} />记一次谈话</Button>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map(t => (
            <div key={t.id} className="card group p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0071e3] to-[#00c6ff] text-white">
                  <MessageSquare size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.student_name}</span>
                    <span className="text-sm text-ink-secondary">· {t.topic}</span>
                    <Badge tone={STATUS_TONE[t.status] || 'gray'}>{t.status}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-secondary">{t.talked_at}</div>
                </div>
                {t.status === '待跟进' && (
                  <button onClick={() => markFollowed(t)}
                    className="btn-pill inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#1fa733] hover:bg-[#28cd41]/10" title="标记已跟进">
                    <Check size={13} />已跟进
                  </button>
                )}
                <button onClick={() => { setErr(''); setEdit({ ...t }); }}
                  className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#0071e3]/10 hover:text-[#0071e3] sm:opacity-0 sm:group-hover:opacity-100" title="编辑">
                  <Pencil size={14} />
                </button>
                <button onClick={async () => { await api.del(`/talks/${t.id}`); load(); }}
                  className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除">
                  <Trash2 size={14} />
                </button>
              </div>

              {t.outline && (
                <div className="mt-3 rounded-xl bg-bg-light p-3">
                  <div className="mb-1 text-[11px] font-medium text-ink-secondary">谈话提纲</div>
                  <div className="whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">{t.outline}</div>
                </div>
              )}
              {t.content && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{t.content}</p>
              )}
              {t.follow_up && (
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#ff9500]/8 px-3 py-2">
                  <Clock3 size={14} className="mt-0.5 shrink-0 text-[#c93400]" />
                  <div className="text-xs leading-relaxed text-[#c93400]">跟进重点：{t.follow_up}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={MessageSquare} text={filter === '全部' ? '还没有谈话记录' : `没有「${filter}」的记录`}
          desc="记下谈话提纲与要点，重点学生的变化才有迹可循" />
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '编辑谈话记录' : '记一次谈话'} width="max-w-xl">
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="学生">
                <select className={inputCls} value={edit.student_id} onChange={e => setEdit({ ...edit, student_id: e.target.value })}>
                  <option value="">请选择</option>
                  {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="谈话日期">
                <input type="date" className={inputCls} value={edit.talked_at} onChange={e => setEdit({ ...edit, talked_at: e.target.value })} />
              </Field>
            </div>
            <Field label="谈话主题">
              <input className={inputCls} placeholder="如：最近数学作业拖交、和同桌闹矛盾" value={edit.topic} onChange={e => setEdit({ ...edit, topic: e.target.value })} />
            </Field>
            <Field label="谈话提纲">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {Object.keys(OUTLINES).map(k => (
                  <button key={k} onClick={() => fillOutline(k)}
                    className="btn-pill bg-[#0071e3]/8 px-2.5 py-1 text-[11px] text-[#0071e3] transition hover:bg-[#0071e3]/14">
                    {k}
                  </button>
                ))}
              </div>
              <textarea className={`${inputCls} min-h-[110px] resize-y`} placeholder="点上方标签快速填入提纲，也可自己写"
                value={edit.outline} onChange={e => setEdit({ ...edit, outline: e.target.value })} />
            </Field>
            <Field label="谈话记录">
              <textarea className={`${inputCls} min-h-[110px] resize-y`} placeholder="学生说了什么、情绪如何、达成了什么共识…"
                value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })} />
            </Field>
            <Field label="跟进重点（可选）">
              <input className={inputCls} placeholder="如：两周内观察作业提交情况，周五再聊一次"
                value={edit.follow_up} onChange={e => setEdit({ ...edit, follow_up: e.target.value })} />
            </Field>
            <Field label="跟进状态">
              <select className={inputCls} value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>
                {['无需跟进', '待跟进', '已跟进'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
            <Button className="w-full justify-center" onClick={save} disabled={!edit.student_id || !edit.topic.trim()}>保存</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
