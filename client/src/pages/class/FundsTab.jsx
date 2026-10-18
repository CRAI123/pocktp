import { useEffect, useState } from 'react';
import { Plus, Trash2, Download, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { api, todayStr } from '../../api.js';
import { Button, Badge, Modal, Field, inputCls, Empty } from '../../components/ui.jsx';

/** 班费台账：收支记录 + 结余统计 + CSV 导出 */
export default function FundsTab({ classId }) {
  const [data, setData] = useState(null); // { records, income, expense, balance }
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: '支出', amount: '', item: '', date: todayStr(), remark: '' });

  const load = () => api.get(`/classes/${classId}/funds`).then(setData);
  useEffect(() => { load(); }, [classId]);

  if (!data) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const add = async () => {
    if (!form.amount || !form.item.trim()) return;
    await api.post(`/classes/${classId}/funds`, form);
    setOpen(false);
    setForm({ type: '支出', amount: '', item: '', date: todayStr(), remark: '' });
    await load();
  };

  /* CSV 导出（UTF-8 BOM 保证 Excel 中文不乱码） */
  const exportCsv = () => {
    const head = '日期,类型,事项,金额,备注\n';
    const body = data.records.map(r =>
      [r.date, r.type, `"${r.item.replace(/"/g, '""')}"`, r.type === '收入' ? r.amount : -r.amount, `"${(r.remark || '').replace(/"/g, '""')}"`].join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + head + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `班费台账_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      {/* 结余总览 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0071e3] to-[#00c6ff] text-white"><Wallet size={18} /></div>
          <div><div className="text-xl font-bold">¥{data.balance.toFixed(2)}</div><div className="text-xs text-ink-secondary">当前结余</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#28cd41] to-[#34d058] text-white"><TrendingUp size={18} /></div>
          <div><div className="text-xl font-bold text-[#1fa733]">¥{data.income.toFixed(2)}</div><div className="text-xs text-ink-secondary">累计收入</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff9500] to-[#ffcc00] text-white"><TrendingDown size={18} /></div>
          <div><div className="text-xl font-bold text-[#c93400]">¥{data.expense.toFixed(2)}</div><div className="text-xs text-ink-secondary">累计支出</div></div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={exportCsv} disabled={!data.records.length}><Download size={15} />导出 CSV</Button>
        <Button onClick={() => setOpen(true)}><Plus size={15} />记一笔</Button>
      </div>

      {/* 流水表 */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 bg-bg-light text-left text-xs text-ink-secondary">
              <th className="px-4 py-3 font-medium">日期</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">事项</th>
              <th className="px-4 py-3 font-medium">备注</th>
              <th className="px-4 py-3 text-right font-medium">金额</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {data.records.map(r => (
              <tr key={r.id} className="group border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3 text-ink-secondary">{r.date}</td>
                <td className="px-4 py-3"><Badge tone={r.type === '收入' ? 'green' : 'orange'}>{r.type}</Badge></td>
                <td className="px-4 py-3 font-medium">{r.item}</td>
                <td className="px-4 py-3 text-xs text-ink-secondary">{r.remark || '—'}</td>
                <td className={`px-4 py-3 text-right font-bold ${r.type === '收入' ? 'text-[#1fa733]' : 'text-[#c93400]'}`}>
                  {r.type === '收入' ? '+' : '-'}¥{Number(r.amount).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={async () => { await api.del(`/funds/${r.id}`); load(); }}
                    className="btn-pill p-1 text-ink-secondary opacity-0 hover:text-[#ff3b30] group-hover:opacity-100" title="删除">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.records.length && <Empty text="暂无收支记录" />}
      </div>

      {/* 记账弹窗 */}
      <Modal open={open} onClose={() => setOpen(false)} title="记一笔">
        <div className="space-y-4">
          <div className="flex gap-2">
            {['支出', '收入'].map(t => (
              <button key={t} onClick={() => setForm({ ...form, type: t })}
                className={`btn-pill flex-1 py-2 text-sm font-medium transition ${
                  form.type === t
                    ? t === '收入' ? 'bg-[#28cd41] text-white shadow' : 'bg-[#ff9500] text-white shadow'
                    : 'bg-black/[0.05] text-ink-secondary hover:bg-black/[0.08]'
                }`}>{t}</button>
            ))}
          </div>
          <Field label="金额（元）">
            <input type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="事项">
            <input className={inputCls} placeholder="如：购买图书角新书 / 收取班费" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="日期">
              <input type="date" className={inputCls} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="备注（可选）">
              <input className={inputCls} value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} />
            </Field>
          </div>
          <Button className="w-full justify-center" onClick={add} disabled={!form.amount || !form.item.trim()}>保存</Button>
        </div>
      </Modal>
    </div>
  );
}
