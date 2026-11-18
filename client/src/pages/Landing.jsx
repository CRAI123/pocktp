import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BookOpenCheck, BrainCircuit, CalendarDays, Check,
  ClipboardCheck, Download, LineChart, LogIn, Menu, MonitorPlay, PenLine,
  MessageSquareText, Sparkles, UsersRound, X,
} from 'lucide-react';
import { auth } from '../api.js';

const NAV = [
  { label: '教学', href: '#teach' },
  { label: '分析', href: '#analyze' },
  { label: '课堂', href: '#classroom' },
  { label: '桌面版', to: '/download' },
];

/* 首页展示用的课表示例：与工作台真实结构一致 */
const LESSONS = [
  { time: '08:30', end: '09:10', subject: '语文', className: '三年级 2 班', state: 'done' },
  { time: '10:00', end: '10:40', subject: '数学', className: '三年级 2 班', state: 'now', tip: '进行中 · 剩 22 分钟' },
  { time: '14:20', end: '15:00', subject: '英语', className: '三年级 1 班', state: 'next' },
  { time: '15:20', end: '16:00', subject: '班会', className: '三年级 2 班', state: 'next' },
];

const FLOW = [
  { no: '01', title: '备课', desc: '资料、课件与练习题集中存放，随取随用。' },
  { no: '02', title: '上课', desc: '课程表自动提醒，课堂游戏一屏投出。' },
  { no: '03', title: '批改', desc: '作业与试卷录入后，AI 辅助批改并留痕。' },
  { no: '04', title: '分析', desc: '多次考试横向对比，定位薄弱知识点。' },
  { no: '05', title: '沟通', desc: '评语、通知与周记，班务材料一次成稿。' },
];

const BLOCKS = [
  {
    no: '01',
    icon: BookOpenCheck,
    title: '备课与出题',
    desc: '把零散的资料、题目和课件收拢到一处，按学科与年级快速取用。',
    rows: ['语文、数学、英语全学科专项练习', 'AI 按年级、难度与考点批量出题', '备课资料与好题本统一归档'],
    offset: 'lg:mt-0',
  },
  {
    no: '02',
    icon: LineChart,
    title: '成绩与诊断',
    desc: '分数只是入口。真正要回答的是：这个学生这一段到底哪里卡住了。',
    rows: ['多次考试趋势与班级横向对比', 'AI 生成薄弱点与分阶段提升计划', '一名学生一份可打印的分析报告'],
    offset: 'lg:mt-16',
  },
  {
    no: '03',
    icon: MonitorPlay,
    title: '课堂与班务',
    desc: '为了让课堂更专注而设计的小工具，不喧宾夺主。',
    rows: ['转盘、抢答、翻牌等课堂互动', '考勤、待办、值日与家校沟通', '课程调整与上课倒计时提醒'],
    offset: 'lg:mt-6',
  },
];

