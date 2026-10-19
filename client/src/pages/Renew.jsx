import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Zap, ShoppingBag, Copy, CheckCircle2, KeyRound, Sparkles, ArrowRight, ExternalLink, ShieldCheck } from 'lucide-react';
import { api, auth, todayStr, isMembershipActive } from '../api.js';
import { Button, inputCls } from '../components/ui.jsx';

const XIANYU_URL = 'https://m.tb.cn/h.j1YRJO9?tk=LOXzTu26Lti';
const XIANYU_KW = 'Rayzo密钥事务所';

/* 复制闲鱼链接（含 fallback） */
function CopyLink() {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(XIANYU_URL);
    } catch (_) {
      /* 老浏览器 fallback */
      const ta = document.createElement('textarea');
      ta.value = XIANYU_URL;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={onCopy}
      className="ml-2 inline-flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1 text-xs text-ink-secondary transition hover:bg-white hover:text-[#0071e3]">
      {copied ? <><CheckCircle2 size={12} className="text-[#28cd41]" />已复制</> : <><Copy size={12} />复制</>}
    </button>
  );
}

export default function Renew() {
  const navigate = useNavigate();
  const teacher = auth.teacher;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  /* 未激活或会员过期：仍走 /activate 完整流程（声明式跳转，避免渲染期 navigate 导致白屏） */
  if (!teacher || !teacher.activated || !isMembershipActive(teacher)) {
    return <Navigate to="/activate" replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(null); setLoading(true);
    try {
      const r = await api.post('/activation/redeem', { code });
      auth.save(auth.token, { ...teacher, credits: r.credits, membership_expires_at: r.membership_expires_at || teacher.membership_expires_at });
      setSuccess(r);
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const credits = teacher.credits ?? 0;
  const expires = teacher.membership_expires_at;
  const lowCredits = credits <= 100;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* 顶部状态条 */}
      <div className="card overflow-hidden">
        <div className="brand-gradient relative p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-sm text-white/85">
                <Zap size={14} /> 算力余额
              </div>
              <div className="mt-1 text-4xl font-semibold tracking-tight">{credits}</div>
              <div className="mt-1 text-xs text-white/75">
                会员到期 · {expires || '永久'} · 今日 {todayStr()}
              </div>
            </div>
            {lowCredits && (
              <div className="rounded-xl bg-[#ff9500]/95 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                余额偏低，建议续费
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-black/[0.06] bg-bg-light text-center text-xs">
          <div className="p-3"><div className="text-ink-secondary">AI 出题</div><div className="mt-0.5 font-semibold">5 算力/次</div></div>
          <div className="p-3"><div className="text-ink-secondary">AI 批改</div><div className="mt-0.5 font-semibold">1 算力/次</div></div>
          <div className="p-3"><div className="text-ink-secondary">AI 文案</div><div className="mt-0.5 font-semibold">2-10 算力/次</div></div>
          <div className="p-3"><div className="text-ink-secondary">新码默认</div><div className="mt-0.5 font-semibold">+1000 算力</div></div>
        </div>
      </div>

      {/* 步骤 1：前往闲鱼 */}
      <div className="card p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ff9500] text-xs text-white">1</span>
          获取激活码
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">闲鱼搜索「{XIANYU_KW}」下单</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          联系客服拍「教师工作台激活码」即可下单，下单后客服会把 16 位激活码发给你。
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <a href={XIANYU_URL} target="_blank" rel="noopener noreferrer"
            className="btn-pill brand-gradient inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/25 transition active:scale-95 hover:shadow-xl">
            <ShoppingBag size={16} />前往闲鱼下单
            <ExternalLink size={13} className="opacity-80" />
          </a>
          <a href={XIANYU_URL} target="_blank" rel="noopener noreferrer"
            className="btn-pill inline-flex items-center gap-1.5 border border-black/10 bg-bg-light px-4 py-2.5 text-sm font-medium transition active:scale-95 hover:bg-white">
            复制闲鱼链接<CopyLink />
          </a>
        </div>

        <div className="mt-4 break-all rounded-xl bg-black/[0.04] px-3 py-2 font-mono text-xs text-ink-secondary">
          {XIANYU_URL}
        </div>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-secondary">
          <span className="inline-flex items-center gap-1"><ShieldCheck size={13} className="text-[#28cd41]" />闲鱼担保交易</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck size={13} className="text-[#28cd41]" />客服秒发货</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck size={13} className="text-[#28cd41]" />按有效期计费 7 天起</span>
        </div>
      </div>

      {/* 步骤 2：输入激活码 */}
      <div className="card p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ff9500] text-xs text-white">2</span>
          输入激活码兑换
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">输入客服发给你的 16 位激活码</h2>
        <p className="mt-1 text-sm text-ink-secondary">格式：XXXX-XXXX-XXXX-XXXX（自动归一为大写、忽略空格）</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="relative">
            <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
            <input
              required autoFocus placeholder="XXXX-XXXX-XXXX-XXXX"
              className={`${inputCls} pl-10 text-center font-mono text-base tracking-widest uppercase`}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
          </div>

          {error && <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{error}</div>}
          {success && (
            <div className="rounded-xl bg-[#28cd41]/10 px-4 py-3 text-sm">
              <div className="flex items-center gap-1.5 font-medium text-[#1f9e33]">
                <Sparkles size={14} />兑换成功
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-ink-secondary">
                <div>算力余额：<b className="text-ink">{success.credits}</b></div>
                <div>{success.renewal ? '续费叠加' : '本次获得'}：<b className="text-ink">+{success.valid_days ? `${success.valid_days}天 ` : ''}{success.credits - (teacher.credits || 0)} 算力</b></div>
                {success.membership_expires_at && <div>会员到期：<b className="text-ink">{success.membership_expires_at}</b></div>}
              </div>
            </div>
          )}

          <Button type="submit" disabled={loading || !code.trim()} className="w-full justify-center py-2.5">
            <Sparkles size={16} />{loading ? '兑换中…' : '立即兑换'}
          </Button>
        </form>

        <div className="mt-4 rounded-xl bg-[#0071e3]/[0.06] px-4 py-3 text-xs leading-relaxed text-ink-secondary">
          <b className="text-[#0071e3]">算力消耗场景：</b>
          AI 出题 5 · AI 批改 1 · 聊天记录解析 2 · 家长通知 2 · 班级周报 3 · 学期总结 8 · AI 评语（全班）10，单位均为算力/次；历史记录查看免费。
          会员过期前续费，未用完的天数会自动叠加。
        </div>
      </div>

      {/* 返回 */}
      <button onClick={() => navigate('/')} className="mx-auto flex items-center gap-1 text-sm text-ink-secondary transition hover:text-[#0071e3]">
        <ArrowRight size={14} className="rotate-180" />返回工作台
      </button>
    </div>
  );
}
