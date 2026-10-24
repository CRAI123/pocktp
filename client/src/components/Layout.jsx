import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, FolderOpen, ClipboardList, LineChart, Sparkles,
  Users, CalendarCheck, MessageSquare, ListTodo, Menu, X, LogOut, ShieldCheck, Zap,
  MonitorPlay, PenLine, Wand2, BookText,
} from 'lucide-react';
import { useState } from 'react';
import { auth, isMembershipActive } from '../api.js';

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
  { to: '/notifications', label: '消息通知', icon: MessageSquare },
  { to: '/todos', label: '班级待办', icon: ListTodo },
  { group: '班主任工具' },
  { to: '/classroom', label: '课堂小助手', icon: MonitorPlay },
  { to: '/comments', label: 'AI 期末评语', icon: PenLine },
  { to: '/ai-writer', label: 'AI 文案助手', icon: Wand2 },
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
  '/classes': '班级管理', '/classes/new': '新建班级',
  '/notifications': '微信消息通知', '/todos': '班级事务待办',
  '/classroom': '课堂小助手', '/comments': 'AI 期末评语',
  '/ai-writer': 'AI 文案助手', '/journals': '班主任周记',
  '/admin': '管理后台',
};

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const teacher = auth.teacher;

  const logout = () => {
    auth.clear();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* 品牌区：官网 LOGO + 产品名 + slogan */}
      <NavLink to="/" className="flex items-center gap-3 px-6 pt-7 pb-6" onClick={() => setOpen(false)}>
        <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo h-12 w-12 rounded-full" />
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-ink">教师工作台</div>
          <div className="text-xs text-ink-secondary">连接创意与未来教育</div>
        </div>
      </NavLink>

      {/* 导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
        <NavLink
          to="/" end onClick={() => setOpen(false)}
          className={({ isActive }) => linkCls(isActive)}
        >
          <LayoutDashboard size={18} /> 工作台总览
        </NavLink>
        {NAV.map((item, i) =>
          item.group ? (
            <div key={i} className="px-3 pt-5 pb-1 text-xs font-semibold tracking-widest text-ink-secondary/70">
              {item.group}
            </div>
          ) : (
            <NavLink
              key={item.to} to={item.to} onClick={() => setOpen(false)}
              className={({ isActive }) => linkCls(isActive)}
            >
              <item.icon size={18} /> {item.label}
            </NavLink>
          )
        )}
        {teacher?.is_admin && (
          <>
            <div className="px-3 pt-5 pb-1 text-xs font-semibold tracking-widest text-ink-secondary/70">系统</div>
            <NavLink to="/admin" onClick={() => setOpen(false)} className={({ isActive }) => linkCls(isActive)}>
              <ShieldCheck size={18} /> 管理后台
            </NavLink>
          </>
        )}
      </nav>

      <div className="mx-4 mb-6 rounded-2xl bg-bg-light p-4 text-xs leading-relaxed text-ink-secondary">
        <span className="brand-gradient-text font-semibold">教学·班务一体化</span>
        <br />面向一线教师的日常工作平台
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* 桌面侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-black/5 bg-white lg:block">
        {sidebar}
      </aside>

      {/* 移动端抽屉 */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-2xl">{sidebar}</aside>
        </div>
      )}

      {/* 主区域 */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-60">
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 px-4 sm:px-8">
          <button className="btn-pill p-2 hover:bg-black/5 lg:hidden" onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* 官网 LOGO + 品牌名 + slogan（窄屏仅显示 LOGO） */}
          <Link to="/" className="flex items-center gap-2.5" title="教师工作台 · 连接创意与未来教育">
            <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="brand-logo h-10 w-10 rounded-full" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-[15px] font-semibold tracking-tight text-ink">教师工作台</span>
              <span className="text-[11px] tracking-wide text-ink-secondary">连接创意与未来教育</span>
            </span>
          </Link>

          {/* 品牌区与页面标题的分隔线 */}
          <div className="mx-1 hidden h-6 w-px bg-black/10 md:block" />

          <h1 className="truncate text-lg font-semibold tracking-tight">
            {TITLES[pathname] || (pathname.startsWith('/classes/') ? '班级管理' : '教师工作台')}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            {teacher && !teacher.is_admin && (
              <span
                title={teacher.membership_expires_at ? `会员有效期至 ${teacher.membership_expires_at}` : '永久会员'}
                className={`hidden items-center gap-1 rounded-full px-3 py-1 text-xs font-medium sm:inline-flex ${
                  isMembershipActive(teacher)
                    ? 'bg-[#28cd41]/10 text-[#1f9e33]'
                    : 'bg-[#ff3b30]/10 text-[#ff3b30]'
                }`}
              >
                {teacher.membership_expires_at
                  ? `${isMembershipActive(teacher) ? '有效期至' : '已于'} ${teacher.membership_expires_at}`
                  : '永久会员'}
              </span>
            )}
            <Link to="/renew" onClick={() => setOpen(false)}
              title="算力余额：点击前往续费"
              className="hidden items-center gap-1 rounded-full bg-[#ff9500]/10 px-3 py-1 text-xs font-medium text-[#ff9500] transition hover:bg-[#ff9500]/20 hover:text-[#ff7b00] sm:inline-flex">
              <Zap size={12} />{teacher?.credits ?? 0} 算力
            </Link>
            <span className="hidden rounded-full bg-black/[0.04] px-3 py-1 text-xs text-ink-secondary sm:block">2026 春季学期</span>
            <span className="hidden text-sm font-medium sm:block">{teacher?.name || '教师'}</span>
            <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white">
              {(teacher?.name || '师')[0]}
            </div>
            <button
              onClick={logout}
              title="退出登录"
              className="btn-pill p-2 text-ink-secondary transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </main>

        <footer className="flex flex-col items-center gap-0.5 px-4 pb-6 text-center sm:px-8">
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
    </div>
  );
}

function linkCls(isActive) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
    isActive
      ? 'brand-gradient text-white shadow-md shadow-blue-500/25'
      : 'text-ink-secondary hover:bg-black/[0.04] hover:text-ink'
  }`;
}
