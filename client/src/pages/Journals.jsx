import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2, Wand2, Copy, RefreshCw, CalendarRange, Upload } from 'lucide-react';
import { api, ai, auth, todayStr } from '../api.js';
import { SectionHeader, Button, Modal, inputCls, Badge } from '../components/ui.jsx';

/** 取某天所在周的周一 YYYY-MM-DD（getDay: 周日=0 → 偏移 (getDay()+6)%7） */
function mondayOf(d = new Date()) {
  const t = new Date(d);
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return todayStr(t);
}

/** 班主任周记：按周 upsert 记录 + AI 汇总生成学期总结 */
export default function Journals() {
  const [list, setList] = useState([]);
  const [weekStart, setWeekStart] = useState(mondayOf());
  const [content, setContent] = useState('');
  const [curId, setCurId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /* 学期总结弹窗 */
  const [sumOpen, setSumOpen] = useState(false);
  const [sumPoints, setSumPoints] = useState('');
  const [sumText, setSumText] = useState('');
  const [sumLoading, setSumLoading] = useState(false);
  const [sumError, setSumError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = () => api.get('/journals').then(setList).catch(console.error);
  useEffect(() => { load(); }, []);

  /* 切换周：若该周已有记录则回填 */
  const pick = (ws) => {
    setWeekStart(ws);
    const hit = list.find(j => j.week_start === ws);
    setContent(hit?.content || '');
    setCurId(hit?.id || null);
    setSaved(false);
  };
  useEffect(() => { pick(mondayOf()); }, [list.length === 0]); // eslint-disable-line

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.put(`/journals/${weekStart}`, { content });
      await load();
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!curId) return;
    if (!confirm(`确认删除 ${weekStart} 这周的周记？`)) return;
    await api.del(`/journals/${curId}`);
    await load();
    pick(weekStart);
  };

  /* AI 学期总结：用户补充要点 + 自动拼接本学期全部周记（各截 300 字） */
  const genSummary = async () => {
    if (sumLoading) return;
    setSumLoading(true); setSumError(''); setCopied(false);
    try {
      const weeklyPart = list
        .filter(j => j.content)
        .map(j => `【${j.week_start} 周记】${j.content.slice(0, 300)}`)
        .join('\n');
      const points = [sumPoints.trim(), weeklyPart].filter(Boolean).join('\n\n本学期各周周记摘要：\n');
      if (!points.trim()) { setSumError('请先写几篇周记或补充要点'); setSumLoading(false); return; }
      const d = await ai.write('summary', { points });
      setSumText(d.text);
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setSumError(e.message || '生成失败');
    } finally {
      setSumLoading(false);
    }
  };

  const copySummary = async () => {
    await navigator.clipboard.writeText(sumText);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  /* ---- AI 解析聊天记录 → 周记草稿（填入编辑器后可修改保存） ---- */
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const draftFileRef = useRef(null);

  const genDraft = async () => {
    if (!draftText.trim() || draftLoading) return;
    setDraftLoading(true);
    try {
      const d = await ai.extract('journal', draftText.trim());
      setContent(d.text);
      setSaved(false);
      setDraftOpen(false); setDraftText('');
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      alert(e.message || '生成失败');
    } finally { setDraftLoading(false); }
  };

  const readDraftFile = async (file) => {
    if (!file) return;
    const text = (await file.text()).replace(/^﻿/, '');
    setDraftText(t => (t ? t + '\n' : '') + text.slice(0, 8000));
    if (draftFileRef.current) draftFileRef.current.value = '';
  };

  return (
    <div>
      <SectionHeader
        title="班主任周记"
        desc="每周记录班级工作，学期末 AI 自动汇总生成学期总结"
        action={<Button onClick={() => { setSumOpen(true); setSumText(''); setSumError(''); }}><Wand2 size={15} />AI 学期总结</Button>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* 左侧：周列表 */}
        <div className="card h-fit p-4 lg:col-span-1">
          <button onClick={() => pick(mondayOf())}
            className="btn-pill mb-3 flex w-full items-center justify-center gap-2 bg-black/[0.05] px-3 py-2 text-sm font-medium hover:bg-black/[0.08]">
            <Plus size={15} />写本周（{mondayOf().slice(5)} 起）
          </button>
          {list.length === 0 ? <p className="py-6 text-center text-xs text-ink-secondary">还没有周记</p> : (
            <div className="space-y-1.5">
              {list.map(j => (
                <button key={j.id} onClick={() => pick(j.week_start)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${weekStart === j.week_start ? 'bg-[#0071e3]/10 font-medium text-[#0071e3]' : 'hover:bg-black/[0.04]'}`}>
                  <CalendarRange size={14} className="shrink-0" />
                  <span className="truncate">{j.week_start} 周</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：编辑器 */}
        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold">{weekStart} 开始的一周</h3>
            {curId && <Badge tone="green">已保存过</Badge>}
            <div className="ml-auto flex gap-2">
              {curId && <Button variant="danger" onClick={remove}><Trash2 size={14} />删除</Button>}
              <Button variant="secondary" onClick={() => setDraftOpen(true)}><Wand2 size={14} />AI 草稿</Button>
              <Button onClick={save} disabled={saving}>
                <Save size={14} />{saving ? '保存中…' : saved ? '已保存 ✓' : '保存'}
              </Button>
            </div>
          </div>
          <textarea
            className="h-[420px] w-full resize-y rounded-xl border border-black/10 bg-bg-light px-3.5 py-3 text-sm leading-relaxed outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/15"
            placeholder={'记录本周班级大事、学生表现、家校沟通、下周安排…\n\n例：\n1. 周一班会强调期中复习计划\n2. 小明数学进步明显，与家长电话沟通表扬\n3. 周三处理两生矛盾，已和解\n4. 下周准备运动会报名'}
            value={content}
            onChange={e => { setContent(e.target.value); setSaved(false); }}
          />
        </div>
      </div>

      {/* AI 学期总结弹窗 */}
      <Modal open={sumOpen} onClose={() => setSumOpen(false)} title="AI 学期总结" width="max-w-2xl">
        <p className="mb-3 text-sm text-ink-secondary">
          将自动汇总你已写的 <b className="text-ink">{list.filter(j => j.content).length}</b> 篇周记内容，可补充要点后一键生成（8 算力）
        </p>
        <textarea
          className={`${inputCls} mb-3 resize-y`}
          rows={3}
          placeholder="补充要点（选填）：如本学期班级获得流动红旗 3 次、运动会年级第二…"
          value={sumPoints}
          onChange={e => setSumPoints(e.target.value)}
        />
        <div className="mb-4 flex items-center gap-3">
          <Button onClick={genSummary} disabled={sumLoading}>
            {sumLoading ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {sumLoading ? 'AI 撰写中…' : sumText ? '重新生成' : '生成学期总结'}
          </Button>
          {sumError && <span className="text-sm text-[#ff3b30]">{sumError}</span>}
        </div>
        {sumText && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">生成结果（可直接修改）</span>
              <Button variant="secondary" onClick={copySummary}><Copy size={14} />{copied ? '已复制' : '复制全文'}</Button>
            </div>
            <textarea
              className={`${inputCls} resize-y`}
              rows={14}
              value={sumText}
              onChange={e => setSumText(e.target.value)}
            />
          </>
        )}
      </Modal>
      {/* AI 周记草稿：粘贴聊天记录/备忘 → 整理成周记 */}
      <Modal open={draftOpen} onClose={() => setDraftOpen(false)} title="AI 周记草稿" width="max-w-2xl">
        <div className="space-y-4">
          <p className="rounded-xl bg-bg-light p-3 text-xs leading-relaxed text-ink-secondary">
            把本周班级群聊记录、备忘、随手记粘贴到下面（或上传 txt），AI 整理成周记草稿填入编辑器，可继续修改。<b className="text-ink">每次扣 2 算力</b>
          </p>
          <textarea
            className={`${inputCls} resize-y font-normal`}
            rows={8}
            placeholder={'例：\n周一班会强调了期中复习安排\n数学老师反映小明进步明显\n处理了俩学生课间矛盾，已和解\n家长会材料准备到一半'}
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button onClick={genDraft} disabled={!draftText.trim() || draftLoading}>
              {draftLoading ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {draftLoading ? 'AI 整理中…' : '生成周记草稿'}
            </Button>
            <Button variant="secondary" onClick={() => draftFileRef.current?.click()}><Upload size={15} />上传 txt</Button>
            <input ref={draftFileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={e => readDraftFile(e.target.files?.[0])} />
            <span className="ml-auto text-xs text-ink-secondary">{draftText.length}/8000 字</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
