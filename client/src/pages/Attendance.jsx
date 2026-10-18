import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Save, Download } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Badge, Empty, Modal, Field, statusTone, inputCls } from '../components/ui.jsx';

const STATUSES = ['出勤', '迟到', '请假', '缺勤'];

export default function Attendance() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [data, setData] = useState({ records: [], summary: [] });
  const [students, setStudents] = useState([]);
  const [draft, setDraft] = useState({}); // student_id -> {status, remark}
  const [saving, setSaving] = useState(false);
  // 月报导出
  const [expOpen, setExpOpen] = useState(false);
  const [classes, setClasses] = useState([]);
  const [expClass, setExpClass] = useState('');
  const [expMonth, setExpMonth] = useState(today.slice(0, 7));
  const [exporting, setExporting] = useState(false);

  const openExport = () => {
    setExpOpen(true);
    if (!classes.length) {
      api.get('/classes').then(cs => {
        setClasses(cs);
        if (cs.length) setExpClass(String(cs[0].id));
      }).catch(console.error);
    }
  };

  /* 导出某班某月考勤月报 CSV（BOM 防 Excel 乱码） */
  const doExport = async () => {
    if (!expClass || !expMonth) return;
    setExporting(true);
    try {
      const d = await api.get(`/classes/${expClass}/attendance-monthly?month=${expMonth}`);
      const head = '学号,姓名,出勤,迟到,缺勤,请假,出勤率\n';
      const body = d.rows.map(r => {
        const total = +r.present + +r.late + +r.absent + +r.leave;
        const rate = total ? (((+r.present + +r.late) / total) * 100).toFixed(1) + '%' : '—';
        return [r.student_no, r.name, r.present, r.late, r.absent, r.leave, rate].join(',');
      }).join('\n');
      const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `考勤月报_${expMonth}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExpOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const load = () => api.get(`/attendance?date=${date}`).then(setData).catch(console.error);
  useEffect(() => { load(); }, [date]);
  useEffect(() => { api.get('/students').then(setStudents).catch(console.error); }, []);

  // 初始化草稿 = 已有记录 + 未点名学生默认出勤
  useEffect(() => {
    const map = {};
    students.forEach(s => {
      const rec = data.records.find(r => r.student_id === s.id);
      map[s.id] = { status: rec?.status || '出勤', remark: rec?.remark || '' };
    });
    setDraft(map);
  }, [students, data]);

  const summary = useMemo(() => {
    const s = {};
    STATUSES.forEach(st => (s[st] = 0));
    Object.values(draft).forEach(d => { s[d.status] = (s[d.status] || 0) + 1; });
    return s;
  }, [draft]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/attendance', {
        date,
        items: Object.entries(draft).map(([student_id, v]) => ({ student_id: +student_id, ...v })),
      });
      await load();
      alert('考勤已保存');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="考勤记录管理"
        desc="每日点名与考勤状态跟踪"
        action={
          <div className="flex items-center gap-3">
            <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={`${inputCls} w-auto`} />
            <Button variant="secondary" onClick={openExport}><Download size={16} />月报导出</Button>
            <Button onClick={save} disabled={saving || !students.length}><Save size={16} />{saving ? '保存中…' : '保存考勤'}</Button>
          </div>
        }
      />

      {/* 汇总 */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map(st => (
          <div key={st} className="card flex items-center justify-between p-4">
            <Badge tone={statusTone[st]}>{st}</Badge>
            <span className="text-xl font-semibold">{summary[st] || 0}</span>
          </div>
        ))}
      </div>

      {students.length === 0 ? <Empty text="暂无学生，请先在班级成员页添加" /> : (
        <div className="card divide-y divide-black/5">
          {students.map(s => {
            const d = draft[s.id] || { status: '出勤', remark: '' };
            return (
              <div key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex w-full items-center gap-3 sm:w-56">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${s.gender === '女' ? 'bg-gradient-to-br from-[#ff9500] to-[#ffcc00]' : 'brand-gradient'}`}>
                    {s.name[0]}
                  </div>
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-ink-secondary">{s.student_no} · {s.class_name}</div>
                  </div>
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {STATUSES.map(st => (
                    <button
                      key={st}
                      onClick={() => setDraft({ ...draft, [s.id]: { ...d, status: st } })}
                      className={`btn-pill px-3.5 py-1.5 text-sm font-medium transition ${
                        d.status === st
                          ? { 出勤: 'bg-[#28cd41] text-white', 迟到: 'bg-[#ff9500] text-white', 请假: 'bg-[#0071e3] text-white', 缺勤: 'bg-[#ff3b30] text-white' }[st]
                          : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.08]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <input
                  placeholder="备注（可选）"
                  className={`${inputCls} w-full sm:w-48`}
                  value={d.remark}
                  onChange={e => setDraft({ ...draft, [s.id]: { ...d, remark: e.target.value } })}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-sm text-ink-secondary">
        <CalendarCheck size={15} />
        共 {students.length} 名学生 · 修改状态后记得点击「保存考勤」
      </div>

      {/* 月报导出弹窗 */}
      <Modal open={expOpen} onClose={() => setExpOpen(false)} title="导出考勤月报">
        <div className="space-y-4">
          <Field label="班级">
            <select className={inputCls} value={expClass} onChange={e => setExpClass(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="月份">
            <input type="month" className={inputCls} value={expMonth} onChange={e => setExpMonth(e.target.value)} />
          </Field>
          <Button className="w-full justify-center" onClick={doExport} disabled={exporting || !expClass}>
            <Download size={15} />{exporting ? '导出中…' : '导出 CSV'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
