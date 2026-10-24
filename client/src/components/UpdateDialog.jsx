import { useEffect, useState } from 'react';
import {
  Sparkles, Download, CheckCircle2, AlertCircle, X, RefreshCw, Info,
} from 'lucide-react';

/* 调用壳命令；壳未注入时给出明确错误而不是静默失败 */
function call(cmd) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return Promise.reject(new Error('当前环境不支持检查更新'));
  return invoke(cmd);
}

const PRIMARY =
  'rounded-full bg-gradient-to-r from-[#0071e3] to-[#0a84ff] px-5 py-2 text-[13px] font-semibold text-white ' +
  'shadow-[0_10px_24px_-10px_rgba(0,113,227,0.75)] transition hover:brightness-105 active:scale-[0.97]';
const GHOST =
  'rounded-full px-4 py-2 text-[13px] font-medium text-[#6e6e73] transition hover:bg-black/5 active:scale-[0.97]';

/** 桌面端「检查更新」弹窗：品牌渐变卡片，替代系统原生消息框 */
export default function UpdateDialog({ onClose }) {
  const [phase, setPhase] = useState('checking'); // checking | available | latest | installing | error
  const [info, setInfo] = useState({ version: '', notes: '' });
  const [error, setError] = useState('');

  const check = () => {
    setPhase('checking');
    setError('');
    call('check_update')
      .then((r) => {
        if (r) {
          setInfo({ version: r.version || '', notes: r.notes || '' });
          setPhase('available');
        } else {
          setPhase('latest');
        }
      })
      .catch((e) => {
        setError(String(e?.message || e));
        setPhase('error');
      });
  };

  useEffect(check, []);

  /* Esc 关闭（安装中除外） */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && phase !== 'installing') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  const install = async () => {
    setPhase('installing');
    setError('');
    try {
      await call('install_update');
    } catch (e) {
      setError(String(e?.message || e));
      setPhase('error');
    }
  };

  const subtitle = {
    checking: '正在检查最新版本…',
    available: '发现新版本，建议立即更新',
    latest: '检查完成',
    installing: '正在下载并安装…',
    error: '更新未完成，请稍后重试',
  }[phase];

  return (
    <div
      onClick={phase === 'installing' ? undefined : onClose}
      className="fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-in relative w-full max-w-[400px] overflow-hidden rounded-[24px] bg-white shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.06]"
      >
        {/* 顶部品牌光晕 */}
        <div className="pointer-events-none absolute -top-28 left-1/2 h-44 w-[440px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#0071e3]/20 via-[#28cd41]/15 to-[#0071e3]/5 blur-2xl" />

        {/* 头部：品牌渐变图标 + 标题 */}
        <div className="relative flex items-start gap-3.5 px-6 pt-6">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-white ${
              phase === 'error'
                ? 'bg-gradient-to-br from-[#ff9500] to-[#ff3b30] shadow-[0_10px_22px_-8px_rgba(255,59,48,0.7)]'
                : 'bg-gradient-to-br from-[#0071e3] to-[#28cd41] shadow-[0_10px_22px_-8px_rgba(0,113,227,0.65)]'
            }`}
          >
            {phase === 'error' ? <AlertCircle size={20} />
              : phase === 'latest' ? <CheckCircle2 size={20} />
              : phase === 'available' ? <Download size={20} />
              : <Sparkles size={20} />}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">软件更新</span>
              {phase === 'available' && info.version && (
                <span className="rounded-full bg-[#0071e3]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0071e3]">
                  v{info.version}
                </span>
              )}
              {phase === 'latest' && (
                <span className="rounded-full bg-[#28cd41]/12 px-2 py-0.5 text-[11px] font-semibold text-[#1f9e33]">
                  已是最新
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-[#86868b]">{subtitle}</div>
          </div>

          <button
            onClick={onClose}
            disabled={phase === 'installing'}
            aria-label="关闭"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#86868b] transition hover:bg-black/5 disabled:opacity-30"
          >
            <X size={16} />
          </button>
        </div>

        {/* 正文 */}
        <div className="relative px-6 pt-4">
          {phase === 'checking' && (
            <div className="rounded-2xl bg-[#f5f5f7]/80 p-4">
              <div className="flex items-center gap-2 text-[13px] text-[#6e6e73]">
                <RefreshCw size={14} className="animate-spin text-[#0071e3]" />
                正在与更新服务器通信
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#e8e8ed]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[#0071e3] to-[#28cd41]" />
              </div>
            </div>
          )}

          {phase === 'available' && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl bg-[#f5f5f7]">
                <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#0071e3] to-[#28cd41]" />
                <div className="px-4 py-3 pl-5">
                  <div className="text-[11px] font-semibold tracking-wider text-[#86868b]">更新内容</div>
                  <div className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[#1d1d1f]">
                    {info.notes || '体验优化与问题修复'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 rounded-2xl bg-[#0071e3]/[0.04] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#6e6e73]">
                <Info size={14} className="mt-0.5 shrink-0 text-[#0071e3]" />
                更新约需十几秒，完成后软件自动重启，您的数据不受影响。
              </div>
            </div>
          )}

          {phase === 'latest' && (
            <div className="flex flex-col items-center pb-1 pt-2">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-[#28cd41]/10 text-[#1f9e33] ring-1 ring-[#28cd41]/25">
                <CheckCircle2 size={26} />
              </div>
              <div className="mt-3 text-[15px] font-semibold tracking-tight text-[#1d1d1f]">已是最新版本</div>
              <p className="mt-1 text-center text-xs leading-relaxed text-[#86868b]">
                您正在使用的版本无需更新<br />按 F5 可随时再次检查
              </p>
            </div>
          )}

          {phase === 'installing' && (
            <div className="rounded-2xl bg-[#f5f5f7]/80 p-4">
              <div className="flex items-center justify-between text-[12px] text-[#6e6e73]">
                <span>正在下载安装包</span>
                <span className="text-[#86868b]">请勿关闭软件</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[#0071e3] to-[#28cd41]" />
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex gap-2.5 rounded-2xl bg-[#fff2f2] px-3.5 py-3 ring-1 ring-[#ff3b30]/10">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#ff3b30]" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#ff3b30]">更新未完成</div>
                <div className="mt-1 break-words text-[12px] leading-relaxed text-[#b3261e]">{error || '未知错误'}</div>
              </div>
            </div>
          )}
        </div>

        {/* 操作区 */}
        <div className="relative flex items-center justify-end gap-2 px-6 pb-6 pt-5">
          {phase === 'available' ? (
            <>
              <button onClick={onClose} className={GHOST}>稍后再说</button>
              <button onClick={install} className={PRIMARY}>立即更新</button>
            </>
          ) : phase === 'installing' ? (
            <button disabled className="cursor-not-allowed rounded-full bg-[#e8e8ed] px-5 py-2 text-[13px] font-medium text-[#86868b]">
              更新中…
            </button>
          ) : phase === 'latest' ? (
            <>
              <button onClick={check} className={GHOST}>重新检查</button>
              <button onClick={onClose} className={PRIMARY}>知道了</button>
            </>
          ) : (
            <button onClick={onClose} className={PRIMARY}>知道了</button>
          )}
        </div>
      </div>
    </div>
  );
}
