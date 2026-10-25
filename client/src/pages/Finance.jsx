import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Download, Pencil, Clock, Coins, CalendarDays, BarChart3 } from 'lucide-react';
import { api, todayStr } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Empty, StatCard, Badge } from '../components/ui.jsx';

const EMPTY = { class_id: '', course_id: '', date: todayStr(), hours: '1', rate: '', note: '' };

/** 运营台账：课时记录 → 课时费统计 + 教师工作量统计 */
export default function Finance() {
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/lesson-logs?month=${month}`).then(setData).catch(console.error);
  useEffect(() => { load(); }, [month]);
  useEffect(() => {
    api.get('/classes').then(setClasses).catch(console.error);
    api.get('/courses').then(setCourses).catch(console.error);
  }, []);

  const courseOptions = useMemo(
    () => (form.class_id ? courses.filter(c => String(c.class_id) === String(form.class_id)) : courses),
    [courses, form.class_id]
  );

  const lastRate = data?.rows?.[0]?.rate;

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY, rate: lastRate ? String(lastRate) : '' });
    setOpen(true);
  };

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      class_id: r.class_id ? String(r.class_id) : '',
      course_id: r.course_id ? String(r.course_id) : '',
      date: r.date, hours: String(r.hours), rate: String(r.rate), note: r.note || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        class_id: form.class_id || null,
        course_id: form.course_id || null,
        date: form.date,
        hours: Number(form.hours) || 0,
        rate: Number(form.rate) || 0,
        note: form.note,
      };
      if (editingId) await api.put(`/lesson-logs/${editingId}`, payload);
      else await api.post('/lesson-logs', payload);
      setOpen(false);
      /* 记录的月份与当前查看月份不一致时自动切换，避免“记了却看不到” */
      if (form.date.slice(0, 7) !== month) setMonth(form.date.slice(0, 7));
      else load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('确认删除这条课时记录？')) return;
    await api.del(`/lesson-logs/${id}`);
    load();
  };

  /* CSV 导出（UTF-8 BOM 防 Excel 中文乱码） */
  const exportCsv = () => {
    if (!data?.rows?.length) return;
    const head = '日期,班级,课程,课时,课时单价,课时费,备注\n';
    const body = data.rows.map(r =>
      [r.date, r.class_name || '', r.course_name || '', r.hours, r.rate,
        (Number(r.hours) * Number(r.rate)).toFixed(2), `"${(r.note || '').replace(/"/g, '""')}"`].join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `课时台账_${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const months = data?.months || [];
  const maxFee = Math.max(1, ...months.map(m => m.fee));

  return (
    <div>
      <SectionHeader
        title="课时费与工作量"
        desc="记录每次上课的课时与单价，自动汇总课时费与月度工作量"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={`${inputCls} w-auto`} />
            <Button variant="secondary" onClick={exportCsv} disabled={!data?.rows?.length}><Download size={15} />导出 CSV</Button>
            <Button onClick={openCreate}><Plus size={16} />记录课时</Button>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Clock} label="本月课时" value={`${data?.summary?.hours ?? 0} 课时`} hint="按记录累加" />
        <StatCard icon={Coins} label="本月课时费" value={`¥${(data?.summary?.fee ?? 0).toFixed(2)}`} hint="课时 × 单价" tone="green" />
        <StatCard icon={CalendarDays} label="上课次数" value={`${data?.summary?.count ?? 0} 次`} hint="本月已登记" tone="orange" />
        <StatCard icon={BarChart3} label="涉及班级" value={`${data?.summary?.byClass?.length ?? 0} 个`} hint="本月有课时" tone="purple" />
      </div>

      <div className="space-y-4">
        {/* 课时记录列表 */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-black/5 px-5 py-3.5 text-sm font-semibold">课时明细</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-black/5 bg-bg-light text-left text-xs text-ink-secondary">
                  <th className="px-5 py-3 font-medium">日期</th>
                  <th className="px-5 py-3 font-medium">班级 / 课程</th>
                  <th className="px-5 py-3 text-right font-medium">课时</th>
                  <th className="px-5 py-3 text-right font-medium">单价</th>
                  <th className="px-5 py-3 text-right font-medium">小计</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).map(r => (
                  <tr key={r.id} className="group border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                    <td className="px-5 py-3 text-ink-secondary">{r.date}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.class_name || '未分班'}</div>
                      <div className="text-xs text-ink-secondary">{r.course_name || r.note || '—'}</div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{Number(r.hours)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-secondary">¥{Number(r.rate).toFixed(2)}</td>
                    <td className="px-5 py-3 text-right font-bold text-[#1fa733] tabular-nums">
                      ¥{(Number(r.hours) * Number(r.rate)).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openEdit(r)} className="btn-pill p-2 text-ink-secondary opacity-60 hover:text-[#0071e3] sm:opacity-0 sm:group-hover:opacity-100" title="编辑">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => remove(r.id)} className="btn-pill p-2 text-ink-secondary opacity-60 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data?.rows?.length && (
            <Empty icon={Clock} text="本月还没有课时记录" desc="记录课时后自动统计课时费与工作量" action={<Button onClick={openCreate}><Plus size={15} />记录课时</Button>} />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 按班级汇总 */}
          <div className="card p-5">
            <div className="mb-3 text-sm font-semibold">本月班级课时分布</div>
            {!data?.summary?.byClass?.length ? (
              <div className="text-xs text-ink-secondary">暂无数据</div>
            ) : (
              <div className="space-y-3">
                {data.summary.byClass.map(b => {
                  const pct = data.summary.hours ? Math.round((b.hours / data.summary.hours) * 100) : 0;
                  return (
                    <div key={b.class_name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{b.class_name}</span>
                        <span className="text-ink-secondary tabular-nums">{b.hours} 课时 · ¥{b.fee.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                        <div className="h-full brand-gradient" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 近 12 个月工作量趋势 */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">近 12 个月课时费</div>
              <Badge tone="blue">工作量走势</Badge>
            </div>
            {!months.length ? (
              <div className="text-xs text-ink-secondary">暂无数据</div>
            ) : (
              <div className="flex h-32 items-end gap-1.5">
                {months.map(m => (
                  <div key={m.month} className="group flex flex-1 flex-col items-center gap-1" title={`${m.month}：${m.hours} 课时 · ¥${m.fee.toFixed(2)}`}>
                    <div className="relative flex w-full flex-1 items-end">
                      <div className="w-full rounded-t-md bg-gradient-to-t from-[#0071e3] to-[#00c6ff] transition group-hover:opacity-80"
                        style={{ height: `${Math.max(4, (m.fee / maxFee) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-ink-secondary">{m.month.slice(5)}月</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? '编辑课时记录' : '记录课时'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="上课日期">
              <input type="date" className={inputCls} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="课时数">
              <input type="number" min="0" step="0.5" className={inputCls} value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} />
            </Field>
          </div>
          <Field label="班级（选填）">
            <select className={inputCls} value={form.class_id}
              onChange={e => setForm({ ...form, class_id: e.target.value, course_id: '' })}>
              <option value="">不指定班级</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="课程（选填，自动带出班级）">
            <select className={inputCls} value={form.course_id}
              onChange={e => {
                const co = courses.find(c => String(c.id) === e.target.value);
                setForm(f => ({
                  ...f,
                  course_id: e.target.value,
                  class_id: co?.class_id ? String(co.class_id) : f.class_id,
                }));
              }}>
              <option value="">不指定课程</option>
              {courseOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="课时单价（元/课时）">
              <input type="number" min="0" step="1" className={inputCls} placeholder="如 120" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
            </Field>
            <Field label="本次课时费">
              <div className={`${inputCls} flex items-center font-semibold text-[#1fa733]`}>
                ¥{((Number(form.hours) || 0) * (Number(form.rate) || 0)).toFixed(2)}
              </div>
            </Field>
          </div>
          <Field label="备注（选填）">
            <input className={inputCls} placeholder="如：下午第三节 / 补课" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </Field>
          <Button className="w-full justify-center" onClick={save} disabled={saving || !form.date}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
