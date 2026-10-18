import { useEffect, useState } from 'react';
import { Phone, MessageCircle, Plus, History, Trash2 } from 'lucide-react';
import { api, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

const TYPES = ['电话', '微信', '家访', '面谈'];

/** 家长联系：通讯录 + 家校沟通日志 */
export default function ParentsTab({ classId }) {
  const [rows, setRows] = useState(null);
  const [logFor, setLogFor] = useState(null);       // 记沟通的学生
  const [historyFor, setHistoryFor] = useState(null); // 看日志的学生
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ contact_type: '电话', content: '', contacted_at: todayStr() });

  const load = () => api.get(`/classes/${classId}/parents`).then(setRows);
  useEffect(() => { load(); }, [classId]);

  const openHistory = async (stu) => {
    setHistoryFor(stu);
    setLogs(await api.get(`/students/${stu.id}/visit-logs`));
  };

  const addLog = async () => {
    if (!form.content.trim()) return;
    await api.post(`/students/${logFor.id}/visit-logs`, form);
    setLogFor(null);
    setForm({ contact_type: '电话', content: '', contacted_at: todayStr() });
    await load();
  };

  const delLog = async (id) => {
    await api.del(`/visit-logs/${id}`);
    setLogs(await api.get(`/students/${historyFor.id}/visit-logs`));
    await load();
  };

  if (!rows) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 bg-bg-light text-left text-xs text-ink-secondary">
              <th className="px-4 py-3 font-medium">学生</th>
              <th className="px-4 py-3 font-medium">家长电话</th>
              <th className="px-4 py-3 font-medium">家长微信</th>
              <th className="px-4 py-3 font-medium">最近沟通</th>
              <th className="px-4 py-3 font-medium">沟通次数</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3">
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-xs text-ink-secondary">{s.gender}</span>
                </td>
                <td className="px-4 py-3">
                  {s.parent_phone ? (
                    <a href={`tel:${s.parent_phone}`} className="inline-flex items-center gap-1 text-[#0071e3] hover:underline">
                      <Phone size={13} />{s.parent_phone}
                    </a>
                  ) : <span className="text-ink-secondary/50">—</span>}
                </td>
                <td className="px-4 py-3 text-ink-secondary">{s.parent_wechat || '—'}</td>
                <td className="px-4 py-3">{s.last_contact ? <Badge tone="blue">{s.last_contact}</Badge> : <span className="text-xs text-ink-secondary/50">从未沟通</span>}</td>
                <td className="px-4 py-3"><Badge tone={s.contact_count > 0 ? 'green' : 'gray'}>{s.contact_count}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <button className="btn-pill mr-1 p-1.5 text-ink-secondary hover:bg-[#0071e3]/10 hover:text-[#0071e3]" title="沟通记录" onClick={() => openHistory(s)}>
                    <History size={15} />
                  </button>
                  <button className="btn-pill p-1.5 text-ink-secondary hover:bg-[#28cd41]/10 hover:text-[#1fa733]" title="记一次沟通" onClick={() => setLogFor(s)}>
                    <Plus size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty text="该班暂无学生" />}
      </div>

      {/* 记一次沟通 */}
      <Modal open={!!logFor} onClose={() => setLogFor(null)} title={`与 ${logFor?.name} 家长沟通`}>
        <div className="space-y-4">
          <div className="flex gap-2">
            {TYPES.map(t => (
              <button key={t} onClick={() => setForm({ ...form, contact_type: t })}
                className={`btn-pill flex-1 py-2 text-sm font-medium transition ${form.contact_type === t ? 'brand-gradient text-white shadow' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/[0.08]'}`}>
                {t}
              </button>
            ))}
          </div>
          <Field label="日期">
            <input type="date" className={inputCls} value={form.contacted_at} onChange={e => setForm({ ...form, contacted_at: e.target.value })} />
          </Field>
          <Field label="沟通内容">
            <textarea className={`${inputCls} min-h-[100px] resize-y`} placeholder="如：反馈近期作业完成情况，家长表示配合督促…" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
          </Field>
          <Button className="w-full justify-center" onClick={addLog} disabled={!form.content.trim()}>
            <MessageCircle size={15} />保存记录
          </Button>
        </div>
      </Modal>

      {/* 历史沟通记录 */}
      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={`${historyFor?.name} · 家校沟通记录`}>
        {logs.length ? (
          <div className="space-y-3">
            {logs.map(l => (
              <div key={l.id} className="group rounded-xl bg-bg-light p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="blue">{l.contact_type}</Badge>
                  <span className="text-xs text-ink-secondary">{l.contacted_at}</span>
                  <button onClick={() => delLog(l.id)} className="btn-pill ml-auto p-1 text-ink-secondary opacity-0 hover:text-[#ff3b30] group-hover:opacity-100" title="删除">
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{l.content}</p>
              </div>
            ))}
          </div>
        ) : <p className="py-6 text-center text-sm text-ink-secondary">暂无沟通记录</p>}
      </Modal>
    </div>
  );
}
