import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Phone, Lock, User, LogIn, MonitorDown, ExternalLink, Loader2, Copy, Check, X,
  MonitorSmartphone, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { api, auth, isMembershipActive } from '../api.js';
import { Button, Field, inputCls, BrandFooter } from '../components/ui.jsx';
import { isDesktopApp } from '../components/Layout.jsx';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /* 登录后跳转（浏览器快捷登录页会在登录完成后回到授权页） */
  const next = (() => {
    const v = params.get('next') || '';
    return v.startsWith('/') && !v.startsWith('//') ? v : '';
  })();
  const [form, setForm] = useState({ phone: auth.lastPhone, password: '', name: '' });
  /* 记住登录：桌面版默认开启，下次打开免密直接进入 */
  const [remember, setRemember] = useState(() => {
    try {
      const saved = localStorage.getItem('tw_remember');
      if (saved != null) return saved !== '0';
    } catch {}
    return isDesktopApp();
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /* 桌面版以快捷登录为主，密码登录折叠在下方 */
  const [showPwd, setShowPwd] = useState(() => !isDesktopApp());

  /* 浏览器快捷登录：桌面版发起授权码 → 跳浏览器 → 轮询取回令牌 */
  const [deviceCode, setDeviceCode] = useState('');
  const [browser, setBrowser] = useState({ state: 'idle', url: '', error: '' });
  const [copied, setCopied] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { ...form, remember });
      auth.save(res.token, res.teacher, remember);
      navigate(next || (isMembershipActive(res.teacher) ? '/' : '/activate'), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* 授权完成前每 2 秒取一次令牌；拿到即写入本地并进入软件 */
  useEffect(() => {
    if (!deviceCode) return;
    let alive = true;
    let timer;
    const tick = async () => {
      try {
        const r = await api.get(`/auth/device/claim?code=${deviceCode}`);
        if (!alive) return;
        if (r?.token) {
          auth.save(r.token, r.teacher, true);
          navigate(isMembershipActive(r.teacher) ? '/' : '/activate', { replace: true });
          return;
        }
      } catch (err) {
        if (!alive) return;
        setBrowser({ state: 'expired', url: '', error: err.message });
        setDeviceCode('');
        return;
      }
      if (alive) timer = setTimeout(tick, 2000);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [deviceCode, navigate]);

  const startBrowserLogin = async () => {
    setError('');
    setCopied(false);
    setBrowser({ state: 'opening', url: '', error: '' });
    try {
      const r = await api.post('/auth/device/start', { remember: true });
      const url = `${location.origin}/desktop-login?code=${r.code}`;
      setDeviceCode(r.code);
      setBrowser({ state: 'waiting', url, error: '' });
      const invoke = window.__TAURI__?.core?.invoke;
      try {
        if (typeof invoke !== 'function') throw new Error('shell unavailable');
        await invoke('open_url', { url });
      } catch {
        /* 旧版壳没有 open_url 命令（或非桌面环境）：退化为复制链接手动打开 */
        setBrowser({ state: 'fallback', url, error: '' });
      }
    } catch (err) {
      setBrowser({ state: 'idle', url: '', error: '' });
      setError(err.message);
    }
  };

  const cancelBrowserLogin = () => {
    setDeviceCode('');
    setBrowser({ state: 'idle', url: '', error: '' });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(browser.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  /* 密码登录表单（桌面版折叠区与网页版共用） */
  const passwordForm = (extraClass = '', inlineError = null) => (
    <form onSubmit={submit} className={`space-y-4 ${extraClass}`}>
      <Field label="手机号">
        <div className="relative">
          <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/55" />
          <input
            required type="tel" inputMode="numeric" maxLength={11} placeholder="请输入 11 位手机号"
            className={`${inputCls} pl-10 max-sm:text-[16px]`}
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
          />
        </div>
      </Field>
      <Field label="密码">
        <div className="relative">
          <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/55" />
          <input
            required type="password" placeholder="至少 6 位"
            className={`${inputCls} pl-10 max-sm:text-[16px]`}
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
          />
        </div>
      </Field>
      <Field label="姓名（新账号首次登录自动注册时填写）">
        <div className="relative">
          <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/55" />
          <input
            placeholder="如：王老师（已有账号可留空）"
            className={`${inputCls} pl-10 max-sm:text-[16px]`}
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          />
        </div>
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-secondary">
        <input
          type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-black/20 accent-[#0071e3]"
        />
        记住登录，下次打开免密进入
      </label>

      {inlineError}

      <Button type="submit" disabled={loading} className="w-full py-3">
        <LogIn size={16} />{loading ? '登录中…' : '登录 / 注册'}
      </Button>
    </form>
  );

  /* ---------------- 桌面版：双栏「应用窗口」式登录 ---------------- */
  if (isDesktopApp()) {
    const statusTitle = {
      opening: '正在打开浏览器…',
      waiting: '请在浏览器中完成授权',
      fallback: '未能自动打开浏览器',
      expired: browser.error || '授权链接已过期',
    }[browser.state];

    const statusDesc = {
      opening: '正在调起系统默认浏览器，请稍候。',
      waiting: '授权完成后本窗口会自动进入，无需输入密码；链接 5 分钟内有效。',
      fallback: '请复制下方链接，在浏览器地址栏打开；完成后本窗口会自动进入。',
      expired: '请回到本窗口重新发起授权。',
    }[browser.state];

    const pending = browser.state === 'waiting' || browser.state === 'fallback';

    return (
      <div className="auth-bg relative flex min-h-[calc(100vh-2.25rem)] flex-col items-center justify-center overflow-hidden px-6 py-4">
        {/* 背景氛围光 */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-24 top-[16%] h-[420px] w-[420px] rounded-full bg-[#0071e3]/10 blur-[90px]" />
          <div className="absolute -right-20 bottom-[-8%] h-[380px] w-[380px] rounded-full bg-[#28cd41]/10 blur-[100px]" />
        </div>

        <div className="modal-in grid min-h-[520px] w-full max-w-[1060px] overflow-hidden rounded-[28px] bg-white/80 shadow-[0_40px_120px_-45px_rgba(12,30,60,0.5)] ring-1 ring-black/[0.06] backdrop-blur-2xl min-[880px]:grid-cols-[0.88fr_1.12fr] [@media(min-height:700px)]:min-h-[600px]">
          {/* 左：品牌面板（桌面版专属深色） */}
          <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#061326] p-10 text-white min-[880px]:flex">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -left-20 -top-24 h-80 w-80 rounded-full bg-[#0071e3]/35 blur-[110px]" />
              <div className="absolute -bottom-28 -right-16 h-96 w-96 rounded-full bg-[#28cd41]/20 blur-[120px]" />
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
              />
            </div>

            <div className="relative flex items-center gap-3">
              <img src="/rayzo-logo.png" alt="Rayzo" className="h-11 w-11 rounded-[14px] object-cover ring-1 ring-white/15" />
              <div className="leading-tight">
                <div className="text-[13px] font-semibold tracking-tight">Rayzo Teach</div>
                <div className="mt-0.5 text-[10.5px] text-white/45">教师工作台 · 桌面版</div>
              </div>
            </div>

            <div className="relative page-enter" style={{ animationDelay: '0.06s' }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Teacher Workspace</div>
              <h1 className="display mt-3 text-[34px] font-semibold leading-[1.16] tracking-tight">
                把教学与班务
                <br />
                收进一个工作台
              </h1>
              <p className="mt-3.5 max-w-[300px] text-[12.5px] leading-relaxed text-white/55">
                备课、批改、考勤与家校沟通，在一个窗口里完成。
              </p>
              <ul className="mt-7 space-y-3">
                {['浏览器快捷登录 · 免输密码', '更新自动推送 · 始终最新', '数据按教师账号隔离'].map(t => (
                  <li key={t} className="flex items-center gap-2.5 text-[12px] text-white/70">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/[0.08] ring-1 ring-white/15">
                      <Check size={10} className="text-[#5ee08a]" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative flex items-center gap-2 text-[10.5px] text-white/35">
              <span className="h-1.5 w-1.5 rounded-full bg-[#28cd41] shadow-[0_0_8px_rgba(40,205,65,0.8)]" />
              安全加密连接 · teach.rayzo.cn
            </div>
          </aside>

          {/* 右：登录操作区 */}
          <section className="relative flex flex-col justify-center bg-white/70 px-8 py-9 sm:px-12 [@media(max-height:700px)]:py-4">
            <div className="mx-auto w-full max-w-[392px]">
              <div className="page-enter">
                <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-secondary/70">
                  {showPwd ? <Lock size={13} /> : <MonitorSmartphone size={13} />}
                  {showPwd ? '桌面版 · 密码登录' : '桌面版 · 安全登录'}
                </div>
                <h2 className="display mt-3 text-[30px] font-semibold tracking-tight text-ink">
                  {showPwd ? '密码登录' : '欢迎回来'}
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                  {showPwd ? '手机号未注册将自动创建账号。' : '推荐用浏览器快捷登录，免输密码直接进入工作台。'}
                </p>
              </div>

              {/* 快捷登录 / 授权等待面板 */}
              {!showPwd && (
              <div className="page-enter mt-7 [@media(max-height:700px)]:mt-4" style={{ animationDelay: '0.08s' }}>
                {browser.state === 'idle' ? (
                  <button
                    type="button" onClick={startBrowserLogin}
                    className="group relative flex w-full items-center gap-3.5 overflow-hidden rounded-[18px] bg-gradient-to-r from-[#0071e3] via-[#0a84ff] to-[#22b36a] px-4 py-3.5 text-left text-white shadow-[0_18px_40px_-18px_rgba(0,113,227,0.75)] transition hover:brightness-[1.04] active:scale-[0.99]"
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                      <ExternalLink size={18} />
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold tracking-tight">浏览器快捷登录</span>
                      <span className="mt-0.5 block text-[11.5px] text-white/80">调起浏览器授权，完成后自动进入</span>
                    </span>
                    <ArrowRight size={17} className="relative shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ) : (
                  <div aria-live="polite" className="rounded-[18px] bg-[#f5f7fb] p-4 ring-1 ring-black/[0.05]">
                    <div className="flex items-start gap-3">
                      <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center">
                        {browser.state !== 'expired' && (
                          <span className="absolute inset-0 animate-ping rounded-full bg-[#0071e3]/10" />
                        )}
                        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-black/[0.06] shadow-sm">
                          {browser.state === 'expired'
                            ? <X size={15} className="text-[#d70015]" />
                            : <Loader2 size={15} className="animate-spin text-[#0071e3]" />}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ink">{statusTitle}</div>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">{statusDesc}</p>

                        {pending && (
                          <>
                            <div className="mt-2.5 break-all rounded-lg bg-white px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-ink-secondary ring-1 ring-black/[0.05]">
                              {browser.url}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <button type="button" onClick={copyLink}
                                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-black/[0.16]">
                                {copied ? <Check size={12} className="text-[#28cd41]" /> : <Copy size={12} />}
                                {copied ? '已复制' : '复制链接'}
                              </button>
                              <button type="button" onClick={cancelBrowserLogin}
                                className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition hover:bg-black/[0.04]">
                                取消
                              </button>
                            </div>
                          </>
                        )}

                        {browser.state === 'expired' && (
                          <button type="button" onClick={startBrowserLogin}
                            className="mt-2.5 rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-black/[0.16]">
                            重新发起
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

              {!showPwd && error && (
                <div className="mt-4 rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-[12.5px] text-[#b3251c]">{error}</div>
              )}

              {!showPwd ? (
                /* 密码登录入口：切换视图而非展开表单，保持卡片高度稳定 */
                <button
                  type="button"
                  onClick={() => { setError(''); setShowPwd(true); }}
                  className="page-enter mt-3.5 flex w-full items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white/80 py-3 text-[12.5px] font-semibold text-ink shadow-sm transition hover:border-black/[0.16] hover:bg-white active:scale-[0.99]"
                  style={{ animationDelay: '0.14s' }}
                >
                  <Lock size={14} className="text-ink-secondary/70" /> 使用手机号密码登录
                </button>
              ) : (
                <>
                  <div className="page-enter mt-5 [@media(max-height:700px)]:mt-3">
                    {passwordForm('', error && (
                      <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#b3251c]">{error}</div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setShowPwd(false); }}
                    className="mx-auto mt-4 flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary transition hover:text-ink [@media(max-height:700px)]:mt-2.5"
                  >
                    <ArrowLeft size={13} /> 返回浏览器快捷登录
                  </button>
                </>
              )}

              <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-secondary/80 [@media(max-height:700px)]:mt-3">
                新账号需使用激活码解锁完整功能 · 登录即代表同意隐私说明
              </p>
            </div>
          </section>
        </div>

        <BrandFooter className="mt-4 !pb-0 [@media(max-height:700px)]:hidden" />
      </div>
    );
  }

  /* ---------------- 网页 / 手机：保持原有单栏排版 ---------------- */
  return (
    <div className="auth-bg relative flex min-h-screen items-center justify-center px-4 py-10 sm:py-14">
      {/* 品牌氛围装饰：卡片后方斜向重复排版的渐变文字（纯装饰，不拦截交互） */}
      <div className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden" aria-hidden="true">
        <div className="absolute -inset-[16%] -rotate-6 flex flex-col justify-between py-[8%] opacity-[0.09]">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div
              key={i}
              className={`brand-gradient-text whitespace-nowrap text-xl font-extrabold tracking-[0.25em] sm:text-3xl ${i % 2 ? 'pl-16 sm:pl-28' : ''}`}
            >
              {'Rayzo Teach · '.repeat(18)}
            </div>
          ))}
        </div>
      </div>

      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* 左侧：品牌主张（窄屏精简为标题区） */}
        <div className="text-center lg:text-left">
          <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto mb-4 h-14 w-14 rounded-full sm:mb-6 sm:h-16 sm:w-16 lg:mx-0 lg:h-[72px] lg:w-[72px]" />
          <div className="eyebrow">Rayzo · Teacher Workspace</div>
          <h1 className="display mt-3 text-[27px] font-semibold leading-[1.18] tracking-tight text-ink sm:text-[40px] sm:leading-[1.15]">
            把教学与班务
            <br />
            收进一个工作台
          </h1>
          <p className="brand-gradient-text mt-4 text-base font-semibold sm:text-lg">连接创意与未来教育</p>
          <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-ink-secondary sm:text-sm lg:mx-0">
            备课出题、作业批改、考勤课表、家校沟通与 AI 辅助，日常琐事在这里一次完成。
          </p>

          <div className="mt-7 hidden flex-wrap gap-2 lg:flex">
            {['AI 出题与批改', '课程表与上课提醒', '班务一体化', '桌面端免密登录'].map(t => (
              <span key={t} className="rounded-full border border-black/[0.06] bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ink-secondary backdrop-blur">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* 右侧：登录卡片 */}
        <div className="card mx-auto w-full max-w-md p-5 sm:p-8">
          <div className="mb-4 sm:mb-6">
            <div className="eyebrow">Welcome back</div>
            <h2 className="display mt-2 text-[22px] font-semibold tracking-tight text-ink">登录 / 注册</h2>
            <p className="mt-1.5 text-[13px] text-ink-secondary">手机号未注册将自动创建账号</p>
          </div>

          {passwordForm('', error && (
            <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#b3251c]">{error}</div>
          ))}

          <div className="hairline my-5" />

          <p className="text-center text-[11px] leading-relaxed text-ink-secondary">
            新账号需使用激活码解锁完整功能 · 登录即代表同意隐私说明
          </p>

          <Link
            to="/download"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-full border border-[#0071e3]/15 bg-[#0071e3]/[0.06] px-4 py-2.5 text-xs font-semibold text-[#0071e3] transition hover:bg-[#0071e3]/10"
          >
            <MonitorDown size={14} className="shrink-0" /> 推荐下载 Windows 桌面版
            <span className="hidden sm:inline">· 双击即开，上课更专注</span>
          </Link>
        </div>
      </div>

      <BrandFooter fixed />
    </div>
  );
}
