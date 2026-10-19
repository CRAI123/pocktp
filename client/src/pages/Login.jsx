import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Lock, User, LogIn } from 'lucide-react';
import { api, auth, isMembershipActive } from '../api.js';
import { Button, Field, inputCls } from '../components/ui.jsx';

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
    <div className="auth-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 品牌区：官网 LOGO + 产品名 + slogan */}
        <div className="mb-8 text-center">
          <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto mb-4 h-16 w-16 rounded-3xl" />
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

        {/* 演示账号提示 */}
        <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white/60 px-5 py-3.5 text-center text-xs leading-relaxed text-ink-secondary">
          演示账号：<code className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono">13800000000</code>
          密码：<code className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono">123456</code>（含完整演示数据）
        </div>
      </div>
    </div>
  );
}
