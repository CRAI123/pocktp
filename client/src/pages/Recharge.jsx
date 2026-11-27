import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2, Loader2, Clock, X, AlertCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { auth, pay } from '../api.js';
import { Button, SectionHeader } from '../components/ui.jsx';
import { isDesktopApp } from '../desktop.js';

const STATUS_TEXT = { pending: '待支付', paid: '已到账', refunded: '已退款', closed: '已关闭' };

export default function Recharge() {
  const [packages, setPackages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [balance, setBalance] = useState(auth.teacher?.credits ?? 0);
  /* 支付弹窗：null=关闭；{pkg,orderNo,payUrl,qr,status,error} */
  const [active, setActive] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    pay.packages().then(r => setPackages(r.packages || [])).catch(() => {});
    pay.orders().then(r => setOrders(r.orders || [])).catch(() => {});
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const fmtYuan = fen => `¥${(Number(fen) / 100).toFixed(2)}`;

  const closeActive = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setActive(null);
  };

  const startPolling = (orderNo) => {
    if (timer.current) clearInterval(timer.current);
    let ticks = 0;
    timer.current = setInterval(async () => {
      ticks += 1;
      try {
        const r = await pay.status(orderNo);
        if (r.status === 'paid') {
          clearInterval(timer.current); timer.current = null;
          auth.save(auth.token, { ...auth.teacher, credits: r.balance }, auth.remember);
          setBalance(r.balance);
          setActive(prev => (prev ? { ...prev, status: 'paid' } : prev));
          pay.orders().then(rr => setOrders(rr.orders || [])).catch(() => {});
          return;
        }
        if (r.status === 'closed') {
          clearInterval(timer.current); timer.current = null;
          setActive(prev => (prev ? { ...prev, status: 'closed' } : prev));
        }
      } catch (_) { /* 单次轮询失败不中断 */ }
      if (ticks >= 200) { // 约 10 分钟
        clearInterval(timer.current); timer.current = null;
        setActive(prev => (prev ? { ...prev, status: 'expired' } : prev));
      }
    }, 3000);
  };

  const buy = async (pkg) => {
    setActive({ pkg, status: 'loading', error: '' });
    try {
      const r = await pay.create(pkg.id);
      if (!r.payUrl) throw new Error('支付网关未返回支付地址');
      const qr = await QRCode.toDataURL(r.payUrl, { width: 240, margin: 2, color: { dark: '#111', light: '#fff' } });
      setActive({ pkg, orderNo: r.orderNo, payUrl: r.payUrl, qr, status: 'pending', error: '' });
      startPolling(r.orderNo);
      /* 桌面版内嵌浏览器打不开外部收银台，统一走二维码；网页版顺带开新标签 */
      if (!isDesktopApp()) window.open(r.payUrl, '_blank', 'noopener');
    } catch (e) {
      setActive(prev => ({ ...(prev || {}), status: 'error', error: e.message || '下单失败，请稍后重试' }));
    }
  };

  return (
    <div className="space-y-8">
      <SectionHeader title="算力充值" desc="AI 出题、批改、生图等功能按次消耗算力。使用支付宝扫码支付，付款后自动到账。" />

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
            <Button className="mt-4 w-full" onClick={() => buy(p)}><Zap size={15} /> 支付宝充值</Button>
          </div>
        ))}
        {packages.length === 0 && (
          <div className="col-span-full card p-8 text-center text-sm text-ink-secondary">套餐加载中…</div>
        )}
      </div>

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

      {/* 扫码支付弹窗 */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12141a]/45 p-4 backdrop-blur-sm" onClick={closeActive}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-xs text-ink-secondary">算力充值</div>
                <div className="display text-[18px] font-semibold text-ink">{active.pkg?.name} · {active.pkg?.credits} 算力</div>
              </div>
              <button onClick={closeActive} className="rounded-full p-1.5 text-ink-secondary transition hover:bg-black/5"><X size={18} /></button>
            </div>

            {active.status === 'loading' && (
              <div className="flex flex-col items-center gap-3 py-12 text-ink-secondary">
                <Loader2 size={28} className="animate-spin text-[#0071e3]" />
                <span className="text-sm">正在生成支付二维码…</span>
              </div>
            )}

            {active.status === 'error' && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <AlertCircle size={32} className="text-[#ff3b30]" />
                <div className="text-sm text-ink">{active.error || '下单失败，请重试'}</div>
                <Button onClick={closeActive}>关闭</Button>
              </div>
            )}

            {active.status === 'pending' && (
              <div className="flex flex-col items-center">
                <div className="rounded-2xl border border-black/[0.06] p-3">
                  <img src={active.qr} alt="支付二维码" className="h-[220px] w-[220px]" />
                </div>
                <div className="mt-3 text-[15px] font-semibold text-ink">请扫码支付 {fmtYuan(active.pkg?.amount)}</div>
                <div className="mt-1 flex items-center gap-1 text-[12px] text-ink-secondary">
                  <Clock size={12} /> 支付成功后自动到账，无需刷新
                </div>
                <a
                  href={active.payUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 text-[12px] text-[#0071e3] underline underline-offset-2"
                >或在浏览器中打开支付页</a>
                <div className="mt-3 flex items-center gap-1 text-[12px] text-[#0071e3]">
                  <Loader2 size={12} className="animate-spin" /> 等待支付结果…
                </div>
              </div>
            )}

            {(active.status === 'paid') && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 size={44} className="text-[#28cd41]" />
                <div className="text-[15px] font-semibold text-ink">支付成功，算力已到账</div>
                <div className="text-[12px] text-ink-secondary">当前余额 {balance} 算力</div>
                <Button className="mt-2" onClick={closeActive}>完成</Button>
              </div>
            )}

            {active.status === 'closed' && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertCircle size={36} className="text-ink-secondary" />
                <div className="text-sm text-ink">订单已关闭</div>
                <Button onClick={closeActive}>关闭</Button>
              </div>
            )}

            {active.status === 'expired' && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Clock size={36} className="text-[#a85300]" />
                <div className="text-sm text-ink">长时间未收到支付结果</div>
                <div className="text-[12px] text-ink-secondary">如已付款，请稍后在充值记录中确认</div>
                <Button className="mt-2" onClick={closeActive}>关闭</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
