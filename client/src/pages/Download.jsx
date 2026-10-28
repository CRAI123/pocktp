/** 桌面版下载页：宣传 + 软件/网站对比 + 自动开始下载
 *  - 公开路由（无需登录），登录页与侧边栏入口均跳转到此页
 *  - 进入后倒计时自动开始下载 exe，可取消；桌面端内访问时提示已在桌面版中
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MonitorDown, Check, X, ShieldCheck, ArrowLeft, Sparkles,
  MonitorSmartphone, Globe, Zap, RefreshCw, Trash2, Lock, Package,
  AlertTriangle, MousePointerClick, Shield, Copy, CheckCheck,
} from 'lucide-react';
import { BrandFooter } from '../components/ui.jsx';
import { isDesktopApp } from '../components/Layout.jsx';

const EXE_URL = '/desktop/teacher-workbench-setup.exe';
const EXE_NAME = '教师工作台-安装包.exe';
const VERSION = 'v2.0.3';
const SIZE = '约 71 MB';
const SHA256 = 'E372BE957D8FA534CA273E49FD00F6E1654A1C9C4D5529D2377F38E75D142A9F';

/* 安装步骤：双击 → SmartScreen 放行 → 完成 */
const INSTALL_STEPS = [
  {
    icon: MousePointerClick,
    title: '双击安装包',
    desc: '下载完成后双击 .exe 文件，按提示选择安装位置（可免管理员权限）。',
  },
  {
    icon: AlertTriangle,
    title: '若提示「Windows 已保护你的电脑」',
    desc: '这是 SmartScreen 对未签名新应用的常规提示，并非病毒。点击「更多信息」→「仍要运行」即可继续。',
    tone: 'amber',
  },
  {
    icon: ShieldCheck,
    title: '完成安装',
    desc: '安装结束后双击桌面图标即可使用。若仍被拦截，可右键安装包 →「属性」→ 勾选「解除锁定」。',
  },
];


/* 干净承诺：安装与运行全程透明 */
const CLEAN_PROMISES = [
  { icon: Package, text: '无捆绑软件，安装包只有一个主程序' },
  { icon: Zap, text: '开机自启可选，默认关闭，不点图标绝不运行' },
  { icon: RefreshCw, text: '无静默安装，版本更新需你确认' },
  { icon: Lock, text: '免管理员权限，学校受限电脑也能装' },
  { icon: Trash2, text: '卸载干净利落，不留后台服务与驻留进程' },
  { icon: ShieldCheck, text: '主体可溯：Rayzo 集团出品' },
];

/* 软件 / 网站对比：✓ 优势 · ○ 一般 · — 无 */
const COMPARE_ROWS = [
  { label: '打开方式', desk: '双击桌面图标即开', web: '浏览器输入网址', deskLevel: 2, webLevel: 1 },
  { label: '上课常驻', desk: '独立窗口，无浏览器标签干扰', web: '挤在浏览器标签页中', deskLevel: 2, webLevel: 0 },
  { label: '投屏上课', desk: '课堂小助手独立窗口，可分屏并排', web: '需拉第二个浏览器窗口', deskLevel: 2, webLevel: 0 },
  { label: '打印试卷', desk: '一键直出默认打印机，免预览', web: '浏览器打印，需手动选纸张', deskLevel: 2, webLevel: 1 },
  { label: '完成后提醒', desk: '出卷 / 周报生成后系统通知', web: '需自己盯着页面', deskLevel: 2, webLevel: 0 },
  { label: '版本更新', desk: '启动时提醒，一键更新', web: '打开即是最新版', deskLevel: 2, webLevel: 2 },
  { label: '安装', desk: `需下载一次（${SIZE}）`, web: '无需安装', deskLevel: 1, webLevel: 2 },
  { label: '设备支持', desk: 'Windows 电脑', web: '手机 / 平板 / 电脑任意设备', deskLevel: 1, webLevel: 2 },
  { label: '数据互通', desk: '同一账号，实时同步', web: '同一账号，实时同步', deskLevel: 2, webLevel: 2 },
];

function Mark({ level }) {
  if (level === 2) return <Check size={15} className="inline text-[#28cd41]" strokeWidth={3} />;
  if (level === 1) return <span className="text-[#6e6e73]">○</span>;
  return <X size={14} className="inline text-[#c7c7cc]" strokeWidth={2.5} />;
}

