import { useEffect, useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { Users, ClipboardList, ListTodo, CalendarCheck, Sparkles, GraduationCap, ArrowRight, Zap, RefreshCw, MonitorPlay, PenLine, Wand2, BookText } from 'lucide-react';
import { api, auth } from '../api.js';
import { StatCard, Badge } from '../components/ui.jsx';

/* 单个班级卡片（memo 避免无关重渲） */
const ClassCard = memo(function ClassCard({ cls }) {
  const rate = cls.student_count > 0 ? Math.round((cls.today_present / cls.student_count) * 100) : 0;
  return (
    <Link to={`/classes/${cls.id}`}
      className="card group flex flex-col gap-3 p-5 transition hover:border-[#0071e3]/40 hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.98]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0071e3] to-[#5856d6] text-white">
            <GraduationCap size={18} />
          </div>
          <div>
            <div className="font-semibold tracking-tight">{cls.name}</div>
            <div className="text-xs text-ink-secondary">{cls.grade}</div>
          </div>
        </div>
        <ArrowRight size={16} className="text-ink-secondary transition group-hover:translate-x-0.5 group-hover:text-[#0071e3]" />
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-ink">
          <Users size={14} className="text-ink-secondary" />{cls.student_count} 人
        </span>
        <span className="flex items-center gap-1.5 text-ink">
          <CalendarCheck size={14} className={rate >= 90 ? 'text-[#28cd41]' : rate >= 70 ? 'text-[#ff9500]' : 'text-[#ff3b30]'} />
          今日 {rate}%
        </span>
      </div>
      {cls.latest_assignment && (
        <div className="line-clamp-1 rounded-lg bg-bg-light px-2.5 py-1.5 text-xs text-ink-secondary">
          📝 最近：{cls.latest_assignment}
        </div>
      )}
    </Link>
  );
});

/* 紧凑骨架屏（避免大块空白） */
function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="card animate-pulse p-4">
            <div className="h-3 w-12 rounded bg-black/10" />
            <div className="mt-3 h-7 w-16 rounded bg-black/10" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card animate-pulse p-5">
            <div className="flex gap-2">
              <div className="h-9 w-9 rounded-xl bg-black/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-20 rounded bg-black/10" />
                <div className="h-2 w-12 rounded bg-black/5" />
              </div>
            </div>
            <div className="mt-3 h-3 w-32 rounded bg-black/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const teacher = auth.teacher;

  useEffect(() => {
    api.get('/overview')
      .then(d => setData(d))
      .catch(e => setErr(e.message || '加载失败'));
  }, []);

  const reload = () => { setData(null); setErr(''); api.get('/overview').then(setData).catch(e => setErr(e.message || '加载失败')); };

  if (err) return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#ff3b30]/15 text-[#ff3b30]">⚠</div>
      <div className="text-base">{err}</div>
      <button onClick={reload} className="btn-pill brand-gradient px-4 py-2 text-sm text-white">
        <RefreshCw size={14} className="mr-1 inline" />重试
      </button>
    </div>
  );

  if (!data) return <Skeleton />;

  const attTotal = data.todayAttendance.reduce((s, r) => s + r.n, 0);

  /* 问候语：按时段变化 */
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const dateStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="space-y-6">
      {/* 欢迎横幅：品牌渐变氛围 */}
      <div className="relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="brand-gradient absolute inset-0" />
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="text-xs font-medium text-white/80">{dateStr}</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{greet}，{teacher?.name || '老师'}</h2>
          <p className="mt-1.5 text-sm text-white/85">
            {data.pendingTodos + data.pendingGrading > 0
              ? <>今天还有 <b className="tabular-nums">{data.pendingTodos + data.pendingGrading}</b> 件事待处理，加油</>
              : '今天的事情都处理完了，喝口茶吧'}
          </p>
        </div>
      </div>

      {/* 顶部精简：3 卡（不显示算力/课程，避免信息过载；算力在顶栏已显示） */}
      <div className="stagger grid grid-cols-3 gap-3">
        <StatCard icon={GraduationCap} label="班级" value={data.classes} tone="blue" />
        <StatCard icon={Users} label="学生" value={data.students} tone="green" />
        <StatCard icon={ListTodo} label="待办" value={data.pendingTodos + data.pendingGrading} tone="orange" />
      </div>

      {/* 主体：班级卡片 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold tracking-tight">我的班级</h3>
          <Link to="/classes" className="text-xs text-[#0071e3] hover:underline">查看全部 →</Link>
        </div>
        {data.classList?.length ? (
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.classList.map(cls => <ClassCard key={cls.id} cls={cls} />)}
          </div>
        ) : (
          <Link to="/classes/new" className="card flex flex-col items-center gap-2 p-8 text-center text-ink-secondary transition hover:border-[#0071e3]/40">
            <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-white"><GraduationCap size={22} /></div>
            <div className="text-sm">还没有班级，点击创建第一个班级</div>
          </Link>
        )}
      </div>

      {/* 班主任工具快捷入口 */}
      <div>
        <h3 className="mb-3 font-semibold tracking-tight">班主任工具</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { to: '/classroom', icon: MonitorPlay, label: '课堂小助手', desc: '点名·倒计时·加减分', cls: 'from-[#5856d6] to-[#af52de]' },
            { to: '/comments', icon: PenLine, label: 'AI 期末评语', desc: '全班一次仅 10 算力', cls: 'from-[#0071e3] to-[#00c6ff]' },
            { to: '/ai-writer', icon: Wand2, label: 'AI 文案助手', desc: '通知·周报一键写', cls: 'from-[#ff9500] to-[#ffcc00]' },
            { to: '/journals', icon: BookText, label: '班主任周记', desc: 'AI 汇总学期总结', cls: 'from-[#28cd41] to-[#34d058]' },
          ].map(t => (
            <Link key={t.to} to={t.to}
              className="card group flex items-center gap-3 p-4 transition hover:border-[#0071e3]/40 hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.98]">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${t.cls}`}>
                <t.icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{t.label}</div>
                <div className="truncate text-xs text-ink-secondary">{t.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 今日考勤速览（精简） */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck size={16} className="text-[#0071e3]" />
            <h3 className="font-medium">今日考勤</h3>
            <span className="text-xs text-ink-secondary">· 共 {attTotal} 人次</span>
          </div>
          <Link to="/attendance" className="text-xs text-[#0071e3] hover:underline">点名 →</Link>
        </div>
        {data.todayAttendance.length ? (
          <div className="flex flex-wrap gap-2">
            {data.todayAttendance.map(r => (
              <div key={r.status} className="flex items-center gap-1.5 rounded-xl bg-bg-light px-3 py-1.5 text-sm">
                <Badge tone={{ 出勤: 'green', 迟到: 'orange', 缺勤: 'red', 请假: 'blue' }[r.status]}>{r.status}</Badge>
                <span className="font-semibold">{r.n}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">尚未录入，<Link to="/attendance" className="text-[#0071e3] hover:underline">立即点名</Link></p>
        )}
      </div>

      {/* AI 算力入口（顶栏已有余额，移动到此作为行动点） */}
      {teacher?.credits != null && teacher.credits <= 200 && (
        <div className="card flex items-start gap-3 border-[#ff9500]/30 bg-gradient-to-r from-[#ff9500]/10 to-[#ff3b30]/10 p-4 text-sm">
          <Zap size={18} className="mt-0.5 shrink-0 text-[#ff9500]" />
          <div className="flex-1">
            <div className="font-medium text-ink">算力余额：<b className="text-[#ff9500]">{teacher.credits}</b></div>
            <div className="mt-0.5 text-xs text-ink-secondary">AI 出题每次扣 5 算力，余额不足会影响使用。</div>
          </div>
          <Link to="/renew" className="btn-pill bg-[#ff9500] px-3 py-1.5 text-xs font-medium text-white">续费</Link>
        </div>
      )}
    </div>
  );
}
