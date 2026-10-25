import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Check, X, FileText, CalendarCheck, Clock3 } from 'lucide-react';
import { api, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const TYPES = ['事假', '病假', '其他'];
const TYPE_TONE = { 事假: 'blue', 病假: 'purple', 其他: 'gray' };
const STATUS_TONE = { 待审批: 'orange', 已批准: 'green', 已驳回: 'red' };

/* 请假天数（含首尾） */
function daysOf(l) {
  const s = new Date(`${l.start_date}T00:00:00`), e = new Date(`${l.end_date}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 1;
  return Math.round((e - s) / 86400000) + 1;
}

/** 请假条：登记、审批，批准后自动补记考勤 */
export default function LeaveTab({ classId }) {
  const [data, setData] = useState(null); // { leaves, students }
  const [filter, setFilter] = useState('全部');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: '', type: '事假', start_date: todayStr(), end_date: todayStr(), reason: '' });
  const [err, setErr] = useState('');
  const [hint, setHint] = useState('');

  const load = () => api.get(`/classes/${classId}/leaves`).then(setData);
  useEffect(() => { load(); }, [classId]);

  useEffect(() => {
    if (!hint) return undefined;
    const t = setTimeout(() => setHint(''), 5000);
    return () => clearTimeout(t);
  }, [hint]);

  const rows = useMemo(() => {
    if (!data) return [];
    return filter === '全部' ? data.leaves : data.leaves.filter(l => l.status === filter);
  }, [data, filter]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const pending = data.leaves.filter(l => l.status === '待审批').length;
  const approved = data.leaves.filter(l => l.status === '已批准');
  const approvedDays = approved.reduce((a, l) => a + daysOf(l), 0);

  const submit = async () => {
    if (!form.student_id) return;
    if (form.end_date < form.start_date) { setErr('结束日期不能早于开始日期'); return; }
    setErr('');
    try {
      await api.post(`/classes/${classId}/leaves`, form);
      setOpen(false);
      setForm({ student_id: '', type: '事假', start_date: todayStr(), end_date: todayStr(), reason: '' });
      await load();
    } catch (e) { setErr(e.message); }
  };

  const review = async (l, status) => {
    const d = await api.put(`/leaves/${l.id}`, { status });
    if (status === '已批准' && d.attendance_filled) {
      setHint(`已批准，并自动补记 ${d.attendance_filled} 天「请假」考勤`);
    }
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff9500] to-[#ffcc00] text-white"><Clock3 size={18} /></div>
          <div><div className="text-xl font-bold text-[#c93400]">{pending}</div><div className="text-xs text-ink-secondary">待审批</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#28cd41] to-[#34d058] text-white"><CalendarCheck size={18} /></div>
          <div><div className="text-xl font-bold">{approved.length}</div><div className="text-xs text-ink-secondary">已批准</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0071e3] to-[#00c6ff] text-white"><FileText size={18} /></div>
          <div><div className="text-xl font-bold">{approvedDays}</div><div className="text-xs text-ink-secondary">累计请假天数</div></div>
        </div>
      </div>

      {hint && (
        <div className="flex items-center justify-between rounded-xl bg-[#28cd41]/10 px-3.5 py-2.5 text-xs text-[#1fa733]">
          <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={3} />{hint}</span>
          <button onClick={() => setHint('')} className="text-[#1fa733]/70 hover:text-[#1fa733]">关闭</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {['全部', '待审批', '已批准', '已驳回'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${
                filter === f ? 'brand-gradient text-white shadow' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
              }`}>{f}</button>
          ))}
        </div>
        <Button onClick={() => { setErr(''); setOpen(true); }} disabled={!data.students.length}>
          <Plus size={15} />登记请假
        </Button>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map(l => (
            <div key={l.id} className="card group p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5856d6] to-[#af52de] text-white">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{l.student_name}</span>
                    <Badge tone={TYPE_TONE[l.type] || 'gray'}>{l.type}</Badge>
                    <Badge tone={STATUS_TONE[l.status] || 'gray'}>{l.status}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                    <span className="tabular-nums">{l.start_date} 至 {l.end_date}</span>
                    <span>·</span>
                    <span>共 {daysOf(l)} 天</span>
                    {l.reason && <span className="truncate">· {l.reason}</span>}
                  </div>
                </div>
                {l.status === '待审批' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => review(l, '已批准')}
                      className="btn-pill inline-flex items-center gap-1 bg-[#28cd41]/10 px-2.5 py-1.5 text-xs font-medium text-[#1fa733] hover:bg-[#28cd41]/15">
                      <Check size={13} />批准
                    </button>
                    <button onClick={() => review(l, '已驳回')}
                      className="btn-pill inline-flex items-center gap-1 bg-[#ff3b30]/8 px-2.5 py-1.5 text-xs font-medium text-[#ff3b30] hover:bg-[#ff3b30]/12">
                      <X size={13} />驳回
                    </button>
                  </div>
                )}
                <button onClick={async () => { await api.del(`/leaves/${l.id}`); load(); }}
                  className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除">
                  <Trash2 size={14} />
                </button>
              </div>
              {l.status === '已批准' && (
                <div className="mt-2 text-[11px] text-ink-secondary">已批准 · 区间内未点名的日期已自动记为「请假」</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={FileText} text={filter === '全部' ? '还没有请假记录' : `没有「${filter}」的记录`}
          desc="登记后可一键批准，点名表会自动补记请假" />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="登记请假">
        <div className="space-y-4">
          <Field label="学生">
            <select className={inputCls} value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}>
              <option value="">请选择</option>
              {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="请假类型">
            <div className="flex gap-2">
              {TYPES.map(t => (
                <button key={t} onClick={() => setForm({ ...form, type: t })}
                  className={`btn-pill flex-1 py-2 text-sm font-medium transition ${
                    form.type === t ? 'bg-[#0071e3] text-white shadow' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/[0.08]'
                  }`}>{t}</button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始日期">
              <input type="date" className={inputCls} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="结束日期">
              <input type="date" className={inputCls} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
          <Field label="请假事由（可选）">
            <input className={inputCls} placeholder="如：发烧就医 / 家中有事" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </Field>
          {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
          <Button className="w-full justify-center" onClick={submit} disabled={!form.student_id}>保存请假条</Button>
        </div>
      </Modal>
    </div>
  );
}
