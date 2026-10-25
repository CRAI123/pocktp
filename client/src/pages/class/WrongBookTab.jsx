import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, BookX, Check, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { api, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const STATUS_TONE = { 待订正: 'orange', 已订正: 'blue', 已复测: 'green' };
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道法', '科学'];

/** 错题本：登记错题 → 订正 → 复测，形成学情档案 */
export default function WrongBookTab({ classId }) {
  const [data, setData] = useState(null); // { items, students, summary }
  const [filter, setFilter] = useState('全部');
  const [studentId, setStudentId] = useState('');
  const [edit, setEdit] = useState(null);
  const [retest, setRetest] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [err, setErr] = useState('');

  const load = () => {
    const qs = new URLSearchParams();
    if (filter !== '全部') qs.set('status', filter);
    if (studentId) qs.set('student_id', studentId);
    return api.get(`/classes/${classId}/wrong-questions?${qs.toString()}`).then(setData);
  };
  useEffect(() => { load().catch(console.error); }, [classId, filter, studentId]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const blank = { student_id: '', subject: '', source: '', knowledge: '', stem: '', answer: '' };

  const save = async () => {
    if (!edit.student_id || !edit.stem.trim()) return;
    setErr('');
    try {
      if (edit.id) await api.put(`/wrong-questions/${edit.id}`, edit);
      else await api.post(`/classes/${classId}/wrong-questions`, edit);
      setEdit(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  const markCorrected = async (q) => {
    await api.put(`/wrong-questions/${q.id}`, { ...q, status: '已订正' });
    await load();
  };

  const saveRetest = async () => {
    if (!retest) return;
    setErr('');
    try {
      await api.put(`/wrong-questions/${retest.id}/retest`, {
        retest_score: retest.retest_score, retest_note: retest.retest_note, retest_at: retest.retest_at,
      });
      setRetest(null);
      await load();
    } catch (e) { setErr(e.message); }
  };

  const s = data.summary;
  return (
    <div className="space-y-4">
      {/* 概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '错题总数', value: s.total, cls: '' },
          { label: '待订正', value: s.pending, cls: 'text-[#c93400]' },
          { label: '已订正', value: s.corrected, cls: 'text-[#0071e3]' },
          { label: '平均复测分', value: s.retest_avg ?? '—', cls: 'text-[#1fa733]' },
        ].map((c, i) => (
          <div key={i} className="card p-4">
            <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="text-xs text-ink-secondary">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {['全部', '待订正', '已订正', '已复测'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`btn-pill px-3 py-1.5 text-xs font-medium transition ${
                filter === f ? 'brand-gradient text-white shadow' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07]'
              }`}>{f}</button>
          ))}
          <select className={`${inputCls} w-auto py-1.5 text-xs`} value={studentId} onChange={e => setStudentId(e.target.value)}>
            <option value="">全部学生</option>
            {data.students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>
        <Button onClick={() => { setErr(''); setEdit({ ...blank }); }}><Plus size={15} />登记错题</Button>
      </div>

      {data.items.length ? (
        <div className="space-y-3">
          {data.items.map(q => {
            const open = !!expanded[q.id];
            return (
              <div key={q.id} className="card group p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff9500] to-[#ff3b30] text-white">
                    <BookX size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{q.student_name}</span>
                      {q.subject && <Badge tone="purple">{q.subject}</Badge>}
                      {q.knowledge && <span className="text-xs text-ink-secondary">知识点：{q.knowledge}</span>}
                      <Badge tone={STATUS_TONE[q.status] || 'gray'}>{q.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-secondary">
                      {q.source ? `来源：${q.source} · ` : ''}{q.created_at?.slice(0, 10)}
                    </div>
                  </div>
                  {q.status === '待订正' && (
                    <button onClick={() => markCorrected(q)}
                      className="btn-pill inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#0071e3] hover:bg-[#0071e3]/10" title="标记已订正">
                      <Check size={13} />已订正
                    </button>
                  )}
                  <button onClick={() => { setErr(''); setRetest({ ...q, retest_at: q.retest_at || todayStr(), retest_score: q.retest_score ?? '' }); }}
                    className="btn-pill inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#1fa733] hover:bg-[#28cd41]/10" title="记录复测">
                    <RotateCcw size={13} />复测
                  </button>
                  <button onClick={() => { setErr(''); setEdit({ ...q }); }}
                    className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#0071e3]/10 hover:text-[#0071e3] sm:opacity-0 sm:group-hover:opacity-100" title="编辑">
                    <Pencil size={14} />
                  </button>
                  <button onClick={async () => { if (confirm('确认删除这道错题？')) { await api.del(`/wrong-questions/${q.id}`); load(); } }}
                    className="btn-pill p-2 text-ink-secondary opacity-60 hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] sm:opacity-0 sm:group-hover:opacity-100" title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{q.stem}</div>

                {q.answer && (
                  <button onClick={() => setExpanded(prev => ({ ...prev, [q.id]: !open }))}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-[#0071e3] hover:underline">
                    {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{open ? '收起答案' : '查看答案 / 解析'}
                  </button>
                )}
                {open && q.answer && (
                  <div className="mt-2 whitespace-pre-wrap rounded-xl bg-[#28cd41]/8 p-3 text-xs leading-relaxed text-ink">{q.answer}</div>
                )}

                {q.status === '已复测' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-[#0071e3]/8 px-3 py-2 text-xs text-[#0a66c2]">
                    <span>复测 {q.retest_at || ''}：<b>{q.retest_score ?? '—'} 分</b></span>
                    {q.retest_note && <span>· {q.retest_note}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={BookX} text={filter === '全部' && !studentId ? '还没有错题记录' : '没有符合条件的错题'}
          desc="登记 → 订正 → 复测，把每道错题都变成一次进步" />
      )}

      {/* 登记 / 编辑 */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? '编辑错题' : '登记错题'} width="max-w-xl">
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="学生">
                <select className={inputCls} value={edit.student_id} onChange={e => setEdit({ ...edit, student_id: e.target.value })}>
                  <option value="">请选择</option>
                  {data.students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </Field>
              <Field label="学科">
                <input list="wrong-subjects" className={inputCls} placeholder="如：数学" value={edit.subject}
                  onChange={e => setEdit({ ...edit, subject: e.target.value })} />
                <datalist id="wrong-subjects">{SUBJECTS.map(x => <option key={x} value={x} />)}</datalist>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="来源（可选）">
                <input className={inputCls} placeholder="如：第二次月考 第 18 题" value={edit.source}
                  onChange={e => setEdit({ ...edit, source: e.target.value })} />
              </Field>
              <Field label="知识点（可选）">
                <input className={inputCls} placeholder="如：一元二次方程判别式" value={edit.knowledge}
                  onChange={e => setEdit({ ...edit, knowledge: e.target.value })} />
              </Field>
            </div>
            <Field label="题干">
              <textarea className={`${inputCls} min-h-[110px] resize-y`} placeholder="粘贴或输入错题题干…"
                value={edit.stem} onChange={e => setEdit({ ...edit, stem: e.target.value })} />
            </Field>
            <Field label="答案 / 解析（可选）">
              <textarea className={`${inputCls} min-h-[90px] resize-y`} placeholder="正确解法、易错点…"
                value={edit.answer} onChange={e => setEdit({ ...edit, answer: e.target.value })} />
            </Field>
            {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
            <Button className="w-full justify-center" onClick={save} disabled={!edit.student_id || !edit.stem.trim()}>保存</Button>
          </div>
        )}
      </Modal>

      {/* 复测记录 */}
      <Modal open={!!retest} onClose={() => setRetest(null)} title="记录复测结果">
        {retest && (
          <div className="space-y-4">
            <div className="rounded-xl bg-bg-light p-3 text-xs leading-relaxed text-ink-secondary">
              {retest.student_name} · {retest.subject || '未标学科'}{retest.knowledge ? ` · ${retest.knowledge}` : ''}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="复测得分">
                <input type="number" min="0" max="100" className={inputCls} placeholder="如：85"
                  value={retest.retest_score} onChange={e => setRetest({ ...retest, retest_score: e.target.value })} />
              </Field>
              <Field label="复测日期">
                <input type="date" className={inputCls} value={retest.retest_at}
                  onChange={e => setRetest({ ...retest, retest_at: e.target.value })} />
              </Field>
            </div>
            <Field label="复测备注（可选）">
              <input className={inputCls} placeholder="如：同类题已掌握，计算仍需细心"
                value={retest.retest_note || ''} onChange={e => setRetest({ ...retest, retest_note: e.target.value })} />
            </Field>
            {err && <div className="rounded-xl bg-[#ff3b30]/8 px-3 py-2 text-xs text-[#ff3b30]">{err}</div>}
            <Button className="w-full justify-center" onClick={saveRetest}>保存复测结果</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
