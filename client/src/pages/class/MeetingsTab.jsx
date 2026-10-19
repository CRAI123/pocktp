import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Presentation, Wand2, RefreshCw } from 'lucide-react';
import { api, ai, auth, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

/** 班会记录：列表 + 新建/编辑 + 删除 */
export default function MeetingsTab({ classId }) {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null); // {id?, title, content, meeting_date}

  const load = () => api.get(`/classes/${classId}/meetings`).then(setRows);
  useEffect(() => { load(); }, [classId]);

  /* AI 整理班会纪要 */
  const [aiRaw, setAiRaw] = useState('');
  const [aiPolishing, setAiPolishing] = useState(false);
  const polishMeeting = async () => {
    if (!aiRaw.trim() || aiPolishing) return;
    setAiPolishing(true);
    try {
      const d = await ai.extract('meeting', aiRaw.trim());
      setEdit(prev => ({ ...prev, content: d.text }));
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      alert(e.message || '整理失败');
    } finally { setAiPolishing(false); }
  };

  if (!rows) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const save = async () => {
    if (!edit.title.trim()) return;
    if (edit.id) await api.put(`/meetings/${edit.id}`, edit);
    else await api.post(`/classes/${classId}/meetings`, edit);
    setEdit(null);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ title: '', content: '', meeting_date: todayStr() })}><Plus size={15} />记一次班会</Button>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map(m => (
            <div key={m.id} className="card group p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5856d6] to-[#af52de] text-white">
                  <Presentation size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.title}</div>
                  <div className="text-xs text-ink-secondary">{m.meeting_date}</div>
                </div>
                <button onClick={() => setEdit({ id: m.id, title: m.title, content: m.content, meeting_date: m.meeting_date })}
                  className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#0071e3]/10 hover:text-[#0071e3] sm:opacity-0 sm:group-hover:opacity-100" title="编辑">
                  <Pencil size={14} />
                </button>
                <button onClick={async () => { await api.del(`/meetings/${m.id}`); load(); }}
                  className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除">
                  <Trash2 size={14} />
                </button>
              </div>
              {m.content && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-bg-light p-3 text-sm leading-relaxed text-ink-secondary">{m.content}</p>}
            </div>
          ))}
        </div>
      ) : <Empty text="还没有班会记录" />}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '编辑班会记录' : '记一次班会'} width="max-w-xl">
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_150px] gap-3">
              <Field label="主题">
                <input className={inputCls} placeholder="如：期中考试动员大会" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
              </Field>
              <Field label="日期">
                <input type="date" className={inputCls} value={edit.meeting_date} onChange={e => setEdit({ ...edit, meeting_date: e.target.value })} />
              </Field>
            </div>
            <Field label="班会内容纪要">
              <textarea className={`${inputCls} min-h-[160px] resize-y`} placeholder="记录班会流程、讨论要点、学生发言、后续安排…" value={edit.content} onChange={e => setEdit({ ...edit, content: e.target.value })} />
            </Field>
            {/* AI 整理：粘贴速记/群聊记录 → 规范纪要 */}
            <div className="rounded-xl bg-bg-light p-3">
              <Field label="AI 整理原始记录（可选，扣 2 算力）">
                <textarea className={`${inputCls} resize-y bg-white font-normal`} rows={3}
                  placeholder="把班会速记、拍照识别的群聊文字粘贴到这里，AI 自动整理成规范纪要填入上方"
                  value={aiRaw} onChange={e => setAiRaw(e.target.value)} />
              </Field>
              <div className="mt-2 flex justify-end">
                <Button variant="secondary" onClick={polishMeeting} disabled={!aiRaw.trim() || aiPolishing}>
                  {aiPolishing ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  {aiPolishing ? 'AI 整理中…' : '整理成纪要'}
                </Button>
              </div>
            </div>
            <Button className="w-full justify-center" onClick={save} disabled={!edit.title.trim()}>保存</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
