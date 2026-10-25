/** 课程表：班级课表（排课/导入导出）+ 我的课表（跨班级汇总 + 上课提醒设置） */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Download, Upload, Plus, Trash2, Loader2, BellRing, Settings2, Clock3, UserRound } from 'lucide-react';
import { api, auth } from '../api.js';
import { SectionHeader, Button, Modal, Field, inputCls, Empty } from '../components/ui.jsx';
import { classRemindEnabled, setClassRemindEnabled } from '../components/LessonReminders.jsx';
import { DEFAULT_SLOTS, periodRange, todayWeekday, wdLabel, WEEKDAY_LABELS, fmtMin } from '../timetable.js';

const WEEKDAYS = WEEKDAY_LABELS.map((l, i) => ({ v: i + 1, l }));
const COMMON_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '科学', '信息技术', '体育', '音乐', '美术', '班会', '自习'];

/* 科目配色：同科目恒定，便于快速扫视 */
const PALETTE = [
  'bg-[#0071e3]/10 text-[#0059b3]', 'bg-[#28cd41]/12 text-[#1a7f2b]', 'bg-[#ff9500]/12 text-[#a85300]',
  'bg-[#af52de]/10 text-[#7b2f9e]', 'bg-[#ff3b30]/10 text-[#b3251c]', 'bg-[#5ac8fa]/15 text-[#0b6e94]',
  'bg-[#ffcc00]/15 text-[#7a5b00]', 'bg-[#5856d6]/10 text-[#3b398f]',
];
const colorOf = (s) => PALETTE[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

/* 兼容 Excel 里的「周一 / 星期一 / 1」 */
function parseWeekday(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (n >= 1 && n <= 7) return n;
  const s = String(v).trim();
  const m = s.match(/^(?:周|星期)([一二三四五六日天])$/);
  if (m) return '一二三四五六日'.indexOf(m[1]) + 1 || 7;
  return 0;
}

const emptyEdit = (weekday, period) => ({ id: null, weekday, period, subject: '', teacher: '', note: '', is_mine: false });

export default function Timetable() {
  const [tab, setTab] = useState('class');
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState([]);
  const [mineRows, setMineRows] = useState([]);
  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(null);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const fileRef = useRef(null);
  const teacherName = auth.teacher?.name || '';

  useEffect(() => {
    api.get('/timetable-settings').then(setSlots).catch(console.error);
    api.get('/classes').then(cs => {
      setClasses(cs);
      if (cs.length) setClassId(String(cs[0].id));
    }).catch(console.error);
    api.get('/timetables?mine=1').then(setMineRows).catch(console.error);
    const t = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    if (!classId) return;
    setLoading(true); setErr('');
    try { setRows(await api.get(`/timetables?class_id=${classId}`)); }
    catch (e) { setErr(e.message || '加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [classId]);

  const loadMine = () => api.get('/timetables?mine=1').then(setMineRows).catch(() => {});

  /* 从「我的课表」点课 → 切到对应班级课表并直接打开该格 */
  useEffect(() => {
    if (!pending || String(pending.class_id) !== classId) return;
    const r = rows.find(x => Number(x.weekday) === pending.weekday && Number(x.period) === pending.period);
    setEdit(r
      ? { id: r.id, weekday: r.weekday, period: r.period, subject: r.subject, teacher: r.teacher || '', note: r.note || '', is_mine: !!r.is_mine }
      : emptyEdit(pending.weekday, pending.period));
    setPending(null);
  }, [rows, pending, classId]);

  const maxPeriod = Math.max(Number(slots.periods) || 8, ...rows.map(r => Number(r.period) || 0), ...mineRows.map(r => Number(r.period) || 0));
  const periods = Array.from({ length: Math.min(15, maxPeriod) }, (_, i) => i + 1);
  const cellMap = new Map(rows.map(r => [`${r.weekday}-${r.period}`, r]));
  const current = classes.find(c => String(c.id) === classId);

  /* 我的课按「星期-节次」聚合（同一格可能带多个班） */
  const mineMap = useMemo(() => {
    const m = new Map();
    for (const r of mineRows) {
      const k = `${r.weekday}-${r.period}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }, [mineRows]);

  const todayList = useMemo(() => {
    const wd = todayWeekday(new Date());
    return mineRows.filter(r => Number(r.weekday) === wd)
      .map(r => ({ ...r, range: periodRange(slots, Number(r.period)) }))
      .sort((a, b) => (a.range.startMin ?? 1e9) - (b.range.startMin ?? 1e9));
  }, [mineRows, slots]);

  const openCell = (weekday, period) => {
    const exist = cellMap.get(`${weekday}-${period}`);
    setEdit(exist
      ? { id: exist.id, weekday: exist.weekday, period: exist.period, subject: exist.subject, teacher: exist.teacher || '', note: exist.note || '', is_mine: !!exist.is_mine }
      : emptyEdit(weekday, period));
  };

  const setTeacher = (v) => {
    /* 任课教师填成本人姓名时，自动标记为「我的课」 */
    const auto = !!teacherName && v.trim() === teacherName;
    setEdit(e => ({ ...e, teacher: v, is_mine: auto ? true : e.is_mine }));
  };

  const save = async () => {
    if (!edit?.subject.trim()) return;
    setSaving(true);
    try {
      const payload = { subject: edit.subject.trim(), teacher: edit.teacher, note: edit.note, is_mine: !!edit.is_mine };
      if (edit.id) await api.put(`/timetables/${edit.id}`, payload);
      else await api.post('/timetables', { class_id: classId, weekday: edit.weekday, period: edit.period, ...payload });
      setEdit(null);
      await Promise.all([load(), loadMine()]);
    } catch (e) { setErr(e.message || '保存失败'); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!edit?.id || !confirm('确认删除这节课？')) return;
    setSaving(true);
    try { await api.del(`/timetables/${edit.id}`); setEdit(null); await Promise.all([load(), loadMine()]); }
    catch (e) { setErr(e.message || '删除失败'); } finally { setSaving(false); }
  };

  const gotoClass = (r) => {
    setTab('class');
    setPending({ class_id: r.class_id, weekday: Number(r.weekday), period: Number(r.period) });
    if (String(r.class_id) === classId) {
      /* 已是当前班级：直接按已有数据打开 */
      setEdit({ id: r.id, weekday: r.weekday, period: r.period, subject: r.subject, teacher: r.teacher || '', note: r.note || '', is_mine: !!r.is_mine });
      setPending(null);
    } else {
      setClassId(String(r.class_id));
    }
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const aoa = [
      ['星期', '节次', '科目', '教师', '备注', '我的课'],
      ...rows.map(r => [wdLabel(r.weekday), r.period, r.subject, r.teacher || '', r.note || '', r.is_mine ? '是' : '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, '班级课表');
    XLSX.writeFile(wb, `${current?.name || '班级'}课表.xlsx`);
  };

  const importExcel = async (file) => {
    if (!file) return;
    setImporting(true); setErr('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
      /* 找到含「星期」的表头行，之后逐行解析（兼容模板已有说明行） */
      const headIdx = aoa.findIndex(r => r.some(c => String(c || '').includes('星期')));
      const body = headIdx >= 0 ? aoa.slice(headIdx + 1) : aoa;
      const items = [];
      for (const r of body) {
        if (!r || !r.length) continue;
        const weekday = parseWeekday(r[0]);
        const period = Number(r[1]);
        const subject = String(r[2] || '').trim();
        if (!weekday || !(period >= 1 && period <= 15) || !subject) continue;
        const mineRaw = String(r[5] || '').trim();
        const item = { weekday, period, subject, teacher: String(r[3] || '').trim(), note: String(r[4] || '').trim() };
        if (/^(是|1|我的课|mine)$/i.test(mineRaw)) item.is_mine = true;
        items.push(item);
      }
      if (!items.length) {
        setErr('未解析到有效行，请确认列顺序为：星期 / 节次 / 科目 / 教师 / 备注 / 我的课');
        return;
      }
      const res = await api.post('/timetables/bulk', { class_id: classId, items });
      await Promise.all([load(), loadMine()]);
      alert(`已导入 ${res.count} 条课表记录（同格覆盖）`);
    } catch (e) {
      setErr(e.message || '导入失败');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /* 今日课程状态文案 */
  const nowMin = (() => { const d = new Date(tick); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; })();
  const todayState = (range) => {
    if (range.startMin == null) return { text: '未设置时间', tone: 'text-[#ff9500]' };
    if (nowMin < range.startMin) return { text: `距上课 ${Math.max(1, Math.ceil(range.startMin - nowMin))} 分钟`, tone: 'text-[#0071e3]' };
    if (nowMin < range.endMin) return { text: '正在上课', tone: 'text-[#1f9e33]' };
    return { text: '已结束', tone: 'text-ink-secondary/60' };
  };

  return (
    <div>
      <SectionHeader
        title="课程表"
        desc={tab === 'class' ? '按周排课，单击格子录入；勾选「我的课」后会在开课前 10 / 5 分钟提醒' : '跨班级汇总我任教的课，开课前 10 / 5 分钟自动提醒'}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'class' && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => importExcel(e.target.files?.[0])} />
                <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!classId || importing}>
                  {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{importing ? '导入中…' : '导入 Excel'}
                </Button>
                <Button variant="secondary" onClick={exportExcel} disabled={!rows.length}><Download size={16} />导出 Excel</Button>
              </>
            )}
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Settings2 size={16} />作息与提醒</Button>
          </div>
        )}
      />

      {/* 视图切换 */}
      <div className="mb-4 inline-flex rounded-full bg-black/[0.04] p-1">
        {[['class', '班级课表', CalendarDays], ['mine', '我的课表', UserRound]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === key ? 'bg-white text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'}`}>
            <Icon size={15} />{label}
            {key === 'mine' && todayList.length > 0 && <span className="rounded-full bg-[#0071e3]/10 px-1.5 text-[11px] text-[#0071e3]">{todayList.length}</span>}
          </button>
        ))}
      </div>

      {/* ---------- 班级课表 ---------- */}
      {tab === 'class' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {classes.map(c => (
              <button key={c.id} onClick={() => setClassId(String(c.id))}
                className={`btn-pill px-4 py-1.5 text-sm font-medium transition ${classId === String(c.id) ? 'brand-gradient text-white shadow-md shadow-blue-500/20' : 'bg-white text-ink-secondary shadow-sm hover:text-ink'}`}>
                {c.name}
              </button>
            ))}
            {!classes.length && <span className="text-sm text-ink-secondary">还没有班级，先在「班级管理」创建</span>}
          </div>

          {err && <div className="mb-4 rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{err}</div>}

          {!classes.length ? <Empty icon={CalendarDays} text="暂无班级" desc="创建班级后即可排课" /> : loading ? (
            <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载课表…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-20 rounded-xl bg-black/[0.04] px-2 py-2 text-xs font-medium text-ink-secondary">节次</th>
                    {WEEKDAYS.map(w => (
                      <th key={w.v} className="rounded-xl bg-black/[0.04] px-2 py-2 text-xs font-medium text-ink-secondary">{w.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(p => {
                    const pr = periodRange(slots, p);
                    return (
                      <tr key={p}>
                        <td className="rounded-xl bg-black/[0.04] px-2 py-1.5 text-center">
                          <div className="text-xs font-medium text-ink-secondary">第 {p} 节</div>
                          <div className="text-[10px] tabular-nums text-ink-secondary/60">{pr.start ? `${pr.start}-${pr.end}` : '未设置'}</div>
                        </td>
                        {WEEKDAYS.map(w => {
                          const r = cellMap.get(`${w.v}-${p}`);
                          return (
                            <td key={w.v} className="p-0">
                              <button
                                onClick={() => openCell(w.v, p)}
                                className={`group flex h-16 w-full flex-col items-start justify-center gap-0.5 rounded-xl px-2.5 py-1.5 text-left transition ${
                                  r ? `${colorOf(r.subject)} hover:brightness-95` : 'bg-black/[0.02] text-ink-secondary/30 hover:bg-[#0071e3]/[0.06] hover:text-[#0071e3]'
                                }`}
                              >
                                {r ? (
                                  <>
                                    <span className="flex w-full items-center gap-1">
                                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.subject}</span>
                                      {!!r.is_mine && <span className="shrink-0 rounded-full bg-white/70 px-1.5 text-[10px] font-medium text-[#0071e3]">我的课</span>}
                                    </span>
                                    <span className="w-full truncate text-[11px] opacity-75">{r.teacher || '—'}{r.note ? ` · ${r.note}` : ''}</span>
                                  </>
                                ) : (
                                  <Plus size={15} className="mx-auto" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-ink-secondary">
            提示：导入模板列顺序为「星期 / 节次 / 科目 / 教师 / 备注 / 我的课」，星期可写「周一」或 1-7，同一格重复导入会覆盖。任课教师填成自己的名字会自动勾选「我的课」。
          </p>
        </>
      )}

      {/* ---------- 我的课表 ---------- */}
      {tab === 'mine' && (
        <>
          {err && <div className="mb-4 rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{err}</div>}

          {/* 今日课程 */}
          <div className="card mb-4 p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Clock3 size={16} className="text-[#0071e3]" />今日课程 · {wdLabel(todayWeekday(new Date()))}</h3>
              <button onClick={() => setSettingsOpen(true)} className="text-xs font-medium text-[#0071e3] hover:underline">
                {classRemindEnabled() ? '提醒已开启' : '提醒已关闭'} · 设置
              </button>
            </div>
            {todayList.length ? (
              <div className="space-y-2">
                {todayList.map(r => {
                  const st = todayState(r.range);
                  return (
                    <button key={r.id} onClick={() => gotoClass(r)}
                      className="flex w-full items-center gap-3 rounded-xl bg-bg-light px-3 py-2.5 text-left transition hover:bg-[#0071e3]/[0.06]">
                      <span className="w-24 shrink-0 text-xs font-medium tabular-nums text-ink-secondary">{r.range.start ? `${r.range.start}-${r.range.end}` : '未设置'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{r.subject}<span className="ml-2 text-xs font-normal text-ink-secondary">{r.class_name}</span></span>
                        <span className="block text-[11px] text-ink-secondary">第 {r.period} 节{r.note ? ` · ${r.note}` : ''}</span>
                      </span>
                      <span className={`shrink-0 text-xs font-medium ${st.tone}`}>{st.text}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-bg-light px-4 py-6 text-center text-sm text-ink-secondary">
                今天没有标记为「我的课」的课程。到班级课表里勾选即可。
              </div>
            )}
          </div>

          {/* 周视图 */}
          {mineRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-20 rounded-xl bg-black/[0.04] px-2 py-2 text-xs font-medium text-ink-secondary">节次</th>
                    {WEEKDAYS.map(w => <th key={w.v} className="rounded-xl bg-black/[0.04] px-2 py-2 text-xs font-medium text-ink-secondary">{w.l}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(p => {
                    const pr = periodRange(slots, p);
                    return (
                      <tr key={p}>
                        <td className="rounded-xl bg-black/[0.04] px-2 py-1.5 text-center">
                          <div className="text-xs font-medium text-ink-secondary">第 {p} 节</div>
                          <div className="text-[10px] tabular-nums text-ink-secondary/60">{pr.start ? `${pr.start}-${pr.end}` : '未设置'}</div>
                        </td>
                        {WEEKDAYS.map(w => {
                          const list = mineMap.get(`${w.v}-${p}`) || [];
                          const isToday = todayWeekday(new Date()) === w.v;
                          return (
                            <td key={w.v} className={`p-0 align-top ${isToday ? 'rounded-xl bg-[#0071e3]/[0.03]' : ''}`}>
                              <div className="flex min-h-16 flex-col gap-1 p-0.5">
                                {list.map(r => (
                                  <button key={r.id} onClick={() => gotoClass(r)}
                                    className={`flex flex-col items-start rounded-xl px-2 py-1.5 text-left transition hover:brightness-95 ${colorOf(r.subject)}`}>
                                    <span className="w-full truncate text-xs font-semibold">{r.subject}</span>
                                    <span className="w-full truncate text-[10px] opacity-75">{r.class_name}</span>
                                  </button>
                                ))}
                                {!list.length && <div className="min-h-14" />}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={BellRing} text="还没有「我的课」" desc="到班级课表里把任课教师填成自己，或勾选「我的课」，这里就会自动汇总，并在上课前提醒你" />
          )}

          <p className="mt-3 text-xs text-ink-secondary">
            提醒规则：开课前 10 分钟、5 分钟各提醒一次（同一天同一节课不重复）。网页端需保持页面打开并允许系统通知；桌面版最小化到托盘也能收到系统通知。
          </p>
        </>
      )}

      {/* 排课弹窗 */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `${wdLabel(edit.weekday)} · 第 ${edit.period} 节` : '排课'} width="max-w-md">
        {edit && (
          <div className="space-y-4">
            <Field label="科目">
              <input className={inputCls} list="tt-subjects" autoFocus value={edit.subject}
                onChange={e => setEdit({ ...edit, subject: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') save(); }}
                placeholder="如：语文" />
              <datalist id="tt-subjects">{COMMON_SUBJECTS.map(s => <option key={s} value={s} />)}</datalist>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="任课教师（选填）">
                <input className={inputCls} value={edit.teacher} onChange={e => setTeacher(e.target.value)} placeholder="如：张老师" />
              </Field>
              <Field label="备注（选填）">
                <input className={inputCls} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="如：多媒体教室" />
              </Field>
            </div>
            <button onClick={() => setEdit({ ...edit, is_mine: !edit.is_mine })}
              className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                edit.is_mine ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.06]' : 'border-black/10 bg-bg-light hover:bg-black/[0.03]'
              }`}>
              <span className={`grid h-5 w-5 place-items-center rounded-md border text-white transition ${edit.is_mine ? 'border-[#0071e3] bg-[#0071e3]' : 'border-black/20 bg-white'}`}>
                {edit.is_mine && <span className="text-[11px] leading-none">✓</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">这是我的课</span>
                <span className="block text-[11px] text-ink-secondary">勾选后会出现在「我的课表」，并在开课前 10 / 5 分钟提醒</span>
              </span>
              <BellRing size={16} className={edit.is_mine ? 'text-[#0071e3]' : 'text-ink-secondary/40'} />
            </button>
            <div className="flex items-center justify-end gap-2 pt-1">
              {edit.id && <Button variant="danger" onClick={remove} disabled={saving}><Trash2 size={15} />删除</Button>}
              <Button variant="secondary" onClick={() => setEdit(null)} disabled={saving}>取消</Button>
              <Button onClick={save} disabled={saving || !edit.subject.trim()}>{saving ? '保存中…' : '保存'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 作息与提醒设置 */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} slots={slots}
        onSaved={(s) => { setSlots(s); setSettingsOpen(false); }} />
    </div>
  );
}

/* 各校作息不同：以逐节起止时间为主，模板（节数/开始/时长/课间）只用于一键填充 */
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const genRows = ({ periods = 8, start_time = '08:00', class_minutes = 40, break_minutes = 10 }) => {
  const base = toMin(start_time);
  const cm = Math.max(10, Number(class_minutes) || 40);
  const bm = Math.max(0, Number(break_minutes) || 0);
  const step = cm + bm;
  const count = Math.min(15, Math.max(1, Number(periods) || 8));
  return Array.from({ length: count }, (_, i) => ({
    start: fmtMin(base + i * step),
    end: fmtMin(base + i * step + cm),
  }));
};
function rowsFromSlots(s) {
  const list = Array.isArray(s?.slots) ? s.slots : [];
  if (list.length) return list.map(x => ({ start: x.start, end: x.end }));
  return genRows(s || {});
}

function SettingsModal({ open, onClose, slots, onSaved }) {
  const [rows, setRows] = useState([]);
  const [tpl, setTpl] = useState(DEFAULT_SLOTS);
  const [remind, setRemind] = useState(classRemindEnabled());
  const [notifyState, setNotifyState] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(rowsFromSlots(slots));
    setTpl({
      periods: Number(slots?.periods) || DEFAULT_SLOTS.periods,
      start_time: slots?.start_time || DEFAULT_SLOTS.start_time,
      class_minutes: Number(slots?.class_minutes) || DEFAULT_SLOTS.class_minutes,
      break_minutes: Number(slots?.break_minutes ?? DEFAULT_SLOTS.break_minutes),
    });
    setRemind(classRemindEnabled());
    setErr('');
  }, [open, slots]);

  const setRow = (i, key, v) => setRows(list => list.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));

  const addRow = () => {
    if (rows.length >= 15) return;
    const last = rows[rows.length - 1];
    const breakMin = Math.max(0, Number(tpl.break_minutes) || 10);
    const classMin = Math.max(10, Number(tpl.class_minutes) || 40);
    if (!last?.end) { setRows(list => [...list, { start: tpl.start_time || '08:00', end: fmtMin(toMin(tpl.start_time || '08:00') + classMin) }]); return; }
    const startMin = toMin(last.end) + breakMin;
    setRows(list => [...list, { start: fmtMin(startMin), end: fmtMin(startMin + classMin) }]);
  };

  const removeRow = (i) => setRows(list => list.filter((_, idx) => idx !== i));

  const fillByTemplate = () => {
    setRows(genRows({ ...tpl, periods: Number(tpl.periods) || rows.length || 8 }));
  };

  const save = async () => {
    if (!rows.length) { setErr('至少需要填写一节课的时间'); return; }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.start || !r.end) { setErr(`第 ${i + 1} 节请填写完整的上课与下课时间`); return; }
      if (toMin(r.end) <= toMin(r.start)) { setErr(`第 ${i + 1} 节的下课时间需晚于上课时间`); return; }
    }
    setSaving(true); setErr('');
    try {
      const d = await api.put('/timetable-settings', {
        slots: rows.map((r, i) => ({ period: i + 1, start: r.start, end: r.end })),
      });
      setClassRemindEnabled(remind);
      onSaved(d);
    } catch (e) { setErr(e.message || '保存失败'); } finally { setSaving(false); }
  };

  const askNotify = async () => {
    if (typeof Notification === 'undefined') return;
    try { setNotifyState(await Notification.requestPermission()); } catch {}
  };

  return (
    <Modal open={open} onClose={onClose} title="作息时间与上课提醒" width="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl bg-bg-light px-3.5 py-2.5 text-xs leading-relaxed text-ink-secondary">
          各校作息不同，请按本校实际时间<strong className="text-ink">逐节填写上课与下课时间</strong>。提醒按这里的时间计算，未填写的节次不做提醒。
        </div>

        {/* 按模板一键填充（可选，填完仍可逐节修改） */}
        <div className="rounded-xl border border-black/[0.06]">
          <div className="px-3.5 pt-2.5 text-xs font-medium text-ink">按模板快速填充</div>
          <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-4">
            <Field label="每天节数">
              <input type="number" min="1" max="15" className={inputCls} value={tpl.periods}
                onChange={e => setTpl(f => ({ ...f, periods: e.target.value }))} />
            </Field>
            <Field label="第 1 节开始">
              <input type="time" className={inputCls} value={tpl.start_time}
                onChange={e => setTpl(f => ({ ...f, start_time: e.target.value }))} />
            </Field>
            <Field label="每节时长">
              <input type="number" min="10" max="120" className={inputCls} value={tpl.class_minutes}
                onChange={e => setTpl(f => ({ ...f, class_minutes: e.target.value }))} />
            </Field>
            <Field label="课间休息">
              <input type="number" min="0" max="60" className={inputCls} value={tpl.break_minutes}
                onChange={e => setTpl(f => ({ ...f, break_minutes: e.target.value }))} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-black/[0.06] px-3.5 py-2">
            <span className="text-[11px] text-ink-secondary">填充后可继续逐节调整（如大课间、午休）</span>
            <Button variant="secondary" onClick={fillByTemplate}>填充到下方</Button>
          </div>
        </div>

        {/* 逐节时间 */}
        <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-0.5">
          <div className="flex items-center justify-between text-xs font-medium text-ink-secondary">
            <span>逐节作息（共 {rows.length} 节）</span>
            <span className="font-normal text-ink-secondary/70">24 小时制</span>
          </div>
          {rows.map((r, i) => {
            const bad = r.start && r.end && toMin(r.end) <= toMin(r.start);
            return (
              <div key={i} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${bad ? 'border-[#ff3b30]/40 bg-[#ff3b30]/[0.04]' : 'border-black/[0.06] bg-white'}`}>
                <span className="w-12 shrink-0 text-xs font-medium text-ink-secondary">第 {i + 1} 节</span>
                <input type="time" className={`${inputCls} min-w-0 flex-1`} value={r.start}
                  onChange={e => setRow(i, 'start', e.target.value)} />
                <span className="text-xs text-ink-secondary/60">至</span>
                <input type="time" className={`${inputCls} min-w-0 flex-1`} value={r.end}
                  onChange={e => setRow(i, 'end', e.target.value)} />
                <button aria-label={`删除第 ${i + 1} 节`} title="删除本节" onClick={() => removeRow(i)}
                  className="shrink-0 rounded-lg p-1.5 text-ink-secondary/50 transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          {!rows.length && (
            <div className="rounded-xl bg-bg-light px-3.5 py-4 text-center text-xs text-ink-secondary">
              还没有节次，先「按模板填充」或点下方「添加一节」
            </div>
          )}
        </div>

        <button onClick={addRow} disabled={rows.length >= 15}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/15 py-2 text-xs font-medium text-ink-secondary transition hover:border-[#0071e3]/40 hover:text-[#0071e3] disabled:opacity-40">
          <Plus size={14} />添加一节
        </button>

        <button onClick={() => setRemind(v => !v)}
          className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${remind ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.06]' : 'border-black/10 bg-bg-light'}`}>
          <span className={`grid h-5 w-5 place-items-center rounded-md border text-white transition ${remind ? 'border-[#0071e3] bg-[#0071e3]' : 'border-black/20 bg-white'}`}>
            {remind && <span className="text-[11px] leading-none">✓</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">上课提醒</span>
            <span className="block text-[11px] text-ink-secondary">开课前 10 分钟、5 分钟各提醒一次</span>
          </span>
          <BellRing size={16} className={remind ? 'text-[#0071e3]' : 'text-ink-secondary/40'} />
        </button>

        {typeof Notification !== 'undefined' && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] px-3.5 py-2.5">
            <div className="text-xs text-ink-secondary">
              系统通知：{notifyState === 'granted' ? '已允许' : notifyState === 'denied' ? '已被浏览器拒绝（可在地址栏权限里恢复）' : '未开启'}
            </div>
            {notifyState === 'default' && <Button variant="secondary" onClick={askNotify}>允许通知</Button>}
          </div>
        )}

        {err && <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2 text-sm text-[#ff3b30]">{err}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </div>
      </div>
    </Modal>
  );
}