export default function Download() {
  const desktop = isDesktopApp();
  /* 自动下载：3 秒倒计时，可取消 */
  const [countdown, setCountdown] = useState(desktop ? null : 3);
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  const startDownload = () => {
    if (started) return;
    setStarted(true);
    const a = document.createElement('a');
    a.href = EXE_URL;
    a.download = EXE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(SHA256);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  useEffect(() => {
    if (countdown == null || started) return undefined;
    if (countdown <= 0) { startDownload(); return undefined; }
    timerRef.current = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [countdown, started]);

  return (
    <div className="auth-bg relative min-h-screen pb-20">
      {/* 顶栏 */}
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 pt-6">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-[#6e6e73] transition hover:text-[#1d1d1f]">
          <ArrowLeft size={16} /> 返回登录
        </Link>
        <span className="text-xs text-[#86868b]">teach.rayzo.cn</span>
      </header>

      <main className="mx-auto max-w-4xl px-5">
        {/* Hero */}
        <section className="mt-10 text-center sm:mt-14">
          <img src="/rayzo-logo.png" alt="教师工作台" className="brand-logo mx-auto h-20 w-20 rounded-[1.4rem]" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            教师工作台 <span className="brand-gradient-text">Windows 桌面版</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#6e6e73] sm:text-base">
            双击图标即开，上课常驻不打扰。与网页版同一账号、数据实时同步——
            <span className="font-medium text-[#1d1d1f]">教室里用桌面版，出门在外用网页版</span>。
          </p>

          {/* 下载按钮区 */}
          <div className="mt-7 flex flex-col items-center gap-3">
            {desktop ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-[#28cd41]/10 px-6 py-3 text-sm font-medium text-[#1fa733]">
                <Check size={16} strokeWidth={3} /> 你正在使用桌面版，无需下载
              </div>
            ) : (
              <>
                <button
                  onClick={startDownload}
                  className="btn-pill inline-flex items-center gap-2 bg-gradient-to-r from-[#0071e3] to-[#0a84ff] px-8 py-3.5 text-base font-semibold text-white shadow-[0_14px_30px_-10px_rgba(0,113,227,0.6)] transition hover:brightness-105"
                >
                  <MonitorDown size={19} /> 立即下载桌面版
                </button>
                <div className="text-xs text-[#86868b]">
                  {started ? (
                    <span className="inline-flex items-center gap-1 text-[#1fa733]"><Check size={13} strokeWidth={3} /> 下载已开始，请在浏览器下载列表中查看</span>
                  ) : countdown != null ? (
                    <span>
                      {countdown} 秒后自动开始下载 ·{' '}
                      <button className="underline underline-offset-2 hover:text-[#1d1d1f]" onClick={() => setCountdown(null)}>取消</button>
                    </span>
                  ) : (
                    <span>已取消自动下载，可点击上方按钮手动下载</span>
                  )}
                </div>
                <div className="text-xs text-[#86868b]">{VERSION} · {SIZE} · 适用于 Windows 10 / 11</div>
              </>
            )}
          </div>
        </section>

        {/* 干净承诺 */}
        <section className="card mt-12 p-6 sm:p-7">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#28cd41]" />
            <h2 className="text-base font-bold sm:text-lg">纯净承诺 · 行为绝对透明</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CLEAN_PROMISES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-2.5 rounded-xl bg-black/[0.025] px-3.5 py-3">
                <Icon size={16} className="mt-0.5 shrink-0 text-[#0071e3]" />
                <span className="text-[13px] leading-relaxed text-[#3a3a3c]">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 安装说明：SmartScreen 放行 + SHA-256 校验 */}
        <section className="mt-12">
          <div className="mb-5 flex items-center gap-2">
            <Shield size={18} className="text-[#0071e3]" />
            <h2 className="text-base font-bold sm:text-lg">安装说明</h2>
          </div>

          {/* SmartScreen 提示说明 */}
          <div className="card mb-4 flex items-start gap-3 border-l-[3px] border-l-[#ff9500] p-5">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#ff9500]" />
            <div>
              <div className="text-[13.5px] font-semibold text-[#1d1d1f]">如果看到「Windows 已保护你的电脑」</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#6e6e73]">
                这是 Windows SmartScreen 对未签名新应用的<span className="font-medium text-[#1d1d1f]">常规提示</span>，并非检测到病毒。
                安装包无捆绑、无后台服务、可一键卸载，请放心安装。点击提示页的「更多信息」→「仍要运行」即可继续。
              </p>
            </div>
          </div>

          {/* 三步安装 */}
          <div className="grid gap-3 sm:grid-cols-3">
            {INSTALL_STEPS.map((s, i) => (
              <div key={s.title} className="card flex flex-col gap-2.5 p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0071e3]/10 text-[#0071e3]">
                    <s.icon size={15} />
                  </span>
                  <span className="text-[13px] font-semibold text-[#1d1d1f]">{i + 1}. {s.title}</span>
                </div>
                <p className="text-[12px] leading-relaxed text-[#6e6e73]">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* SHA-256 校验值 */}
          <div className="card mt-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock size={15} className="text-[#28cd41]" />
                <span className="text-[13px] font-semibold text-[#1d1d1f]">SHA-256 校验值</span>
                <span className="text-[11px] text-[#86868b]">· 下载后可比对，确认文件完整未被篡改</span>
              </div>
              <button
                onClick={copyHash}
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] px-3 py-1.5 text-[12px] font-medium text-[#1d1d1f] transition hover:border-[#0071e3]/30 hover:bg-[#0071e3]/[0.04]"
              >
                {copied ? <><CheckCheck size={13} className="text-[#28cd41]" /> 已复制</> : <><Copy size={13} /> 复制</>}
              </button>
            </div>
            <div className="mt-2.5 overflow-x-auto rounded-lg bg-black/[0.03] px-3 py-2.5">
              <code className="break-all font-mono text-[11.5px] text-[#3a3a3c] select-all">{SHA256}</code>
            </div>
          </div>
        </section>

        {/* 软件 / 网站对比 */}
        <section className="mt-12">
          <div className="mb-5 text-center">
            <h2 className="text-xl font-bold sm:text-2xl">桌面版 <span className="text-[#86868b]">vs</span> 网页版</h2>
            <p className="mt-1.5 text-sm text-[#6e6e73]">不是二选一——同一账号，两边数据完全互通</p>
          </div>

          {/* 对比表（桌面端表格 / 移动端卡片） */}
          <div className="card overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-[1.1fr_1.4fr_1.4fr] items-center gap-2 border-b border-black/[0.06] bg-black/[0.02] px-4 py-3.5 text-center text-[13px] font-semibold sm:grid-cols-[1fr_2fr_2fr] sm:px-6 sm:text-sm">
              <span className="text-left text-[#86868b]">对比项</span>
              <span className="inline-flex items-center justify-center gap-1.5 text-[#0071e3]"><MonitorSmartphone size={15} /> 桌面版</span>
              <span className="inline-flex items-center justify-center gap-1.5 text-[#1fa733]"><Globe size={15} /> 网页版</span>
            </div>
            {COMPARE_ROWS.map((r, i) => (
              <div
                key={r.label}
                className={`grid grid-cols-[1.1fr_1.4fr_1.4fr] items-center gap-2 px-4 py-3.5 text-center sm:grid-cols-[1fr_2fr_2fr] sm:px-6 ${
                  i % 2 === 0 ? 'bg-white/40' : ''
                }`}
              >
                <span className="text-left text-[13px] font-medium text-[#1d1d1f] sm:text-sm">{r.label}</span>
                <span className="flex items-center justify-center gap-1.5 text-xs text-[#3a3a3c] sm:text-[13px]">
                  <Mark level={r.deskLevel} />{r.desk}
                </span>
                <span className="flex items-center justify-center gap-1.5 text-xs text-[#3a3a3c] sm:text-[13px]">
                  <Mark level={r.webLevel} />{r.web}
                </span>
              </div>
            ))}
          </div>

          {/* 结论 */}
          <div className="mt-6 rounded-2xl border border-[#0071e3]/15 bg-gradient-to-r from-[#0071e3]/[0.06] to-[#28cd41]/[0.06] px-5 py-4 text-center">
            <p className="inline-flex flex-wrap items-center justify-center gap-1.5 text-sm leading-relaxed text-[#1d1d1f]">
              <Sparkles size={15} className="text-[#0071e3]" />
              推荐：教室电脑装桌面版上课更专注，手机网页版随时随地处理班级事务
            </p>
          </div>
        </section>
      </main>

      <BrandFooter fixed />
    </div>
  );
}
