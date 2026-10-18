import { useEffect, useMemo, useState } from 'react';
import { Save, Wand2, Plus, Trash2, Pencil, Check, CalendarDays } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Badge, inputCls } from '../../components/ui.jsx';

/** 学期第几周（以 9 月 1 日为学年起点，仅用于轮值计算） */
function weekIndex() {
  const now = new Date();
  let start = new Date(now.getFullYear(), 8, 1); // 9/1
  if (now < start) start = new Date(now.getFullYear() - 1, 8, 1);
  return Math.max(0, Math.floor((now - start) / (7 * 86400000)));
}

/** 值日表：分组轮值。查看模式显示周轮换；编辑模式调整分组成员。 */
export default function DutyTab({ classId }) {
  const [data, setData] = useState(null); // { groups:[{id,name,members:[{id,name}]}], students }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null); // [{name, member_ids:Set}] 编辑草稿
  const [groupSize, setGroupSize] = useState(5);
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/classes/${classId}/duty-groups`).then(setData);
  useEffect(() => { load(); }, [classId]);

  const currentGroup = useMemo(() => {
    if (!data?.groups?.length) return -1;
    return weekIndex() % data.groups.length;
  }, [data]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const startEdit = () => {
    setDraft(data.groups.map(g => ({ name: g.name, member_ids: new Set(g.members.map(m => m.id)) })));
    setEditing(true);
  };

  const toggleMember = (gi, sid) => {
    const next = draft.map(g => ({ ...g, member_ids: new Set(g.member_ids) }));
    /* 一个学生只能在一个组：先从其他组移除 */
    next.forEach((g, i) => { if (i !== gi) g.member_ids.delete(sid); });
    next[gi].member_ids.has(sid) ? next[gi].member_ids.delete(sid) : next[gi].member_ids.add(sid);
    setDraft(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/classes/${classId}/duty-groups`, {
        groups: draft.map(g => ({ name: g.name, member_ids: [...g.member_ids] })),
      });
      setEditing(false);
      await load();
    } finally { setSaving(false); }
  };

  const autoGroup = async () => {
    await api.post(`/classes/${classId}/duty-groups/auto`, { size: groupSize });
    await load();
  };

  /* ---------- 编辑模式 ---------- */
  if (editing) return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <Button onClick={save} disabled={saving}><Save size={15} />{saving ? '保存中…' : '保存分组'}</Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>取消</Button>
        <Button variant="secondary" onClick={() => setDraft([...draft, { name: `第${draft.length + 1}组`, member_ids: new Set() }])}>
          <Plus size={15} />加一组
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {draft.map((g, gi) => (
          <div key={gi} className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <input
                className={`${inputCls} !w-28 !py-1.5`}
                value={g.name}
                onChange={e => setDraft(draft.map((x, i) => i === gi ? { ...x, name: e.target.value } : x))}
              />
              <span className="text-xs text-ink-secondary">{g.member_ids.size} 人</span>
              <button
                className="btn-pill ml-auto p-1.5 text-ink-secondary hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
                onClick={() => setDraft(draft.filter((_, i) => i !== gi))}
                title="删除该组"
              ><Trash2 size={14} /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.students.map(s => {
                const inThis = g.member_ids.has(s.id);
                const inOther = draft.some((x, i) => i !== gi && x.member_ids.has(s.id));
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleMember(gi, s.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
                      inThis ? 'brand-gradient text-white shadow'
                      : inOther ? 'bg-black/[0.02] text-ink-secondary/40 line-through'
                      : 'bg-black/[0.05] text-ink hover:bg-[#0071e3]/10 hover:text-[#0071e3]'
                    }`}
                  >{s.name}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ---------- 查看模式 ---------- */
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <Badge tone="blue"><CalendarDays size={12} className="mr-1" />第 {weekIndex() + 1} 周</Badge>
        {currentGroup >= 0 && <Badge tone="green">本周值日：{data.groups[currentGroup]?.name}</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
            每组
            <input
              type="number" min="2" max="12" value={groupSize}
              onChange={e => setGroupSize(Number(e.target.value))}
              className="w-14 rounded-lg border border-black/10 bg-bg-light px-2 py-1 text-center text-xs outline-none focus:border-[#0071e3]"
            />人
          </label>
          <Button variant="secondary" onClick={autoGroup}><Wand2 size={15} />自动分组</Button>
          <Button variant="secondary" onClick={startEdit}><Pencil size={15} />编辑分组</Button>
        </div>
      </div>

      {data.groups.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.groups.map((g, gi) => {
            const isNow = gi === currentGroup;
            return (
              <div key={g.id} className={`card p-4 transition ${isNow ? 'border-[#28cd41]/50 ring-2 ring-[#28cd41]/20' : ''}`}>
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="font-medium">{g.name}</div>
                  {isNow ? <Badge tone="green">本周值日</Badge> : <Badge>第 {gi + 1} 顺位</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.members.map(m => (
                    <span key={m.id} className={`rounded-lg px-2.5 py-1 text-xs ${isNow ? 'bg-[#28cd41]/10 font-medium text-[#1fa733]' : 'bg-black/[0.05] text-ink-secondary'}`}>
                      {m.name}
                    </span>
                  ))}
                  {!g.members.length && <span className="text-xs text-ink-secondary">暂无成员</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-ink-secondary">还没有值日分组，点击「自动分组」一键生成，或「编辑分组」手动安排</p>
        </div>
      )}
    </div>
  );
}
