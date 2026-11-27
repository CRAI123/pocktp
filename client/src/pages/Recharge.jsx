import { useState, useEffect } from 'react';
import { Zap, Loader2, AlertCircle } from 'lucide-react';
import { auth, pay } from '../api.js';
import { Button, SectionHeader } from '../components/ui.jsx';

const STATUS_TEXT = { pending: '待支付', paid: '已到账', refunded: '已退款', closed: '已关闭' };

export default function Recharge() {
  const [packages, setPackages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [balance, setBalance] = useState(auth.teacher?.credits ?? 0);
  const [creating, setCreating] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    pay.packages().then(r => setPackages(r.packages || [])).catch(() => {});
    pay.orders().then(r => setOrders(r.orders || [])).catch(() => {});
  }, []);

  const fmtYuan = fen => `¥${(Number(fen) / 100).toFixed(2)}`;

  const buy = async (pkg) => {
    if (creating) return;
    setCreating(pkg.id);
    setError('');
    let container;
    try {
      const r = await pay.create(pkg.id);
      if (!r.paymentHtml) throw new Error('支付宝未返回收银台表单');

      /* pageExec 返回的是 POST form，必须渲染后提交，不能当作跳转 URL。 */
      container = document.createElement('div');
      container.innerHTML = r.paymentHtml;
      document.body.appendChild(container);
      const form = container.querySelector('form');
      if (!form) throw new Error('支付宝收银台表单格式异常');
      form.submit();
    } catch (e) {
      container?.remove();
      setCreating('');
      setError(e.message || '下单失败，请稍后重试');
    }
  };

  return (
    <div className="space-y-8">
      <SectionHeader title="算力充值" desc="AI 出题、批改、生图等功能按次消耗算力。使用支付宝网站支付，付款后返回本站确认到账。" />

      {/* 当前余额 */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ff9500]/12 text-[#a85300]">
            <Zap size={22} />
          </span>
          <div>
            <div className="text-xs text-ink-secondary">当前算力余额</div>
            <div className="num text-[30px] font-semibold leading-none text-ink">{balance}</div>
          </div>
        </div>
        <div className="text-[11px] leading-relaxed text-ink-secondary/80">
          约可 AI 出题 <b className="text-ink">{Math.floor(balance / 5)}</b> 次 · 生图 <b className="text-ink">{Math.floor(balance / 5)}</b> 张
          <br />（每次约扣 5 算力，以实际功能为准）
        </div>
      </div>

      {/* 套餐卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {packages.map(p => (
          <div key={p.id} className="card group relative flex flex-col p-5 transition hover:-translate-y-0.5">
            {p.tag && (
              <span className="absolute right-3 top-3 rounded-full bg-[#ff3b30]/10 px-2 py-0.5 text-[10px] font-medium text-[#d70015]">{p.tag}</span>
            )}
            <div className="eyebrow">{p.name}</div>
            <div className="num mt-2 text-[32px] font-semibold leading-none text-ink">
              {p.credits}<span className="ml-1 text-[14px] font-normal text-ink-secondary">算力</span>
            </div>
            <div className="mt-1 text-[12px] text-ink-secondary/70">折合 {(p.credits / (p.amount / 100)).toFixed(1)} 算力/元</div>
            <div className="mt-4 text-lg font-semibold text-[#0071e3]">{fmtYuan(p.amount)}</div>
            <Button className="mt-4 w-full" disabled={!!creating} onClick={() => buy(p)}>
              {creating === p.id ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              {creating === p.id ? '正在前往支付宝…' : '支付宝充值'}
            </Button>
          </div>
        ))}
        {packages.length === 0 && (
          <div className="col-span-full card p-8 text-center text-sm text-ink-secondary">套餐加载中…</div>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-[#ff3b30]/15 bg-[#ff3b30]/[0.06] px-4 py-3 text-sm text-[#b3251c]">
          <AlertCircle size={17} className="shrink-0" /> {error}
        </div>
      )}

      {/* 充值记录 */}
      <div>
        <h3 className="mb-3 display text-[17px] font-semibold text-ink">充值记录</h3>
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-[12px] text-ink-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">订单号</th>
                <th className="px-4 py-2.5 font-medium">套餐</th>
                <th className="px-4 py-2.5 font-medium">金额</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {orders.map(o => (
                <tr key={o.order_no} className="text-[13px]">
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-secondary">{o.order_no}</td>
                  <td className="px-4 py-2.5">{o.credits} 算力</td>
                  <td className="px-4 py-2.5">{fmtYuan(o.amount)}</td>
                  <td className="px-4 py-2.5">
                    <span className={o.status === 'paid' ? 'text-[#1a7f2b]' : o.status === 'pending' ? 'text-[#a85300]' : 'text-ink-secondary'}>
                      {STATUS_TEXT[o.status] || o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{o.paid_at || o.created_at || '-'}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-secondary/70">暂无充值记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
