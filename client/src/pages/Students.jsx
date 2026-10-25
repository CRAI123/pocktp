import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Phone, MessageCircle, Download, Upload, Keyboard, CheckCircle2, Users, ClipboardPaste } from 'lucide-react';
import { api } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Badge, Empty, SkeletonList } from '../components/ui.jsx';

const EMPTY_FORM = {
  class_id: '', name: '', gender: '男', student_no: '', parent_phone: '', parent_wechat: '',
  school: '', current_class: '', status: '在读',
  cohort: '', university: '', major: '', fee: '', destination: '',
};
const STATUSES = ['在读', '毕业', '流失'];
const STATUS_TONE = { 在读: 'green', 毕业: 'blue', 流失: 'orange' };

/** 必填星号 */
const Star = () => <span className="ml-0.5 text-[#ff3b30]">*</span>;
/** 键位提示 */
const Kbd = ({ children }) => (
  <kbd className="mx-0.5 inline-block rounded-md border border-black/10 bg-white px-1.5 py-px font-sans text-[11px] font-semibold text-ink shadow-sm">{children}</kbd>
);

/** 解析一行 CSV：支持双引号包裹与 "" 转义（与导出格式对应） */
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuote = false;
      } else cur += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export default function Students() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  /* 快速添加：保存中状态 / 行内错误 / 本次连续添加计数 / 各输入框引用（空格跳格用） */
  const [saving, setSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  /* 粘贴名单模式：single=逐人录入 / batch=整批粘贴（每行一个姓名） */
  const [addMode, setAddMode] = useState('single');
  const [batchText, setBatchText] = useState('');
  const [batchGender, setBatchGender] = useState('男');
  const [batchResult, setBatchResult] = useState(null);
  const quickRefs = useRef([]);
  const classRef = useRef(null);

  const load = () => api.get(`/students${filter ? `?class_id=${filter}` : ''}`).then(setStudents).catch(console.error).finally(() => setLoading(false));
  useEffect(() => { api.get('/classes').then(setClasses).catch(console.error); }, []);
  useEffect(() => { load(); }, [filter]);

  /* ---- CSV 导出（带 BOM，Excel 直接打开不乱码） ---- */
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);

  const exportCsv = () => {
    const head = '姓名,性别,学号,班级,就读学校,就读班级,学员状态,届别,考取大学,专业,学费,毕业去向,家长电话,家长微信\n';
    const body = students.map(s =>
      [s.name, s.gender, s.student_no, s.class_name, s.school, s.current_class, s.status || '在读',
        s.cohort, s.university, s.major, s.fee, s.destination, s.parent_phone, s.parent_wechat]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filter ? classes.find(c => String(c.id) === filter)?.name || '学生名单' : '全部学生'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** 下载一个 CSV（BOM 防 Excel 乱码） */
  const downloadCsv = (filename, head, lines) => {
    const blob = new Blob(['﻿' + head + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /**
   * 学员台账一键导出：学员信息 / 课时记录 / 费用与考勤 三张表
   * 作用域跟随当前班级筛选（全部班级时导出全部）
   */
  const exportLedger = async () => {
    if (!students.length) return;
    setLedgerBusy(true);
    try {
      const scopeName = filter ? (classes.find(c => String(c.id) === filter)?.name || '班级') : '全部班级';
      const classIds = [...new Set(students.map(s => s.class_id))];

      /* 表 1：学员信息 */
      downloadCsv(`${scopeName}_学员信息.csv`,
        '姓名,性别,学号,班级,就读学校,就读班级,学员状态,届别,考取大学,专业,学费,毕业去向,家长电话,家长微信\n',
        students.map(s => [s.name, s.gender, s.student_no, s.class_name, s.school, s.current_class, s.status || '在读',
          s.cohort, s.university, s.major, s.fee, s.destination, s.parent_phone, s.parent_wechat]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      );

      /* 表 2：课时记录（按班级筛选时只取该班） */
      const lesson = await api.get('/lesson-logs?month=all');
      const lessons = filter ? lesson.rows.filter(r => String(r.class_id) === String(filter)) : lesson.rows;
      downloadCsv(`${scopeName}_课时记录.csv`, '日期,班级,课程,课时,单价,课时费,备注\n',
        lessons.map(r => [r.date, r.class_name || '', r.course_name || '', r.hours, r.rate,
          (Number(r.hours) * Number(r.rate)).toFixed(2), `"${(r.note || '').replace(/"/g, '""')}"`].join(','))
      );

      /* 表 3：费用与考勤（当月出勤统计 + 学费） */
      const month = new Date().toISOString().slice(0, 7);
      const att = await Promise.all(classIds.map(id => api.get(`/classes/${id}/attendance-monthly?month=${month}`)));
      const attMap = {};
      att.forEach(d => d.rows.forEach(r => { attMap[r.student_id] = r; }));
      downloadCsv(`${scopeName}_费用与考勤_${month}.csv`,
        '姓名,学号,班级,出勤,迟到,缺勤,请假,出勤率,学费(元)\n',
        students.map(s => {
          const a = attMap[s.id] || {};
          const total = (+a.present || 0) + (+a.late || 0) + (+a.absent || 0) + (+a.leave || 0);
          const rate = total ? (((+a.present + +a.late) / total) * 100).toFixed(1) + '%' : '—';
          return [s.name, s.student_no, s.class_name, a.present ?? 0, a.late ?? 0, a.absent ?? 0, a.leave ?? 0, rate, Number(s.fee) || 0].join(',');
        })
      );
    } finally {
      setLedgerBusy(false);
    }
  };

  /* ---- CSV 导入：支持本页导出的完整表头（学校/学员状态等），也兼容旧版 5 列无表头 ---- */
  const importCsv = async (file) => {
    if (!file) return;
    if (!filter) { alert('请先在上方选择一个班级卡片，再导入该班学生'); return; }
    setImporting(true);
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let cols = {
        name: 0, gender: 1, student_no: 2, parent_phone: 3, parent_wechat: 4,
        school: -1, current_class: -1, status: -1, cohort: -1, university: -1, major: -1, fee: -1, destination: -1,
      };
      if (lines.length && lines[0].includes('姓名')) {
        const h = parseCsvLine(lines.shift()).map(x => x.trim());
        const find = (...keys) => {
          for (const k of keys) { const i = h.findIndex(x => x.includes(k)); if (i >= 0) return i; }
          return -1;
        };
        cols = {
          name: find('姓名'), gender: find('性别'), student_no: find('学号'),
          parent_phone: find('电话'), parent_wechat: find('微信'),
          school: find('学校'), current_class: find('就读班级'), status: find('状态'),
          cohort: find('届别'), university: find('大学', '考取'), major: find('专业'),
          fee: find('学费', '费用'), destination: find('去向'),
        };
      }
      const pick = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
      let ok = 0, fail = 0;
      for (const line of lines) {
        const r = parseCsvLine(line).map(s => (s || '').trim());
        const name = pick(r, cols.name);
        if (!name) { fail++; continue; }
        try {
          await api.post('/students', {
            class_id: filter, name,
            gender: pick(r, cols.gender) === '女' ? '女' : '男',
            student_no: pick(r, cols.student_no),
            parent_phone: pick(r, cols.parent_phone),
            parent_wechat: pick(r, cols.parent_wechat),
            school: pick(r, cols.school),
            current_class: pick(r, cols.current_class),
            status: STATUSES.includes(pick(r, cols.status)) ? pick(r, cols.status) : '在读',
            cohort: pick(r, cols.cohort),
            university: pick(r, cols.university),
            major: pick(r, cols.major),
            fee: Number(pick(r, cols.fee)) || 0,
            destination: pick(r, cols.destination),
          });
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
    setForm({
      class_id: s.class_id, name: s.name, gender: s.gender, student_no: s.student_no,
      parent_phone: s.parent_phone, parent_wechat: s.parent_wechat,
      school: s.school || '', current_class: s.current_class || '', status: s.status || '在读',
      cohort: s.cohort || '', university: s.university || '', major: s.major || '',
      fee: s.fee ? String(s.fee) : '', destination: s.destination || '',
    });
    setOpen(true);
  };

  /** 打开添加弹窗：默认带入当前选中的班级，重置连续计数与批量状态 */
  const openCreate = () => {
    setEditingId(null);
    setQuickError('');
    setAddedCount(0);
    setAddMode('single');
    setBatchText('');
    setBatchResult(null);
    setForm({ ...EMPTY_FORM, class_id: filter || '' });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditingId(null);
    setQuickError('');
    setAddMode('single');
    setBatchText('');
    setBatchResult(null);
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

  /**
   * 解析粘贴名单：每行一个姓名；行内可用空格/逗号/顿号/制表符附带性别（如「李四 女」「王五，女」），
   * 未标注性别的行使用 defGender
   */
  const parseBatch = (text, defGender) =>
    text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split(/[\s,，、\t]+/).filter(Boolean);
      const name = parts.find(p => p !== '男' && p !== '女') || '';
      const g = parts.find(p => p === '男' || p === '女');
      return { name, gender: g || defGender };
    }).filter(p => p.name);

  const batchItems = parseBatch(batchText, batchGender);

  /** 批量添加：顺序 POST（与 CSV 导入同一约定），全部成功则清空名单框便于再粘下一批 */
  const saveBatch = async () => {
    if (saving) return;
    if (!form.class_id) { setQuickError('请先选择班级'); classRef.current?.focus(); return; }
    if (!batchItems.length) { setQuickError('请先粘贴名单，每行一个姓名'); return; }
    setSaving(true);
    setQuickError('');
    setBatchResult(null);
    let ok = 0, fail = 0;
    for (const it of batchItems) {
      try {
        await api.post('/students', { class_id: form.class_id, name: it.name, gender: it.gender });
        ok++;
      } catch { fail++; }
    }
    setSaving(false);
    setBatchResult({ ok, fail });
    setAddedCount(n => n + ok);
    load();
    api.get('/classes').then(setClasses);
    if (!fail) setBatchText('');
  };

  return (
    <div>
      <SectionHeader
        title="班级成员管理"
        desc="学生档案与家长联系方式"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportLedger} disabled={!students.length || ledgerBusy} title="导出学员信息 / 课时记录 / 费用与考勤三张表">
              <Download size={15} />{ledgerBusy ? '导出中…' : '学员台账（3 表）'}
            </Button>
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

      {/* 学员状态筛选 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-secondary">学员状态</span>
        {['全部', ...STATUSES].map(st => {
          const n = st === '全部' ? students.length : students.filter(s => (s.status || '在读') === st).length;
          return (
            <button key={st} onClick={() => setStatusFilter(st)}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === st ? 'brand-gradient text-white shadow' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
              }`}>{st} <span className="opacity-70">{n}</span></button>
          );
        })}
      </div>

      {loading ? <SkeletonList rows={4} /> : students.length === 0 ? (
        <Empty
          icon={Users}
          text="该班级暂无学生"
          desc="添加学生后即可进行考勤、成绩与德育管理"
          action={<Button onClick={openCreate}><Plus size={16} />添加学生</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="bg-bg-light text-left text-ink-secondary">
                  <th className="px-6 py-3 font-medium">学号</th>
                  <th className="px-6 py-3 font-medium">姓名</th>
                  <th className="px-6 py-3 font-medium">学员状态</th>
                  <th className="px-6 py-3 font-medium">升学 / 去向</th>
                  <th className="px-6 py-3 font-medium">班级</th>
                  <th className="px-6 py-3 font-medium">家长联系</th>
                  <th className="px-6 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {(statusFilter === '全部' ? students : students.filter(s => (s.status || '在读') === statusFilter)).map(s => (
                  <tr key={s.id} className="group hover:bg-bg-light/60">
                    <td className="px-6 py-3.5 text-ink-secondary">{s.student_no}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${s.gender === '女' ? 'bg-gradient-to-br from-[#ff9500] to-[#ffcc00]' : 'brand-gradient'}`}>
                          {s.name[0]}
                        </div>
                        <div>
                          <div>{s.name}</div>
                          {(s.school || s.current_class) && (
                            <div className="text-xs text-ink-secondary">{[s.school, s.current_class].filter(Boolean).join(' · ')}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5"><Badge tone={STATUS_TONE[s.status] || 'gray'}>{s.status || '在读'}</Badge></td>
                    <td className="px-6 py-3.5">
                      {s.status === '毕业' && (s.cohort || s.university || s.destination) ? (
                        <div className="text-xs leading-relaxed">
                          {s.cohort && <span className="mr-1.5 rounded bg-black/[0.05] px-1.5 py-0.5">{s.cohort}</span>}
                          <span className="text-ink">{[s.university, s.major].filter(Boolean).join(' · ')}</span>
                          {s.destination && <div className="text-ink-secondary">{s.destination}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-secondary">—</span>
                      )}
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
        {/* 录入方式切换（仅添加模式） */}
        {!editingId && (
          <div className="mb-4 flex gap-1 rounded-xl bg-black/[0.04] p-1">
            {[{ k: 'single', label: '逐人录入', icon: Keyboard }, { k: 'batch', label: '粘贴名单', icon: ClipboardPaste }].map(m => (
              <button key={m.k} type="button"
                onClick={() => { setAddMode(m.k); setQuickError(''); setBatchResult(null); }}
                className={`btn-pill flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                  addMode === m.k ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'text-ink-secondary hover:bg-black/[0.05]'
                }`}>
                <m.icon size={15} />{m.label}
              </button>
            ))}
          </div>
        )}

        {editingId || addMode === 'single' ? (
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="就读学校（选填）">
              <input
                ref={el => (quickRefs.current[5] = el)}
                className={inputCls} value={form.school}
                placeholder="如：实验中学"
                onKeyDown={onFieldKeyDown(5)}
                onChange={e => setForm({ ...form, school: e.target.value })}
              />
            </Field>
            <Field label="就读班级（选填）">
              <input
                ref={el => (quickRefs.current[6] = el)}
                className={inputCls} value={form.current_class}
                placeholder="如：初二(3)班"
                onKeyDown={onFieldKeyDown(6)}
                onChange={e => setForm({ ...form, current_class: e.target.value })}
              />
            </Field>
          </div>

          <Field label="学员状态">
            <select
              ref={el => (quickRefs.current[7] = el)}
              className={inputCls} value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              {STATUSES.map(st => <option key={st}>{st}</option>)}
            </select>
          </Field>

          {/* 毕业 / 升学归档：仅编辑时或标记为毕业时展开，避免拖慢日常录入 */}
          {(editingId || form.status === '毕业') && (
            <div className="space-y-4 rounded-xl bg-black/[0.025] p-4">
              <div className="text-xs font-semibold text-ink-secondary">毕业 / 升学归档（选填）</div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="届别">
                  <input
                    ref={el => (quickRefs.current[8] = el)}
                    className={inputCls} placeholder="如：2026 届" value={form.cohort}
                    onKeyDown={onFieldKeyDown(8)}
                    onChange={e => setForm({ ...form, cohort: e.target.value })}
                  />
                </Field>
                <Field label="学费（元）">
                  <input
                    ref={el => (quickRefs.current[9] = el)}
                    type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={form.fee}
                    onKeyDown={onFieldKeyDown(9)}
                    onChange={e => setForm({ ...form, fee: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="考取大学 / 去向学校">
                  <input
                    ref={el => (quickRefs.current[10] = el)}
                    className={inputCls} placeholder="如：华东师范大学" value={form.university}
                    onKeyDown={onFieldKeyDown(10)}
                    onChange={e => setForm({ ...form, university: e.target.value })}
                  />
                </Field>
                <Field label="专业">
                  <input
                    ref={el => (quickRefs.current[11] = el)}
                    className={inputCls} placeholder="如：汉语言文学" value={form.major}
                    onKeyDown={onFieldKeyDown(11)}
                    onChange={e => setForm({ ...form, major: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="毕业去向说明">
                <input
                  ref={el => (quickRefs.current[12] = el)}
                  className={inputCls} placeholder="如：已就业 / 复读 / 出国" value={form.destination}
                  onKeyDown={onFieldKeyDown(12)}
                  onChange={e => setForm({ ...form, destination: e.target.value })}
                />
              </Field>
            </div>
          )}

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
        ) : (
        /* ---- 粘贴名单模式：每行一个姓名，可选行内标注性别 ---- */
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-[#0071e3]/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-[#0a66c2]">
            <ClipboardPaste size={14} className="mt-0.5 shrink-0" />
            <span>
              从 Excel、微信或记事本复制名单直接粘贴，<b>每行一个姓名</b>；需要标注性别时在姓名后加空格或逗号（如「李四 女」），未标注的按下方默认性别。
            </span>
          </div>

          <Field label={<span>班级<Star /></span>}>
            <select
              ref={classRef} className={inputCls}
              value={form.class_id}
              onChange={e => setForm({ ...form, class_id: e.target.value })}
            >
              <option value="">请选择</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="默认性别（名单里未标注时使用）">
            <div className="flex gap-1.5">
              {['男', '女'].map(g => (
                <button key={g} type="button" onClick={() => setBatchGender(g)}
                  className={`btn-pill px-4 py-2 text-sm font-medium transition ${
                    batchGender === g ? 'brand-gradient text-white' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
                  }`}>{g}</button>
              ))}
            </div>
          </Field>

          <Field label={<span>名单<Star />（每行一个姓名）</span>}>
            <textarea
              autoFocus rows={8} value={batchText}
              onChange={e => { setBatchText(e.target.value); setBatchResult(null); }}
              placeholder={'张三\n李四 女\n王五，男'}
              className={`${inputCls} resize-y`}
            />
          </Field>

          {batchItems.length > 0 && (
            <div className="text-xs text-ink-secondary">
              已识别 <b className="text-ink">{batchItems.length}</b> 人，将统一加入所选班级
              {batchItems.some(i => i.gender !== batchGender) ? '（含行内标注性别）' : ''}
            </div>
          )}

          {batchResult && (
            <div className={`rounded-xl px-4 py-2.5 text-sm ${batchResult.fail ? 'bg-[#ff9500]/10 text-[#c93400]' : 'bg-[#28cd41]/10 text-[#1fa733]'}`}>
              成功添加 {batchResult.ok} 人{batchResult.fail ? `，失败 ${batchResult.fail} 人（名单保留，可重试）` : ''}
            </div>
          )}

          {quickError && (
            <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{quickError}</div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="min-h-[28px]">
              {addedCount > 0 && (
                <Badge tone="green">
                  <CheckCircle2 size={12} />本次已添加 {addedCount} 人
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 gap-3">
              <Button type="button" variant="secondary" onClick={closeModal}>关闭</Button>
              <Button type="button" disabled={saving || !batchItems.length} onClick={saveBatch}>
                {saving ? '添加中…' : `批量添加${batchItems.length ? ` ${batchItems.length} 人` : ''}`}
              </Button>
            </div>
          </div>
        </div>
        )}
      </Modal>
    </div>
  );
}

