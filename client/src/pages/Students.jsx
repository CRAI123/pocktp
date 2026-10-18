import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Phone, MessageCircle, Download, Upload } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty } from '../components/ui.jsx';

const EMPTY_FORM = { class_id: '', name: '', gender: '男', student_no: '', parent_phone: '', parent_wechat: '' };

export default function Students() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = () => api.get(`/students${filter ? `?class_id=${filter}` : ''}`).then(setStudents).catch(console.error);
  useEffect(() => { api.get('/classes').then(setClasses).catch(console.error); }, []);
  useEffect(() => { load(); }, [filter]);

  /* ---- CSV 导出（带 BOM，Excel 直接打开不乱码） ---- */
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const exportCsv = () => {
    const head = '姓名,性别,学号,班级,家长电话,家长微信\n';
    const body = students.map(s =>
      [s.name, s.gender, s.student_no, s.class_name, s.parent_phone, s.parent_wechat]
        .map(v => String(v ?? '')).join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filter ? classes.find(c => String(c.id) === filter)?.name || '学生名单' : '全部学生'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---- CSV 导入：列顺序 姓名,性别,学号,家长电话,家长微信（首行表头可省） ---- */
  const importCsv = async (file) => {
    if (!file) return;
    if (!filter) { alert('请先在上方选择一个班级卡片，再导入该班学生'); return; }
    setImporting(true);
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length && lines[0].includes('姓名')) lines.shift();
      let ok = 0, fail = 0;
      for (const line of lines) {
        const [name, gender, student_no, parent_phone, parent_wechat] = line.split(',').map(s => (s || '').trim());
        if (!name) { fail++; continue; }
        try {
          await api.post('/students', { class_id: filter, name, gender: gender === '女' ? '女' : '男', student_no, parent_phone, parent_wechat });
          ok++;
        } catch { fail++; }
      }
      alert(`导入完成：成功 ${ok} 条${fail ? `，失败 ${fail} 条` : ''}`);
      load();
      api.get('/classes').then(setClasses);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({ class_id: s.class_id, name: s.name, gender: s.gender, student_no: s.student_no, parent_phone: s.parent_phone, parent_wechat: s.parent_wechat });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (editingId) await api.put(`/students/${editingId}`, form);
    else await api.post('/students', form);
    setOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    load();
    api.get('/classes').then(setClasses);
  };

  return (
    <div>
      <SectionHeader
        title="班级成员管理"
        desc="学生档案与家长联系方式"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!students.length}><Download size={15} />导出 CSV</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
              <Upload size={15} />{importing ? '导入中…' : '导入 CSV'}
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => importCsv(e.target.files?.[0])} />
            <Button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setOpen(true); }}><Plus size={16} />添加学生</Button>
          </div>
        }
      />

      {/* 班级卡片 + 筛选 */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button onClick={() => setFilter('')} className={`card p-5 text-left transition ${!filter ? 'ring-2 ring-[#0071e3]' : 'card-hover'}`}>
          <div className="text-2xl font-semibold">{classes.reduce((s, c) => s + c.student_count, 0)}</div>
          <div className="text-sm text-ink-secondary">全部学生</div>
        </button>
        {classes.map(c => (
          <button key={c.id} onClick={() => setFilter(String(c.id))} className={`card p-5 text-left transition ${filter === String(c.id) ? 'ring-2 ring-[#0071e3]' : 'card-hover'}`}>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-semibold">{c.student_count}</div>
              <Badge tone="blue">{c.grade}</Badge>
            </div>
            <div className="text-sm font-medium">{c.name}</div>
            <div className="text-xs text-ink-secondary">{c.description}</div>
          </button>
        ))}
      </div>

      {students.length === 0 ? <Empty text="该班级暂无学生" /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-light text-left text-ink-secondary">
                  <th className="px-6 py-3 font-medium">学号</th>
                  <th className="px-6 py-3 font-medium">姓名</th>
                  <th className="px-6 py-3 font-medium">班级</th>
                  <th className="px-6 py-3 font-medium">家长联系</th>
                  <th className="px-6 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {students.map(s => (
                  <tr key={s.id} className="group hover:bg-bg-light/60">
                    <td className="px-6 py-3.5 text-ink-secondary">{s.student_no}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${s.gender === '女' ? 'bg-gradient-to-br from-[#ff9500] to-[#ffcc00]' : 'brand-gradient'}`}>
                          {s.name[0]}
                        </div>
                        {s.name}
                      </div>
                    </td>
                    <td className="px-6 py-3.5"><Badge tone="blue">{s.class_name}</Badge></td>
                    <td className="px-6 py-3.5 text-ink-secondary">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="flex items-center gap-1"><Phone size={12} />{s.parent_phone || '—'}</span>
                        <span className="flex items-center gap-1"><MessageCircle size={12} />{s.parent_wechat || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button onClick={() => openEdit(s)} className="btn-pill p-1.5 text-ink-secondary hover:bg-black/5"><Pencil size={15} /></button>
                      <button
                        onClick={async () => { if (confirm(`确认删除学生「${s.name}」？其考勤与成绩将一并删除。`)) { await api.del(`/students/${s.id}`); load(); } }}
                        className="btn-pill p-1.5 text-ink-secondary hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
                      ><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? '编辑学生' : '添加学生'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="姓名">
              <input required className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="性别">
              <select className={inputCls} value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                <option>男</option><option>女</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="班级">
              <select required disabled={!!editingId} className={inputCls} value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value })}>
                <option value="">请选择</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="学号">
              <input className={inputCls} value={form.student_no} onChange={e => setForm({ ...form, student_no: e.target.value })} />
            </Field>
          </div>
          <Field label="家长电话">
            <input className={inputCls} value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} />
          </Field>
          <Field label="家长微信">
            <input className={inputCls} value={form.parent_wechat} onChange={e => setForm({ ...form, parent_wechat: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>取消</Button>
            <Button type="submit">{editingId ? '保存修改' : '添加'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