/* 主视觉：今日课表竖排时间轴 */
function DayBoard() {
  return (
    <div className="relative">
      {/* 卡片背后错层的纸片，制造档案夹质感 */}
      <div className="absolute inset-x-4 -bottom-2 top-4 -z-10 rounded-3xl border border-black/[0.05] bg-white/55" />
      <div className="absolute inset-x-2 -bottom-1 top-2 -z-10 rounded-3xl border border-black/[0.05] bg-white/80" />

      <div className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-[0_30px_70px_-40px_rgba(16,17,20,0.45)]">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#101114] text-white"><CalendarDays size={15} /></span>
            <div>
              <div className="text-[13px] font-semibold tracking-tight text-ink">今日课表</div>
              <div className="mt-0.5 text-[10px] text-ink-secondary">11 月 18 日 · 周二</div>
            </div>
          </div>
          <div className="rounded-full border border-black/[0.08] px-2.5 py-1 text-[10px] font-medium text-ink-secondary">
            4 节
          </div>
        </div>

        <div className="px-5 py-4">
          {LESSONS.map((l, i) => {
            const now = l.state === 'now';
            const done = l.state === 'done';
            return (
              <div key={l.time} className={`relative flex gap-4 rounded-2xl px-3 py-3 ${now ? 'bg-[#0071e3]/[0.055]' : ''}`}>
                {/* 时间刻度 */}
                <div className="w-11 shrink-0 pt-0.5 text-right">
                  <div className={`num text-[12px] font-semibold ${now ? 'text-[#0071e3]' : done ? 'text-ink-secondary/70' : 'text-ink'}`}>{l.time}</div>
                  <div className="num mt-0.5 text-[9px] text-ink-secondary/60">{l.end}</div>
                </div>

                {/* 轨道与节点 */}
                <div className="relative flex w-3 shrink-0 justify-center">
                  {i < LESSONS.length - 1 && <span className="absolute top-3 h-full w-px bg-black/[0.09]" />}
                  <span className={`relative mt-1 h-2.5 w-2.5 rounded-full ${now ? 'bg-[#0071e3]' : done ? 'bg-black/[0.16]' : 'border border-black/[0.2] bg-white'}`}>
                    {now && <span className="absolute -inset-1.5 animate-ping rounded-full bg-[#0071e3]/25" />}
                  </span>
                </div>

                {/* 课程内容 */}
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold tracking-tight ${done ? 'text-ink-secondary' : 'text-ink'}`}>{l.subject}</span>
                    <span className="truncate text-[10px] text-ink-secondary">{l.className}</span>
                    {done && <Check size={11} className="ml-auto shrink-0 text-[#16853b]" />}
                  </div>
                  {now ? (
                    <div className="mt-1.5">
                      <div className="text-[10px] font-medium text-[#0071e3]">{l.tip}</div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#0071e3]/15">
                        <div className="h-full w-[45%] rounded-full bg-[#0071e3]" />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-[10px] text-ink-secondary/80">{done ? '已完成' : '待开始'}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-[#fafafb] px-5 py-3.5">
          <div className="flex items-center gap-2 text-[10.5px] text-ink-secondary">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#28cd41]/60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#28cd41]" /></span>
            班务提醒已同步
          </div>
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#0071e3]">进入课堂 <ArrowUpRight size={11} /></span>
        </div>
      </div>
    </div>
  );
}

/* 细分隔线 */
function Rule() {
  return <div className="h-px w-full bg-black/[0.07]" />;
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const entry = auth.token ? '/dashboard' : '/login';

  return (
    <div id="top" className="min-h-screen bg-[#fbfbfc] text-ink">
      {/* 导航：白底细线，不用毛玻璃胶囊 */}
      <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-[#fbfbfc]/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-6 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="教师工作台首页">
            <img src="/rayzo-logo.png" alt="教师工作台 LOGO" className="h-9 w-9 rounded-full outline outline-1 outline-black/[0.06]" />
            <span className="display text-[15px] font-semibold tracking-tight">教师工作台</span>
            <span className="ml-1 hidden rounded-full border border-black/[0.08] px-2 py-0.5 text-[9px] tracking-wider text-ink-secondary sm:inline">RAYZO TEACH</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="首页导航">
            {NAV.map(item => (
              item.to ? (
                <Link key={item.label} to={item.to} className="text-[12.5px] font-medium text-ink-secondary transition hover:text-ink">{item.label}</Link>
              ) : (
                <a key={item.label} href={item.href} className="text-[12.5px] font-medium text-ink-secondary transition hover:text-ink">{item.label}</a>
              )
            ))}
            <span className="h-4 w-px bg-black/[0.09]" />
            <Link to={entry} className="group inline-flex items-center gap-1.5 rounded-full bg-[#101114] px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#26272b]">
              {auth.token ? '工作台' : '登录'} <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5" />
            </Link>
          </nav>

          <button type="button" onClick={() => setMenuOpen(v => !v)} className="grid h-9 w-9 place-items-center rounded-full border border-black/[0.09] text-ink md:hidden" aria-label={menuOpen ? '关闭导航' : '打开导航'}>
            {menuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-black/[0.07] bg-[#fbfbfc] px-5 py-3 md:hidden" aria-label="移动端导航">
            {NAV.map(item => (
              item.to ? (
                <Link key={item.label} to={item.to} onClick={() => setMenuOpen(false)} className="block py-2.5 text-[13px] font-medium text-ink-secondary">{item.label}</Link>
              ) : (
                <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="block py-2.5 text-[13px] font-medium text-ink-secondary">{item.label}</a>
              )
            ))}
            <Link to={entry} className="mt-2 flex items-center justify-center gap-2 rounded-full bg-[#101114] py-2.5 text-[13px] font-semibold text-white">
              {auth.token ? '进入工作台' : '登录 / 注册'}
            </Link>
          </nav>
        )}
      </header>

      {/* Hero：非对称双栏，左文字右时间轴 */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          aria-hidden="true"
          style={{
            backgroundImage: 'linear-gradient(rgba(16,17,20,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(16,17,20,0.045) 1px, transparent 1px)',
            backgroundSize: '76px 76px',
            maskImage: 'radial-gradient(900px 520px at 22% 12%, #000 20%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(900px 520px at 22% 12%, #000 20%, transparent 72%)',
          }}
        />
        <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.06fr_0.94fr] lg:gap-14">
            {/* 左：编辑式标题 */}
            <div className="page-enter">
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[#101114]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-secondary">Teachers, not paperwork</span>
              </div>

              <h1 className="display mt-6 text-[38px] font-light leading-[1.16] tracking-[-0.045em] text-[#101114] sm:text-[52px] lg:text-[58px]">
                把一整天的教学
                <br />
                <span className="font-extrabold">收进一个屏幕</span>
              </h1>

              <p className="mt-6 max-w-[30rem] text-[13.5px] leading-7 text-ink-secondary sm:text-[14.5px]">
                备课、上课、批改、分析、沟通，原本分散在五个地方的事情，
                现在有一条完整的工作线。技术退到后面，讲台留在前面。
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to={entry} className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#0071e3] px-6 py-3 text-[13.5px] font-semibold text-white transition hover:bg-[#0077ed]">
                  {auth.token ? '进入教师工作台' : '开始使用'}
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <a href="#teach" className="group inline-flex items-center justify-center gap-2 rounded-full border border-black/[0.14] px-6 py-3 text-[13.5px] font-semibold text-ink transition hover:border-black/30">
                  看看具体能做什么
                  <ArrowRight size={15} className="text-ink-secondary transition-transform group-hover:translate-x-1" />
                </a>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] text-ink-secondary">
                <span className="flex items-center gap-1.5"><Check size={12} className="text-[#16853b]" />网页端免安装</span>
                <span className="flex items-center gap-1.5"><Check size={12} className="text-[#16853b]" />桌面端更专注</span>
                <span className="flex items-center gap-1.5"><Check size={12} className="text-[#16853b]" />数据按教师独立管理</span>
              </div>
            </div>

            {/* 右：课表卡 */}
            <div className="page-enter lg:pl-2" style={{ animationDelay: '0.1s' }}>
              <DayBoard />
            </div>
          </div>
        </div>

        {/* 数据条：横贯的细线表格，而不是卡片 */}
        <div className="border-y border-black/[0.07] bg-white/70">
          <div className="mx-auto grid max-w-[1180px] grid-cols-2 divide-x divide-black/[0.07] px-5 sm:grid-cols-4 sm:px-8">
            {[
              ['1', '个入口', '替代一天里切换的多个工具'],
              ['5', '个环节', '备课到沟通的同一条工作线'],
              ['3', '类报告', '班级、学生与阶段总结'],
              ['0', '次重复', '同一份名单只录入一次'],
            ].map(([n, label, desc], i) => (
              <div key={label} className={`px-4 py-6 sm:px-6 ${i > 1 ? 'border-t border-black/[0.07] sm:border-t-0' : ''} ${i % 2 === 1 ? 'border-l-0 sm:border-l' : ''}`}>
                <div className="flex items-baseline gap-1.5">
                  <span className="num display text-[30px] font-bold leading-none tracking-[-0.05em] text-[#101114]">{n}</span>
                  <span className="text-[11px] font-medium text-ink-secondary">{label}</span>
                </div>
                <div className="mt-2 text-[10.5px] leading-5 text-ink-secondary/80">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 深色区：一天的工作流 */}
      <section className="bg-[#0f1114] px-5 py-16 text-white sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-white/40" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">The teaching day</span>
              </div>
              <h2 className="display mt-5 max-w-2xl text-[26px] font-semibold leading-[1.28] tracking-[-0.04em] sm:text-[36px]">
                从清晨第一节课，<br className="hidden sm:block" />到晚上最后一条通知
              </h2>
            </div>
            <p className="max-w-xs text-[12px] leading-6 text-white/50">
              五个环节共用同一份班级数据，录入一次，处处可用。
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/[0.09] sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map(item => (
              <div key={item.no} className="group bg-[#0f1114] p-6 transition hover:bg-white/[0.035]">
                <div className="flex items-center justify-between">
                  <span className="num text-[11px] font-semibold tracking-[0.12em] text-white/35">{item.no}</span>
                  <span className="h-px w-8 bg-white/15 transition group-hover:bg-[#0071e3]" />
                </div>
                <div className="mt-8 text-[15px] font-semibold tracking-tight">{item.title}</div>
                <p className="mt-2.5 text-[11.5px] leading-6 text-white/45">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* 迷你趋势图：呼应 AI 分析 */}
          <div className="mt-10 grid gap-8 rounded-2xl border border-white/[0.09] p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5ac8fa]">
                <BrainCircuit size={13} /> AI 学情诊断
              </div>
              <h3 className="mt-4 text-[20px] font-semibold leading-snug tracking-tight sm:text-[24px]">
                分数之外，<br />还有一条被看见的曲线
              </h3>
              <p className="mt-3 max-w-sm text-[11.5px] leading-6 text-white/45">
                把三次考试连成一条线，波动、停滞与回升都会说话。AI 负责提示可能的原因，你负责做出判断。
              </p>
            </div>

            <div className="relative">
              <svg viewBox="0 0 420 150" className="h-auto w-full" role="img" aria-label="三次考试的成绩趋势示意图">
                <defs>
                  <linearGradient id="landingTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0071e3" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#0071e3" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[30, 70, 110].map(y => (
                  <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                ))}
                <path d="M10 96 L120 82 L230 96 L340 52 L410 40 L410 150 L10 150 Z" fill="url(#landingTrend)" />
                <path d="M10 96 L120 82 L230 96 L340 52 L410 40" fill="none" stroke="#4aa8ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {[[10, 96], [120, 82], [230, 96], [340, 52], [410, 40]].map(([x, y]) => (
                  <circle key={x} cx={x} cy={y} r="3.5" fill="#0f1114" stroke="#4aa8ff" strokeWidth="2" />
                ))}
                <text x="10" y="140" fill="rgba(255,255,255,0.35)" fontSize="9">月考一</text>
                <text x="118" y="140" fill="rgba(255,255,255,0.35)" fontSize="9">期中</text>
                <text x="228" y="140" fill="rgba(255,255,255,0.35)" fontSize="9">月考二</text>
                <text x="336" y="140" fill="rgba(255,255,255,0.35)" fontSize="9">期末</text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* 能力区：错位排列 + 编号 */}
      <section id="teach" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-[#101114]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-secondary">What's inside</span>
            </div>
            <h2 className="display mt-5 text-[28px] font-semibold leading-[1.24] tracking-[-0.04em] sm:text-[38px]">
              三块内容，<br className="sm:hidden" />围绕同一位老师
            </h2>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-3 lg:items-start lg:gap-6">
            {BLOCKS.map(block => (
              <article key={block.no} className={`group ${block.offset}`}>
                <div className="flex items-baseline justify-between border-t-2 border-[#101114] pt-4">
                  <span className="num text-[11px] font-semibold tracking-[0.14em] text-ink-secondary">{block.no}</span>
                  <block.icon size={17} className="text-[#101114] transition group-hover:text-[#0071e3]" />
                </div>
                <h3 className="display mt-5 text-[21px] font-semibold tracking-tight">{block.title}</h3>
                <p className="mt-3 min-h-[42px] text-[12.5px] leading-6 text-ink-secondary">{block.desc}</p>
                <div className="mt-5 space-y-3">
                  {block.rows.map(row => (
                    <div key={row}>
                      <div className="flex items-start gap-2.5 py-1.5">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#0071e3]" />
                        <span className="text-[12px] leading-6 text-ink">{row}</span>
                      </div>
                      <Rule />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 课堂互动：横向条带 */}
      <section id="classroom" className="scroll-mt-20 border-y border-black/[0.07] bg-white/70 px-5 py-14 sm:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-lg">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#0071e3]"><Sparkles size={13} /> 课堂小助手</div>
            <h2 className="display mt-3 text-[22px] font-semibold leading-snug tracking-tight sm:text-[27px]">
              一屏投出去，全班都能参与
            </h2>
            <p className="mt-2.5 text-[12px] leading-6 text-ink-secondary">
              幸运转盘、记忆翻牌、抢答对战、随机抽卡，支持按学科筛选，投屏后不用再切窗口。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              [MonitorPlay, '幸运转盘'],
              [ClipboardCheck, '抢答对战'],
              [UsersRound, '随机抽卡'],
              [PenLine, '单词闪卡'],
            ].map(([Icon, label]) => (
              <div key={label} className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5">
                <Icon size={14} className="shrink-0 text-[#0071e3]" />
                <span className="text-[11.5px] font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI 能力：编辑式双栏，无渐变大卡 */}
      <section id="analyze" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[#101114]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-secondary">With a little help</span>
              </div>
              <h2 className="display mt-5 text-[28px] font-semibold leading-[1.24] tracking-[-0.04em] sm:text-[38px]">
                不是替你教学，<br />而是帮你少做重复
              </h2>
              <p className="mt-4 max-w-md text-[12.5px] leading-7 text-ink-secondary">
                AI 参与出题、批改、成绩诊断和班主任文案。每一条建议都可以修改、可以拒绝——最终判断始终在老师手里。
              </p>
              <Link to={entry} className="group mt-7 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0071e3]">
                体验 AI 教学助手
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 sm:p-7">
              <div className="flex items-center justify-between border-b border-black/[0.07] pb-4">
                <div className="flex items-center gap-2 text-[12px] font-semibold"><Sparkles size={14} className="text-[#0071e3]" /> 学情分析 · 示例</div>
                <span className="rounded-full bg-[#28cd41]/10 px-2.5 py-1 text-[9.5px] font-medium text-[#16853b]">已生成</span>
              </div>
              <div className="mt-5 space-y-5">
                {[
                  [LineChart, '趋势判断', '近三次总分稳步上升，数学提升最明显，英语仍在班级均值附近波动。'],
                  [BrainCircuit, '薄弱定位', '失分集中在分数应用题与阅读推理，建议优先补这两类题型。'],
                  [MessageSquareText, '下一步建议', '两周内完成 3 组变式练习，并在下次月考后复核一次。'],
                ].map(([Icon, title, desc]) => (
                  <div key={title} className="flex gap-3.5">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0071e3]/[0.07] text-[#0071e3]"><Icon size={15} /></span>
                    <div>
                      <div className="text-[12px] font-semibold">{title}</div>
                      <p className="mt-1 text-[11.5px] leading-6 text-ink-secondary">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-black/[0.07] pt-4 text-[10.5px] text-ink-secondary">
                <span>内容由 AI 生成，请结合实际情况判断</span>
                <span className="num">1 / 42</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 结尾：极简细线，不做大渐变卡 */}
      <section id="about" className="scroll-mt-20 border-t border-black/[0.07] px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="display max-w-xl text-[30px] font-semibold leading-[1.22] tracking-[-0.045em] sm:text-[42px]">
                把更多时间<br />留给课堂与学生
              </h2>
              <p className="mt-4 max-w-md text-[12.5px] leading-7 text-ink-secondary">
                教师工作台不追求功能最多，只想把每天真正要做的事，做得更顺一点。
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
              <Link to={entry} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#101114] px-6 py-3 text-[13px] font-semibold text-white transition hover:bg-[#26272b]">
                <LogIn size={14} /> {auth.token ? '回到我的工作台' : '登录 / 注册'}
              </Link>
              <Link to="/download" className="inline-flex items-center justify-center gap-2 rounded-full border border-black/[0.14] px-6 py-3 text-[13px] font-semibold text-ink transition hover:border-black/30">
                <Download size={14} /> 下载桌面版
              </Link>
            </div>
          </div>

          <div className="mt-14 flex flex-col gap-3 border-t border-black/[0.07] pt-6 text-[10.5px] text-ink-secondary sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <img src="/rayzo-logo.png" alt="" className="h-6 w-6 rounded-full" />
              <span className="font-semibold text-ink">教师工作台</span>
              <span>· 连接创意与未来教育</span>
            </div>
            <div className="flex items-center gap-5">
              <Link to="/download" className="transition hover:text-ink">桌面版</Link>
              <Link to="/redeem" className="transition hover:text-ink">激活码兑换</Link>
              <span>© 2026 Rayzo Teach</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
