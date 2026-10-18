import { Link } from 'react-router-dom';
import { Sigma, ArrowRight, BookOpen, ClipboardList, LineChart, CalendarClock } from 'lucide-react';
import { SectionHeader } from '../../components/ui.jsx';

const SHORTCUTS = [
  { to: '/courses', label: '开设课程', desc: '为数学课创建与维护', Icon: BookOpen },
  { to: '/assignments', label: '作业批改', desc: '布置与批改数学作业', Icon: ClipboardList },
  { to: '/grades', label: '成绩分析', desc: '查看数学成绩曲线与分层提升', Icon: LineChart },
  { to: '/attendance', label: '考勤记录', desc: '管理学生出勤', Icon: CalendarClock },
];

export default function MathIndex() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="数学专项练习"
        desc="口算、应用题、几何专项（即将上线）"
      />
      <div className="card relative overflow-hidden p-8">
        <div className="brand-gradient absolute inset-x-0 top-0 h-1" />
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#00c6ff] text-white shadow-md">
            <Sigma size={26} />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">数学专项练习正在筹备</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-secondary">
              我们正在开发口算速算、应用题精练、几何图形三大数学专项，预计下个版本上线。届时将自动出现在此页面。
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#ff9500]/10 px-3 py-1 text-xs font-medium text-[#ff9500]">
              Coming Soon
            </div>
          </div>
        </div>
      </div>

      <SectionHeader title="在此之前，可使用现有功能" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SHORTCUTS.map(({ to, label, desc, Icon }) => (
          <Link key={to} to={to} className="card card-hover group p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{label}</div>
                <div className="truncate text-xs text-ink-secondary">{desc}</div>
              </div>
              <ArrowRight size={15} className="ml-auto text-ink-secondary transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
