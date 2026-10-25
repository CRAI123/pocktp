/** 桌面设置：开机自启 / 关闭到托盘 / 完成通知 / 快捷键说明（仅桌面端可见） */
import { useEffect, useState } from 'react';
import { Keyboard, Bell, Power, PanelTopClose } from 'lucide-react';
import { Modal } from './ui.jsx';
import { getAutostart, setAutostart, syncCloseToTray, isDesktopApp } from '../desktop.js';

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-[#0071e3]' : 'bg-black/15'} ${disabled ? 'opacity-50' : ''}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Row({ icon: Icon, title, desc, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-black/5 bg-bg-light/60 p-3.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#0071e3] shadow-sm">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{desc}</div>
      </div>
      {children}
    </div>
  );
}

export default function DesktopSettings({ onClose }) {
  const [auto, setAuto] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [toTray, setToTray] = useState(localStorage.getItem('tw_close_tray') === '1');

  useEffect(() => {
    if (!isDesktopApp()) return;
    getAutostart().then(setAuto);
  }, []);

  const changeAuto = async (v) => {
    setAutoBusy(true);
    const real = await setAutostart(v);
    setAuto(real);
    setAutoBusy(false);
  };

  const changeTray = (v) => {
    setToTray(v);
    localStorage.setItem('tw_close_tray', v ? '1' : '0');
    syncCloseToTray(v);
  };

  return (
    <Modal open onClose={onClose} title="桌面端设置" width="max-w-md">
      <div className="space-y-2.5">
        <Row icon={Power} title="开机自动启动" desc="随 Windows 启动后在系统托盘常驻，不弹窗打扰">
          <Toggle on={auto} onChange={changeAuto} disabled={autoBusy} />
        </Row>
        <Row icon={PanelTopClose} title="关闭窗口时最小化到托盘" desc="关闭后不退出程序，点击托盘图标随时唤起；关闭则直接退出">
          <Toggle on={toTray} onChange={changeTray} />
        </Row>
        <Row icon={Bell} title="系统通知" desc="AI 出卷/周报生成完成、上课前 10 / 5 分钟提醒均通过系统通知弹出（为保证提醒不遗漏，始终开启）">
          <span className="rounded-full bg-[#28cd41]/10 px-2 py-0.5 text-[11px] font-medium text-[#1a7f2b]">始终开启</span>
        </Row>
      </div>

      <div className="mt-4 rounded-xl border border-black/5 bg-bg-light/60 p-3.5">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Keyboard size={15} className="text-[#0071e3]" /> 快捷键
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-ink-secondary">
          <span>Ctrl + R</span><span className="text-ink">刷新页面</span>
          <span>Ctrl + 加号</span><span className="text-ink">界面放大</span>
          <span>Ctrl + 减号</span><span className="text-ink">界面缩小</span>
          <span>Ctrl + 0</span><span className="text-ink">恢复 100%</span>
          <span>F11</span><span className="text-ink">全屏 / 退出全屏</span>
          <span>F5</span><span className="text-ink">检查更新</span>
        </div>
      </div>

      <div className="mt-3 text-center text-[11px] text-ink-secondary">
        教师工作台桌面版 v2.0.0 · 由 Rayzo 提供 · 无捆绑 / 无自启异常 / 卸载干净
      </div>
    </Modal>
  );
}
