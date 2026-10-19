import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Phone, MessageCircle, Download, Upload, Keyboard, CheckCircle2 } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty } from '../components/ui.jsx';

const EMPTY_FORM = { class_id: '', name: '', gender: '男', student_no: '', parent_phone: '', parent_wechat: '' };

/** 必填星号 */
const Star = () => <span className="ml-0.5 text-[#ff3b30]">*</span>;
/** 键位提示 */
const Kbd = ({ children }) => (
  <kbd className="mx-0.5 inline-block rounded-md border border-black/10 bg-white px-1.5 py-px font-sans text-[11px] font-semibold text-ink shadow-sm">{children}</kbd>
);

export default function Students() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  /* 快速添加：保存中状态 / 行内错误 / 本次连续添加计数 / 各输入框引用（空格跳格用） */
  const [saving, setSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const quickRefs = useRef([]);
  const classRef = useRef(null);

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
    setQuickError('');
    setForm({ class_id: s.class_id, name: s.name, gender: s.gender, student_no: s.student_no, parent_phone: s.parent_phone, parent_wechat: s.parent_wechat });
    setOpen(true);
  };

  /** 打开添加弹窗：默认带入当前选中的班级，重置连续计数 */
  const openCreate = () => {
    setEditingId(null);
    setQuickError('');
    setAddedCount(0);
    setForm({ ...EMPTY_FORM, class_id: filter || '' });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditingId(null);
    setQuickError('');
    setForm(EMPTY_FORM);
  };

  /** 录入格键盘流：空格→下一格；回车→提交（IME 组词期间均不拦截，保证中文输入选词正常） */
  const onFieldKeyDown = (idx) => (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.code === 'Space') {
      e.preventDefault();
      quickRefs.current[idx + 1]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  /**
   * 保存一个学生
   * @param continueMode true=保存后清空并准备录入下一人（回车连录）；false=保存后关闭
   */
  const saveOne = async (continueMode) => {
    if (saving) return;
    if (!form.class_id) { setQuickError('请先选择班级'); classRef.current?.focus(); return; }
    if (!form.name.trim()) { setQuickError('姓名为必填项'); quickRefs.current[0]?.focus(); return; }
    setSaving(true);
    setQuickError('');
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, form);
        closeModal();
        return;
      }
      await api.post('/students', { ...form, name: form.name.trim() });
      load();
      api.get('/classes').then(setClasses);
      if (continueMode) {
        setAddedCount(n => n + 1);
        /* 班级保留，性别恢复默认男，个人信息清空，焦点回到姓名格 */
        setForm(f => ({ ...EMPTY_FORM, class_id: f.class_id }));
        setTimeout(() => quickRefs.current[0]?.focus(), 30);
      } else {
        closeModal();
      }
    } catch (err) {
      setQuickError(err.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
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
            <Button onClick={openCreate}><Plus size={16} />添加学生</Button>
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
            <table className="w-full min-w-[560px] text-sm">
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

      <Modal open={open} onClose={closeModal} title={editingId ? '编辑学生' : '快速添加学生'}>
        <form onSubmit={e => { e.preventDefault(); saveOne(true); }} className="space-y-4">
          {/* 键位操作提示（仅添加模式） */}
          {!editingId && (
            <div className="flex items-start gap-2 rounded-xl bg-[#0071e3]/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-[#0a66c2]">
              <Keyboard size={14} className="mt-0.5 shrink-0" />
              <span>
                每格填完按 <Kbd>空格</Kbd> 跳到下一格，<Kbd>回车</Kbd> 保存并自动添加下一人；性别格聚焦后用 ↑/↓ 切换；带 <Star /> 为必填，家长电话、微信选填。
              </span>
            </div>
          )}

          <Field label={<span>班级<Star /></span>}>
            <select
              ref={classRef} required disabled={!!editingId} className={inputCls}
              value={form.class_id}
              onKeyDown={e => { if (!e.nativeEvent.isComposing && e.key === 'Enter') { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
              onChange={e => setForm({ ...form, class_id: e.target.value })}
            >
              <option value="">请选择</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={<span>姓名<Star /></span>}>
              <input
                ref={el => (quickRefs.current[0] = el)}
                required autoFocus={!editingId} className={inputCls}
                value={form.name}
                onKeyDown={onFieldKeyDown(0)}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={<span>性别<Star /></span>}>
              <select
                ref={el => (quickRefs.current[1] = el)}
                className={inputCls} value={form.gender}
                onKeyDown={onFieldKeyDown(1)}
                onChange={e => setForm({ ...form, gender: e.target.value })}
              >
                <option>男</option><option>女</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="学号（选填）">
              <input
                ref={el => (quickRefs.current[2] = el)}
                className={inputCls} value={form.student_no}
                onKeyDown={onFieldKeyDown(2)}
                onChange={e => setForm({ ...form, student_no: e.target.value })}
              />
            </Field>
            <Field label="家长电话（选填）">
              <input
                ref={el => (quickRefs.current[3] = el)}
                inputMode="tel" className={inputCls} value={form.parent_phone}
                onKeyDown={onFieldKeyDown(3)}
                onChange={e => setForm({ ...form, parent_phone: e.target.value })}
              />
            </Field>
          </div>

          <Field label="家长微信（选填）">
            <input
              ref={el => (quickRefs.current[4] = el)}
              className={inputCls} value={form.parent_wechat}
              onKeyDown={onFieldKeyDown(4)}
              onChange={e => setForm({ ...form, parent_wechat: e.target.value })}
            />
          </Field>

          {quickError && (
            <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{quickError}</div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="min-h-[28px]">
              {!editingId && addedCount > 0 && (
                <Badge tone="green">
                  <CheckCircle2 size={12} />本次已添加 {addedCount} 人
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 gap-3">
              <Button type="button" variant="secondary" onClick={closeModal}>{editingId ? '取消' : '关闭'}</Button>
              {!editingId && (
                <Button type="button" variant="secondary" disabled={saving} onClick={() => saveOne(false)}>
                  保存并关闭
                </Button>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? '保存中…' : editingId ? '保存修改' : '保存并继续（回车）'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

