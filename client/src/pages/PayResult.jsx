import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Loader2, RotateCcw } from 'lucide-react';
import { auth, pay } from '../api.js';
import { BrandFooter, Button } from '../components/ui.jsx';

const VIEWS = {
  missing: {
    icon: Clock,
    title: '未检测到支付订单',
    desc: '这是支付宝支付结果页。若你刚完成付款，请登录后前往充值记录确认，不要重复付款。',
  },
  unauthorized: {
    icon: Clock,
    title: '请登录后确认支付结果',
    desc: '订单结果只会向订单所属账号展示。登录后可前往充值记录查看，前台回跳参数不作为到账依据。',
  },
  pending: {
    icon: Loader2,
    title: '正在确认支付结果',
    desc: '正在向支付宝查询订单状态，请勿关闭页面或重复付款。确认成功后算力会自动到账。',
  },
  paid: {
    icon: CheckCircle2,
    title: '支付成功，算力已到账',
    desc: '支付宝已确认这笔订单完成支付。',
  },
  closed: {
    icon: Clock,
    title: '订单已关闭',
    desc: '支付宝确认这笔交易已关闭。若你不确定是否扣款，请先在支付宝账单中核对。',
  },
  refunded: {
    icon: CheckCircle2,
    title: '订单已退款',
    desc: '这笔订单已完成退款，具体到账时间以支付宝账单为准。',
  },
  timeout: {
    icon: AlertCircle,
    title: '暂未确认支付结果',
    desc: '支付宝结果仍有延迟。请稍后在充值记录中查看，不要重复付款。',
  },
  error: {
    icon: AlertCircle,
    title: '暂时无法查询订单',
    desc: '请前往充值记录确认订单归属和状态，不要依据网址参数判断付款结果。',
  },
};

export default function PayResult() {
  const [searchParams] = useSearchParams();
  const orderNo = String(searchParams.get('out_trade_no') || '').trim();
  const [result, setResult] = useState({ status: orderNo ? 'pending' : 'missing' });

  useEffect(() => {
    if (!orderNo) {
      setResult({ status: 'missing' });
      return undefined;
    }
    if (!auth.token) {
      setResult({ status: 'unauthorized' });
      return undefined;
    }

    let stopped = false;
    let timer = null;
    let attempts = 0;
    setResult({ status: 'pending' });

    const check = async () => {
      try {
        const status = await pay.status(orderNo);
        if (stopped) return;
        if (status.status === 'paid' && auth.teacher) {
          auth.save(auth.token, { ...auth.teacher, credits: status.balance }, auth.remember);
        }
        if (status.status !== 'pending') {
          setResult(status);
          return;
        }
      } catch (error) {
        if (stopped) return;
        if ([401, 403, 404].includes(error.status)) {
          setResult({ status: 'error', message: error.message });
          return;
        }
        /* 网络异常不代表未付款，继续查询。 */
      }

      attempts += 1;
      if (attempts >= 100) {
        setResult({ status: 'timeout' });
      } else {
        timer = setTimeout(check, 3000);
      }
    };

    check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderNo]);

  const view = VIEWS[result.status] || VIEWS.error;
  const Icon = view.icon;

  return (
    <div className="auth-bg relative flex min-h-screen flex-col items-center justify-center px-4 pb-16 text-center">
      <div className="card w-full max-w-lg p-7 sm:p-9">
        <img src="/rayzo-logo.png" alt="教师工作台" className="brand-logo mx-auto mb-5 h-16 w-16 rounded-full" />
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${result.status === 'paid' ? 'bg-[#28cd41]/10 text-[#1a7f2b]' : 'bg-[#0071e3]/10 text-[#0071e3]'}`}>
          <Icon size={30} className={result.status === 'pending' ? 'animate-spin' : ''} />
        </span>
        <h1 className="display mt-5 text-[24px] font-semibold text-ink">{view.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{result.message || view.desc}</p>

        {orderNo && (
          <div className="mt-5 rounded-2xl bg-black/[0.025] px-4 py-3">
            <div className="text-[11px] text-ink-secondary">商户订单号</div>
            <div className="mt-1 break-all font-mono text-[12px] text-ink">{orderNo}</div>
          </div>
        )}
        {result.status === 'paid' && (
          <div className="mt-4 text-sm text-ink-secondary">
            本单到账 <b className="text-ink">{result.credits}</b> 算力 · 当前余额 <b className="text-ink">{result.balance}</b>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link to={auth.token ? '/recharge' : '/login'}>
            <Button><RotateCcw size={15} />{auth.token ? '查看充值记录' : '去登录'}</Button>
          </Link>
          {auth.token && <Link to="/dashboard"><Button variant="secondary">返回工作台</Button></Link>}
        </div>
      </div>
      <BrandFooter fixed />
    </div>
  );
}
