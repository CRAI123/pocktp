import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { KeyRound, Sparkles, LogOut, ShoppingBag, CalendarClock, ExternalLink } from 'lucide-react';
import { api, auth, isMembershipActive, todayStr } from '../api.js';
import { Button, inputCls } from '../components/ui.jsx';

const XIANYU_URL = 'https://m.tb.cn/h.j1YRJO9?tk=LOXzTu26Lti';
const XIANYU_SHOP = 'Rayzo密钥事务所';

export default function Activate() {
  const navigate = useNavigate();
  const teacher = auth.teacher;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const expired = teacher?.activated && !isMembershipActive(teacher);

  // 会员有效 / 管理员 → 无需停留，用 <Navigate> 声明式跳转（避免渲染期调用 navigate 导致白屏/卡死）
  if (teacher && isMembershipActive(teacher)) {
    return <Navigate to="/" replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await api.post('/activation/redeem', { code });
      auth.save(auth.token, {
        ...teacher,
        activated: true,
        credits: r.credits,
        membership_expires_at: r.membership_expires_at || '',
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    auth.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo mx-auto mb-4 h-16 w-16 rounded-3xl" />
          <h1 className="text-2xl font-semibold tracking-tight">{expired ? '会员续费' : '激活账号'}</h1>
          <p className="brand-gradient-text mt-1 text-sm font-medium">连接创意与未来教育</p>
          <p className="mt-1.5 text-sm text-ink-secondary">
            {expired
              ? `会员已于 ${teacher.membership_expires_at} 到期，输入新激活码即可续费`
              : `${teacher?.name ? `${teacher.name}，` : ''}输入激活码解锁教学与班务全部功能`}
          </p>
        </div>

        <div className="card p-8">
          {expired && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#ff9500]/10 px-4 py-3 text-sm text-[#ff9500]">
              <CalendarClock size={16} />
              到期日 {teacher.membership_expires_at} · 今天 {todayStr()}，续费后未用完的天数会自动叠加
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="relative">
              <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary/60" />
              <input
                required autoFocus placeholder="XXXX-XXXX-XXXX-XXXX"
                className={`${inputCls} pl-10 text-center font-mono text-base tracking-widest uppercase`}
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-[#ff3b30]/8 px-4 py-2.5 text-sm text-[#ff3b30]">{error}</div>
            )}

            <Button type="submit" disabled={loading || !code.trim()} className="w-full justify-center py-2.5">
              <Sparkles size={16} />{loading ? '处理中…' : expired ? '立即续费' : '立即激活'}
            </Button>
          </form>

          <div className="mt-5 rounded-2xl bg-[#0071e3]/[0.06] px-4 py-3 text-xs leading-relaxed text-ink-secondary">
            <div className="flex items-center gap-1.5 font-medium text-[#0071e3]">
              <ShoppingBag size={13} /> 如何获取激活码
            </div>
            <p className="mt-1">
              前往闲鱼 App，搜索店铺名「<span className="font-semibold text-[#0071e3]">{XIANYU_SHOP}</span>」购买，或直接
              <a href={XIANYU_URL} target="_blank" rel="noopener noreferrer" className="mx-1 inline-flex items-center gap-0.5 font-medium text-[#0071e3] underline-offset-2 hover:underline">
                点击跳转闲鱼 <ExternalLink size={11} />
              </a>
              。每个激活码仅限一个账号使用，购买后请妥善保管。
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-ink-secondary transition hover:text-[#ff3b30]"
        >
          <LogOut size={15} /> 退出当前账号{teacher?.phone ? `（${teacher.phone}）` : ''}
        </button>
      </div>
    </div>
  );
}
