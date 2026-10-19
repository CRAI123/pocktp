import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Lock, User, LogIn } from 'lucide-react';
import { api, auth, isMembershipActive } from '../api.js';
import { Button, Field, inputCls, BrandFooter } from '../components/ui.jsx';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      auth.save(res.token, res.teacher);
      navigate(isMembershipActive(res.teacher) ? '/' : '/activate', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg relative flex min-h-screen items-center justify-center px-4 pb-16">
      {/* 品牌氛围装饰：卡片后方斜向重复排版的渐变文字（纯装饰，不拦截交互） */}
      <div className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden" aria-hidden="true">
        <div className="absolute -inset-[16%] -rotate-6 flex flex-col justify-between py-[8%] opacity-[0.12]">
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

      <div className="w-full max-w-md">
        {/* 品牌区：官网 LOGO + 产品名 + slogan */}
        <div className="mb-8 text-center">
          <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto mb-5 h-20 w-20 rounded-full" />
          <h1 className="text-2xl font-semibold tracking-tight">教师工作台</h1>
          <p className="brand-gradient-text mt-1 text-sm font-medium">连接创意与未来教育</p>
          <p className="mt-1.5 text-sm text-ink-secondary">教学管理与班务处理一体化平台</p>
        </div>

        <div className="card p-8">
          <form onSubmit={submit} className="space-y-4">
            <Field label="手机号">
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
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
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
                <input
                  required type="password" placeholder="至少 6 位"
                  className={`${inputCls} pl-10`}
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </Field>
            <Field label="姓名（新账号首次登录自动注册时填写）">
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
                <input
                  placeholder="如：王老师（已有账号可留空）"
                  className={`${inputCls} pl-10`}
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </Field>

            {error && (
              <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{error}</div>
            )}

            <Button type="submit" disabled={loading} className="w-full justify-center py-2.5">
              <LogIn size={16} />{loading ? '登录中…' : '登录 / 注册'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs leading-relaxed text-ink-secondary">
            手机号未注册将自动创建账号；新账号需使用激活码解锁完整功能
          </p>
        </div>
      </div>

      <BrandFooter fixed />
    </div>
  );
}
