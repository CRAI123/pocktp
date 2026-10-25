/** 桌面端首次启动引导（右上角卡片）：
 *  - 系统通知：默认开启，不弹窗询问
 *  - 开机自启动 / 关闭窗口最小化到托盘：说明好处，让用户选「同意 / 不同意 / 不再提醒」
 *  选择只存本地，不上传云端。
 */
import { useEffect, useState } from 'react';
import { Power, PanelTopClose, Check, X } from 'lucide-react';
import { setAutostart, syncCloseToTray, isDesktopApp } from '../desktop.js';

const K_AUTO = 'tw_consent_autostart';
const K_TRAY = 'tw_consent_tray';

const read = (key) => {
  try { return localStorage.getItem(key) || 'ask'; } catch { return 'ask'; }
};
const write = (key, val) => {
  try { localStorage.setItem(key, val); } catch {}
};

function Choices({ busy, onPick }) {
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <button
        type="button" disabled={busy} onClick={() => onPick('agreed')}
        className="rounded-full bg-[#0071e3] px-3 py-1 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-[#0062c4] active:scale-[0.98] disabled:opacity-50"
      >
        同意
      </button>
      <button
        type="button" disabled={busy} onClick={() => onPick('declined')}
        className="rounded-full border border-black/[0.1] bg-white px-3 py-1 text-[11.5px] font-medium text-ink transition hover:border-black/[0.2] disabled:opacity-50"
      >
        不同意
      </button>
      <button
        type="button" disabled={busy} onClick={() => onPick('muted')}
        className="rounded-full px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary transition hover:bg-black/[0.04] disabled:opacity-50"
      >
        不再提醒
      </button>
    </div>
  );
}

function Item({ icon: Icon, title, desc, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#0071e3]/8 text-[#0071e3]">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-secondary">{desc}</p>
        {children}
      </div>
    </div>
  );
}

export default function DesktopConsent() {
  const [auto, setAuto] = useState(() => read(K_AUTO));
  const [tray, setTray] = useState(() => read(K_TRAY));
  const [busy, setBusy] = useState(false);

  /* 系统通知：桌面端强制开启，不做询问 */
  useEffect(() => {
    if (!isDesktopApp()) return;
    try { localStorage.setItem('tw_notify', '1'); } catch {}
  }, []);

  if (!isDesktopApp()) return null;

  const pick = async (kind, value) => {
    setBusy(true);
    if (kind === 'auto') {
      if (value !== 'muted') await setAutostart(value === 'agreed');
      write(K_AUTO, value);
      setAuto(value);
    } else {
      if (value !== 'muted') {
        localStorage.setItem('tw_close_tray', value === 'agreed' ? '1' : '0');
        syncCloseToTray(value === 'agreed');
      }
      write(K_TRAY, value);
      setTray(value);
    }
    setBusy(false);
  };

  const autoAsk = auto === 'ask';
  const trayAsk = tray === 'ask';
  if (!autoAsk && !trayAsk) return null;

  return (
    <div className="modal-in fixed right-4 top-12 z-40 w-[356px] max-w-[calc(100vw-2rem)]">
      <div className="card overflow-hidden border border-black/[0.06] p-4 shadow-[0_24px_60px_-30px_rgba(12,30,60,0.45)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-secondary/70">
            <Power size={12} /> 桌面版 · 首次配置
          </div>
          <span className="text-[10.5px] text-ink-secondary/60">仅需一次</span>
        </div>

        <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#28cd41]/8 px-3 py-2.5">
          <Check size={14} className="mt-0.5 shrink-0 text-[#1a7f2b]" />
          <div className="min-w-0 text-[11.5px] leading-relaxed text-ink-secondary">
            <b className="font-semibold text-ink">系统通知已为你开启</b>
            <br />
            AI 生成完成、上课前 10 / 5 分钟提醒会直接通过系统通知送达。
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {autoAsk && (
            <Item
              icon={Power}
              title="开机时自动启动"
              desc="开机后在托盘静默就绪，点开即用，不必再翻桌面找图标。"
            >
              <Choices busy={busy} onPick={(v) => pick('auto', v)} />
            </Item>
          )}
          {autoAsk && trayAsk && <div className="hairline" />}
          {trayAsk && (
            <Item
              icon={PanelTopClose}
              title="关闭窗口时最小化到托盘"
              desc="关掉窗口不会退出，点托盘图标即可继续，避免重复启动和草稿丢失。"
            >
              <Choices busy={busy} onPick={(v) => pick('tray', v)} />
            </Item>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-ink-secondary/60">
          <X size={11} /> 选择随时可在「桌面端设置」里修改
        </div>
      </div>
    </div>
  );
}
