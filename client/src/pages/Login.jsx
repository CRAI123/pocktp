import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Lock, User, LogIn, MonitorDown } from 'lucide-react';
import { api, auth, isMembershipActive } from '../api.js';
import { Button, Field, inputCls, BrandFooter } from '../components/ui.jsx';
import { isDesktopApp } from '../components/Layout.jsx';

export default function Login() {
  const navigate = useNavigate();
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

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { ...form, remember });
      auth.save(res.token, res.teacher, remember);
      navigate(isMembershipActive(res.teacher) ? '/' : '/activate', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
          <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto mb-6 h-16 w-16 rounded-full lg:mx-0 lg:h-[72px] lg:w-[72px]" />
          <div className="eyebrow">Rayzo · Teacher Workspace</div>
          <h1 className="display mt-3 text-[30px] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[40px]">
            把教学与班务
            <br className="hidden sm:block" />
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
        <div className="card mx-auto w-full max-w-md p-7 sm:p-8">
          <div className="mb-6">
            <div className="eyebrow">Welcome back</div>
            <h2 className="display mt-2 text-[22px] font-semibold tracking-tight text-ink">登录 / 注册</h2>
            <p className="mt-1.5 text-[13px] text-ink-secondary">手机号未注册将自动创建账号</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="手机号">
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/55" />
                <input
                  required type="tel" inputMode="numeric" maxLength={11} placeholder="请输入 11 位手机号"
                  className={`${inputCls} pl-10`}
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
                  className={`${inputCls} pl-10`}
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </Field>
            <Field label="姓名（新账号首次登录自动注册时填写）">
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/55" />
                <input
                  placeholder="如：王老师（已有账号可留空）"
                  className={`${inputCls} pl-10`}
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
              {isDesktopApp() && <span className="rounded-full bg-[#28cd41]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#1a7f2b]">桌面版推荐</span>}
            </label>

            {error && (
              <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#b3251c]">{error}</div>
            )}

            <Button type="submit" disabled={loading} className="w-full py-3">
              <LogIn size={16} />{loading ? '登录中…' : '登录 / 注册'}
            </Button>
          </form>

          <div className="hairline my-5" />

          <p className="text-center text-[11px] leading-relaxed text-ink-secondary">
            新账号需使用激活码解锁完整功能 · 登录即代表同意隐私说明
          </p>

          {!isDesktopApp() && (
            <Link
              to="/download"
              className="mt-4 flex items-center justify-center gap-1.5 rounded-full border border-[#0071e3]/15 bg-[#0071e3]/[0.06] px-4 py-2.5 text-xs font-semibold text-[#0071e3] transition hover:bg-[#0071e3]/10"
            >
              <MonitorDown size={14} /> 推荐下载 Windows 桌面版 · 双击即开，上课更专注
            </Link>
          )}
        </div>
      </div>

      <BrandFooter fixed />
    </div>
  );
}
