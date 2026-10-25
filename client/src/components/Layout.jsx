import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, FolderOpen, ClipboardList, LineChart, Sparkles,
  Users, CalendarCheck, MessageSquare, ListTodo, Menu, LogOut, ShieldCheck, Zap,
  MonitorPlay, PenLine, BookText, MonitorDown, Minus, Square, X, Settings, Wallet,
  Bot, CalendarDays, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { auth, isMembershipActive, canUseFinance } from '../api.js';
import { isDesktopApp } from '../desktop.js';
import DesktopSettings from './DesktopSettings.jsx';
import LessonReminders from './LessonReminders.jsx';

export { isDesktopApp };

/* 桌面端自绘标题栏：无边框窗口，白色底，右侧最小化/最大化/关闭；
 * 整条为拖拽区（data-tauri-drag-region），仅桌面端渲染 */
export function DesktopTitlebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!isDesktopApp()) return null;
  const act = (method) => (e) => {
    e.stopPropagation();
    window.__TAURI__?.window?.getCurrentWindow?.()?.[method]?.();
  };
  return (
    <>
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-[70] flex h-9 select-none items-center justify-between border-b border-black/5 bg-white pl-3"
      >
        <div data-tauri-drag-region className="flex items-center gap-2">
          <img src="/rayzo-logo.png" alt="" className="h-5 w-5 rounded object-cover" />
          <span className="text-xs font-medium text-[#6e6e73]">教师工作台</span>
        </div>
        <div className="flex h-full items-center">
          <button aria-label="桌面设置" title="桌面设置" onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
            className="grid h-full w-11 place-items-center text-[#6e6e73] transition hover:bg-black/5">
            <Settings size={14} />
          </button>
          <button aria-label="最小化" title="最小化" onClick={act('minimize')} className="grid h-full w-11 place-items-center text-[#6e6e73] transition hover:bg-black/5">
            <Minus size={14} />
          </button>
          <button aria-label="最大化" title="最大化" onClick={act('toggleMaximize')} className="grid h-full w-11 place-items-center text-[#6e6e73] transition hover:bg-black/5">
            <Square size={12} />
          </button>
          <button aria-label="关闭" title="关闭" onClick={act('close')} className="grid h-full w-11 place-items-center text-[#6e6e73] transition hover:bg-[#ff3b30] hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>
      {settingsOpen && <DesktopSettings onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

const NAV = [
  { group: '教学功能' },
  { to: '/courses', label: '课程列表', icon: BookOpen },
  { to: '/materials', label: '备课资料', icon: FolderOpen },
  { to: '/assignments', label: '作业批改', icon: ClipboardList },
  { to: '/grades', label: '成绩分析', icon: LineChart },
  { to: '/teaching', label: '专项练习', icon: Sparkles },
  { group: '班务管理' },
  { to: '/students', label: '班级成员', icon: Users },
  { to: '/attendance', label: '考勤记录', icon: CalendarCheck },
  { to: '/timetable', label: '课程表', icon: CalendarDays },
  { to: '/finance', label: '课时费与工作量', icon: Wallet },
  { to: '/notifications', label: '消息通知', icon: MessageSquare },
  { to: '/todos', label: '班级待办', icon: ListTodo },
  { group: '班主任工具' },
  { to: '/classroom', label: '课堂小助手', icon: MonitorPlay },
  { to: '/comments', label: 'AI 期末评语', icon: PenLine },
  { to: '/ai-tools', label: 'AI 工具', icon: Bot },
  { to: '/journals', label: '班主任周记', icon: BookText },
];

const TITLES = {
  '/': '工作台总览', '/courses': '课程列表', '/materials': '备课资料管理',
  '/assignments': '作业布置与批改', '/grades': '成绩录入与分析',
  '/teaching': '教学专项练习',
  '/teaching/chinese': '语文专项练习',
  '/teaching/math': '数学专项练习',
  '/teaching/english': '英语专项练习',
  '/teaching/chinese/dictation': '生字默写练习',
  '/teaching/chinese/pinyin': '看拼音写汉字',
  '/teaching/chinese/fix': '病句修改专项',
  '/teaching/chinese/poem': '古诗默写专项',
  '/teaching/english/sentence': '句子填空练习',
  '/teaching/english/wordbank': '选词填空专项',
  '/teaching/english/reading': '阅读理解专项',
  '/teaching/english/dictation': '单词听写专项',
  '/teaching/exam': '综合测试',
  '/teaching/classroom-practice': '课堂练习',
  '/students': '班级成员管理', '/attendance': '考勤记录管理',
  '/finance': '课时费与工作量',
  '/classes': '班级管理', '/classes/new': '新建班级',
  '/notifications': '消息通知', '/todos': '班级事务待办',
  '/classroom': '课堂小助手', '/comments': 'AI 期末评语',
  '/ai-tools': 'AI 工具', '/journals': '班主任周记',
  '/timetable': '课程表',
  '/admin': '管理后台',
};

/* 移动端底部标签栏：高频入口 + 「更多」唤起完整抽屉导航 */
const TABS = [
  { to: '/', label: '工作台', icon: LayoutDashboard, exact: true },
  { to: '/courses', label: '课程', icon: BookOpen },
  { to: '/teaching', label: '练习', icon: Sparkles },
  { to: '/students', label: '班级', icon: Users },
];

export default function Layout() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const teacher = auth.teacher;

  /* 投屏窗口（?monitor=1）：隐藏侧栏与导航，整窗只留课堂小助手大屏 */
  if (new URLSearchParams(search).get('monitor') === '1') {
    return (
      <main className="min-h-screen bg-[#111] p-3 sm:p-5">
        <Outlet />
      </main>
    );
  }

  const logout = () => {
    auth.clear();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* 品牌区：官网 LOGO + 产品名 + slogan */}
      <NavLink to="/" className="flex items-center gap-3 px-6 pb-7 pt-7" onClick={() => setOpen(false)}>
        <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo h-11 w-11 rounded-full" />
        <div className="min-w-0">
          <div className="display truncate text-[16px] font-semibold tracking-tight text-ink">教师工作台</div>
          <div className="truncate text-[11px] tracking-wide text-ink-secondary">连接创意与未来教育</div>
        </div>
      </NavLink>

      {/* 导航 */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        <NavLink
          to="/" end onClick={() => setOpen(false)}
          className={({ isActive }) => linkCls(isActive)}
        >
          <LayoutDashboard size={18} className="shrink-0" /> 工作台总览
        </NavLink>
        {NAV.map((item, i) => {
          if (item.group) {
            return (
              <div key={i} className="px-3 pb-1.5 pt-6 eyebrow">
                {item.group}
              </div>
            );
          }
          /* 课时费与工作量默认不开放，由管理员在后台按教师分配 */
          if (item.to === '/finance' && !canUseFinance(teacher)) return null;
          return (
            <NavLink
              key={item.to} to={item.to} onClick={() => setOpen(false)}
              className={({ isActive }) => linkCls(isActive)}
            >
              <item.icon size={18} className="shrink-0" /> {item.label}
            </NavLink>
          );
        })}
        {teacher?.is_admin && (
          <>
            <div className="px-3 pb-1.5 pt-6 eyebrow">系统</div>
            <NavLink to="/admin" onClick={() => setOpen(false)} className={({ isActive }) => linkCls(isActive)}>
              <ShieldCheck size={18} className="shrink-0" /> 管理后台
            </NavLink>
          </>
        )}
      </nav>

      <div className="mx-4 mb-4 rounded-2xl border border-black/[0.05] bg-white/60 px-4 py-3.5 text-[11px] leading-relaxed text-ink-secondary">
        <span className="brand-gradient-text font-semibold">教学 · 班务一体化</span>
        <br />面向一线教师的日常工作平台
      </div>

      {/* 桌面版推荐入口：跳转下载页看优势对比；桌面端内自动隐藏 */}
      {!isDesktopApp() && (
        <Link
          to="/download"
          className="group relative mx-4 mb-6 block overflow-hidden rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#0a84ff] px-4 py-3.5 text-white shadow-[0_12px_28px_-14px_rgba(0,113,227,0.65)] transition hover:brightness-105"
        >
          <span className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-white/15 blur-md transition group-hover:scale-125" />
          <span className="relative flex items-center justify-center gap-2 text-sm font-semibold tracking-wide">
            <MonitorDown size={16} /> 推荐下载桌面版
          </span>
          <span className="relative mt-1 block whitespace-nowrap text-center text-[11px] font-medium text-white/90">
            双击即开 · 软件 vs 网站对比
          </span>
        </Link>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* 桌面侧边栏：玻璃质感，透出氛围背景 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-black/[0.055] bg-white/72 backdrop-blur-2xl lg:block">
        {sidebar}
      </aside>

      {/* 移动端抽屉 */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#12141a]/35 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[272px] bg-white shadow-2xl">{sidebar}</aside>
        </div>
      )}

      {/* 主区域 */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-[248px]">
        <header className={`glass sticky ${isDesktopApp() ? 'top-9' : 'top-0'} z-20 flex h-16 items-center gap-3 px-4 sm:px-8`}>
          {/* 窄屏显示品牌，宽屏显示面包屑 + 页面标题 */}
          <Link to="/" className="flex items-center gap-2.5 lg:hidden" title="教师工作台 · 连接创意与未来教育">
            <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo h-9 w-9 rounded-full" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="display text-[15px] font-semibold tracking-tight text-ink">教师工作台</span>
              <span className="text-[11px] tracking-wide text-ink-secondary">连接创意与未来教育</span>
            </span>
          </Link>

          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <span className="shrink-0 text-xs font-medium text-ink-secondary">工作台</span>
            <ChevronRight size={13} className="shrink-0 text-ink-secondary/40" />
            <h1 className="display truncate text-[17px] font-semibold text-ink">
              {TITLES[pathname] || (pathname.startsWith('/classes/') ? '班级管理' : '教师工作台')}
            </h1>
          </div>
          <h1 className="display truncate text-[16px] font-semibold text-ink lg:hidden">
            {TITLES[pathname] || (pathname.startsWith('/classes/') ? '班级管理' : '教师工作台')}
          </h1>

          <div className="ml-auto flex items-center gap-3">
            {teacher && !teacher.is_admin && (
              <span
                title={teacher.membership_expires_at ? `会员有效期至 ${teacher.membership_expires_at}` : '永久会员'}
                className={`hidden items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium ring-1 ring-inset sm:inline-flex ${
                  isMembershipActive(teacher)
                    ? 'bg-[#28cd41]/10 text-[#1a7f2b] ring-[#28cd41]/20'
                    : 'bg-[#ff3b30]/10 text-[#b3251c] ring-[#ff3b30]/20'
                }`}
              >
                {teacher.membership_expires_at
                  ? `${isMembershipActive(teacher) ? '有效期至' : '已于'} ${teacher.membership_expires_at}`
                  : '永久会员'}
              </span>
            )}
            <Link to="/renew" onClick={() => setOpen(false)}
              title="算力余额：点击前往续费"
              className="hidden items-center gap-1 rounded-full bg-[#ff9500]/10 px-3 py-1 text-[11px] font-medium text-[#a85300] ring-1 ring-inset ring-[#ff9500]/20 transition hover:bg-[#ff9500]/15 sm:inline-flex">
              <Zap size={12} />{teacher?.credits ?? 0} 算力
            </Link>
            <span className="hidden rounded-full bg-black/[0.035] px-3 py-1 text-[11px] text-ink-secondary ring-1 ring-inset ring-black/[0.05] xl:inline-block">2026 春季学期</span>
            <span className="hidden text-[13px] font-medium text-ink sm:block">{teacher?.name || '教师'}</span>
            <div className="brand-gradient grid h-9 w-9 place-items-center rounded-full p-[2px] shadow-[0_4px_12px_-6px_rgba(0,113,227,0.6)]">
              <span className="grid h-full w-full place-items-center rounded-full bg-white/95 text-[13px] font-semibold text-ink">
                {(teacher?.name || '师')[0]}
              </span>
            </div>
            <button
              onClick={logout}
              title="退出登录"
              className="btn-pill -mr-1 p-2 text-ink-secondary transition hover:bg-[#ff3b30]/10 hover:text-[#d70015]"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div key={pathname} className="page-enter mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>

        <footer className="flex flex-col items-center gap-0.5 px-4 pb-24 text-center sm:px-8 lg:pb-6">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-secondary/60">
            <span className="brand-gradient-text font-medium">连接创意与未来教育</span>
            <span className="text-ink-secondary/30">·</span>
            <span>© 2026 Rayzo 集团旗下产品</span>
            <span className="text-ink-secondary/30">·</span>
            <a
              href="https://rayzo.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink-secondary transition hover:text-[#0071e3] hover:underline underline-offset-2"
            >
              由 Rayzo.cn 提供服务
            </a>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-ink-secondary/50">
            <ShieldCheck size={11} className="text-[#28cd41]/70" />
            该网站已由集团创新部门 2026 年审查通过
          </div>
        </footer>
      </div>

      {/* 上课提醒：教师课表中「我的课」开课前 10 / 5 分钟弹出 */}
      <LessonReminders />

      {/* 移动端底部悬浮 Dock（lg 以上由侧边栏接管） */}
      <nav
        className="fixed inset-x-3 bottom-3 z-30 flex items-center rounded-full border border-black/[0.07] bg-white/85 p-1.5 shadow-[0_12px_36px_-12px_rgba(16,24,40,0.35)] backdrop-blur-2xl lg:hidden"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map(t => (
          <NavLink
            key={t.to} to={t.to} end={t.exact}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold transition-all ${
              isActive ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'text-ink-secondary'
            }`}
          >
            <t.icon size={20} />
            {t.label}
          </NavLink>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-semibold text-ink-secondary transition"
        >
          <Menu size={20} />
          更多
        </button>
      </nav>
    </div>
  );
}

function linkCls(isActive) {
  return `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all ${
    isActive
      ? 'nav-active bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05),0_10px_24px_-18px_rgba(16,24,40,0.45)] ring-1 ring-inset ring-black/[0.05]'
      : 'text-ink-secondary hover:bg-black/[0.035] hover:text-ink'
  }`;
}
