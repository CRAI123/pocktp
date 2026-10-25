import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Loader2, LogIn, MonitorDown, AlertTriangle } from 'lucide-react';
import { api, auth } from '../api.js';
import { BrandFooter } from '../components/ui.jsx';

/**
 * 桌面版浏览器快捷登录的授权页（在系统浏览器中打开）：
 * 桌面版生成一次性授权码 → 打开本页 → 用户登录后自动授权 → 桌面版轮询取回令牌。
 */
export default function DesktopLogin() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const [state, setState] = useState('checking'); // checking | need-login | approving | done | error
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const loggedIn = !!auth.token;

  useEffect(() => {
    if (!code) {
      setError('授权链接不完整，请回到桌面版重新发起');
      setState('error');
      return;
    }
    if (!loggedIn) {
      setState('need-login');
      return;
    }
    let alive = true;
    setState('approving');
    api.post('/auth/device/approve', { code })
      .then((r) => {
        if (!alive) return;
        setName(r?.name || auth.teacher?.name || '');
        setState('done');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message || '授权失败');
        setState('error');
      });
    return () => { alive = false; };
  }, [code, loggedIn]);

  const loginHref = `/login?next=${encodeURIComponent(`/desktop-login?code=${code}`)}`;

  return (
    <div className="auth-bg relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8 text-center">
        <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto h-14 w-14 rounded-full" />
        <div className="eyebrow mt-5">Desktop Sign-in</div>
        <h1 className="display mt-2 text-[22px] font-semibold tracking-tight text-ink">浏览器授权登录</h1>

        {state === 'checking' && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-secondary">
            <Loader2 size={16} className="animate-spin text-[#0071e3]" />正在确认授权状态…
          </div>
        )}

        {state === 'need-login' && (
          <>
            <p className="mx-auto mt-4 max-w-xs text-[13px] leading-relaxed text-ink-secondary">
              请先登录网页端账号，登录成功后会自动为桌面版授权。
              浏览器记住登录后，以后可一键完成。
            </p>
            <Link
              to={loginHref}
              className="btn-pill brand-gradient mt-6 inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,113,227,0.6)]"
            >
              <LogIn size={16} /> 去登录并授权
            </Link>
          </>
        )}

        {state === 'approving' && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-secondary">
            <Loader2 size={16} className="animate-spin text-[#0071e3]" />正在授权桌面版…
          </div>
        )}

        {state === 'done' && (
          <>
            <div className="mx-auto mt-6 grid h-14 w-14 place-items-center rounded-full bg-[#28cd41]/12 text-[#1a7f2b]">
              <Check size={26} />
            </div>
            <p className="mt-4 text-[15px] font-semibold text-ink">
              已授权{name ? `：${name}` : ''}
            </p>
            <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-ink-secondary">
              请回到「教师工作台」桌面版窗口，无需再输入密码，将自动进入。
            </p>
            <div className="mt-6 flex items-center justify-center gap-1.5 rounded-xl border border-black/[0.06] bg-black/[0.02] px-3 py-2.5 text-[11px] text-ink-secondary">
              <MonitorDown size={13} /> 本页面可以关闭
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="mx-auto mt-6 grid h-14 w-14 place-items-center rounded-full bg-[#ff3b30]/10 text-[#b3251c]">
              <AlertTriangle size={24} />
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-secondary">{error}</p>
            <Link to="/" className="mt-6 inline-block text-xs font-medium text-[#0071e3] hover:underline">
              返回网页端首页 →
            </Link>
          </>
        )}

        <div className="hairline my-6" />
        <p className="text-[11px] leading-relaxed text-ink-secondary">
          授权码 5 分钟内有效、仅可使用一次。请勿将授权链接转发给他人。
        </p>
      </div>
      <BrandFooter fixed />
    </div>
  );
}
