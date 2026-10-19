import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { KeyRound, Sparkles, Phone, Lock, User, Zap, CheckCircle2, ArrowRight, CalendarClock } from 'lucide-react';
import { api, auth } from '../api.js';
import { Button, Field, inputCls } from '../components/ui.jsx';

/** 激活码分组显示：XXXX-XXXX-XXXX-XXXX */
const fmtCode = (c) => (c || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * 公开兑换页：/redeem/:code?
 * - 可直接把链接发给买家，码自动预填
 * - 未登录：页内完成登录/注册并自动激活，算力到账
 * - 已登录：可激活或续费（有效期自动叠加）
 */
export default function Redeem() {
  const navigate = useNavigate();
  const params = useParams();
  const [code, setCode] = useState(normCode(params.code));
  const [form, setForm] = useState({ phone: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null); // 兑换成功响应

  const teacher = auth.teacher;
  const codeDisplay = useMemo(() => fmtCode(code), [code]);

  /** 兑换核心：登录（如需）→ 兑换 → 落本地登录态 */
  const activate = async (loginPayload) => {
    const normalized = normCode(code);
    if (!normalized) throw new Error('请输入激活码');

    let current = teacher;
    if (!auth.token) {
      const res = await api.post('/auth/login', loginPayload);
      auth.save(res.token, res.teacher);
      current = res.teacher;
    }
    if (current.is_admin) throw new Error('管理员账号无需激活');

    const r = await api.post('/activation/redeem', { code: normalized });
    auth.save(auth.token, {
      ...current,
      activated: true,
      credits: r.credits,
      membership_expires_at: r.membership_expires_at || '',
    });
    return r;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setDone(await activate(form));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto mb-4 h-16 w-16 rounded-3xl" />
          <h1 className="text-2xl font-semibold tracking-tight">激活教师工作台</h1>
          <p className="brand-gradient-text mt-1 text-sm font-medium">连接创意与未来教育</p>
          <p className="mt-1.5 text-sm text-ink-secondary">登录或注册后自动完成激活，解锁全部功能与算力</p>
        </div>

        {done ? (
          /* 激活 / 续费成功 */
          <div className="card p-8 text-center">
            <CheckCircle2 size={52} className="mx-auto text-[#28cd41]" />
            <h2 className="mt-4 text-xl font-semibold">{done.renewal ? '续费成功' : '激活成功'}</h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              {done.renewal ? '会员有效期已延长' : '完整教学与班务功能已解锁'}
            </p>
            <div className="mt-5 space-y-2.5">
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#ff9500]/10 px-4 py-3 text-[#ff9500]">
                <Zap size={18} />
                <span className="text-sm">获得算力 <b className="text-lg">{done.credits_gained}</b>，当前余额 <b className="text-lg">{done.credits}</b></span>
              </div>
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#0071e3]/[0.07] px-4 py-3 text-[#0071e3]">
                <CalendarClock size={18} />
                <span className="text-sm">
                  {done.valid_days > 0 ? <>会员有效期至 <b>{done.membership_expires_at}</b>（{done.valid_days} 天）</> : <b>永久会员</b>}
                </span>
              </div>
            </div>
            <Button className="mt-6 w-full justify-center py-2.5" onClick={() => navigate('/', { replace: true })}>
              进入工作台 <ArrowRight size={16} />
            </Button>
          </div>
        ) : (
          <div className="card p-8">
            {/* 激活码 */}
            <Field label="激活码">
              <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
                <input
                  required autoFocus placeholder="XXXX-XXXX-XXXX-XXXX"
                  className={`${inputCls} pl-10 text-center font-mono text-base tracking-widest uppercase`}
                  value={codeDisplay}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                />
              </div>
            </Field>

            <form onSubmit={submit} className="mt-4 space-y-4">
              {!auth.token && (
                <>
                  <Field label="手机号">
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
                      <input
                        required type="tel" inputMode="numeric" maxLength={11} placeholder="11 位手机号"
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
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                      />
                    </div>
                  </Field>
                  <Field label="姓名（新账号填写，老账号留空）">
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
                      <input
                        placeholder="如：王老师"
                        className={`${inputCls} pl-10`}
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                  </Field>
                </>
              )}

              {error && (
                <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{error}</div>
              )}

              <Button type="submit" disabled={loading || !normCode(code)} className="w-full justify-center py-2.5">
                <Sparkles size={16} />{loading ? '处理中…' : auth.token ? `以「${teacher?.name}」身份激活 / 续费` : '登录 / 注册并激活'}
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-secondary">
              <Zap size={13} className="text-[#ff9500]" /> 激活码内含算力与会员时长，可用于智能分析等功能
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
