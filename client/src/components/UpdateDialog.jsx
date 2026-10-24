import { useEffect, useState } from 'react';
import { Sparkles, Download, CheckCircle2, AlertCircle, X, RefreshCw } from 'lucide-react';

/* 调用壳命令；壳未注入时给出明确错误而不是静默失败 */
function call(cmd) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return Promise.reject(new Error('当前环境不支持检查更新'));
  return invoke(cmd);
}

/** 桌面端「检查更新」弹窗：与全站风格一致的卡片式，替代系统原生消息框 */
export default function UpdateDialog({ onClose }) {
  const [phase, setPhase] = useState('checking'); // checking | available | latest | installing | error
  const [info, setInfo] = useState({ version: '', notes: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    call('check_update')
      .then((r) => {
        if (!alive) return;
        if (r) {
          setInfo({ version: r.version || '', notes: r.notes || '' });
          setPhase('available');
        } else {
          setPhase('latest');
        }
      })
      .catch((e) => {
        if (!alive) return;
        setError(String(e?.message || e));
        setPhase('error');
      });
    return () => { alive = false; };
  }, []);

  const install = async () => {
    setPhase('installing');
    try {
      await call('install_update');
    } catch (e) {
      setError(String(e?.message || e));
      setPhase('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[380px] overflow-hidden rounded-[22px] bg-white shadow-[0_24px_70px_-18px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
        {/* 头部：品牌渐变图标 + 标题 */}
        <div className="relative flex items-center gap-3.5 px-6 pt-6">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg ${phase === 'error' ? 'bg-gradient-to-br from-[#ff9500] to-[#ff3b30] shadow-[#ff3b30]/30' : 'bg-gradient-to-br from-[#0071e3] to-[#28cd41] shadow-[#0071e3]/30'}`}>
            {phase === 'error' ? <AlertCircle size={20} /> : phase === 'latest' ? <CheckCircle2 size={20} /> : phase === 'available' ? <Download size={20} /> : <Sparkles size={20} />}
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-[#1d1d1f]">软件更新</div>
            <div className="mt-0.5 text-xs text-[#86868b]">
              {phase === 'checking' && '正在检查最新版本…'}
              {phase === 'available' && `发现新版本 v${info.version}`}
              {phase === 'latest' && '当前已是最新版本'}
              {phase === 'installing' && '正在下载并安装…'}
              {phase === 'error' && '检查更新未成功'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[#86868b] transition hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>

        {/* 正文 */}
        <div className="px-6 pb-6 pt-4">
          {phase === 'checking' && (
            <div className="flex items-center gap-2 rounded-xl bg-[#f5f5f7] px-3.5 py-3 text-[13px] text-[#6e6e73]">
              <RefreshCw size={14} className="animate-spin text-[#0071e3]" />
              正在与更新服务器通信
            </div>
          )}

          {phase === 'available' && (
            <div className="space-y-3">
              <div className="rounded-xl bg-[#f5f5f7] px-3.5 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[#86868b]">更新内容</div>
                <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1d1d1f]">
                  {info.notes || '体验优化与问题修复'}
                </div>
              </div>
              <p className="text-[12px] leading-relaxed text-[#86868b]">
                更新过程约需十几秒，完成后软件会自动重启，您的数据不受影响。
              </p>
            </div>
          )}

          {phase === 'latest' && (
            <div className="rounded-xl bg-[#f5f5f7] px-3.5 py-3 text-[13px] text-[#6e6e73]">
              您使用的已是最新版本，无需更新。
            </div>
          )}

          {phase === 'installing' && (
            <div className="space-y-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[#0071e3] to-[#28cd41]" />
              </div>
              <p className="text-[12px] text-[#86868b]">正在下载安装包，请勿关闭软件…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded-xl bg-[#fff5f5] px-3.5 py-3 text-[13px] leading-relaxed text-[#ff3b30]">
              更新失败：{error}
            </div>
          )}

          {/* 操作区 */}
          <div className="mt-5 flex items-center justify-end gap-2">
            {phase === 'available' ? (
              <>
                <button onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] transition hover:bg-black/5">
                  稍后再说
                </button>
                <button
                  onClick={install}
                  className="rounded-full bg-gradient-to-r from-[#0071e3] to-[#0a84ff] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(0,113,227,0.6)] transition hover:brightness-105"
                >
                  立即更新
                </button>
              </>
            ) : phase === 'installing' ? (
              <button disabled className="cursor-not-allowed rounded-full bg-[#e8e8ed] px-5 py-2 text-[13px] font-medium text-[#86868b]">
                更新中…
              </button>
            ) : (
              <button onClick={onClose} className="rounded-full bg-gradient-to-r from-[#0071e3] to-[#0a84ff] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(0,113,227,0.6)] transition hover:brightness-105">
                知道了
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
