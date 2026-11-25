/** 数学索引：口算速算 / 应用题精练 / 几何图形 三大专项 */
import { Link } from 'react-router-dom';
import { Calculator, Ruler, Shapes, ArrowRight, BookOpen, ClipboardList, LineChart, CalendarClock } from 'lucide-react';
import { SectionHeader } from '../../components/ui.jsx';

const ITEMS = [
  { to: '/teaching/math/mental',       code: 'mental',       title: '口算速算专项', desc: '加减乘除、乘方等快速求值，按年级控制数值范围', Icon: Calculator, color: 'from-[#0071e3] to-[#00c6ff]' },
  { to: '/teaching/math/word-problem', code: 'word-problem', title: '应用题精练',   desc: '生活情境的数量关系题，答案含解题步骤与结果', Icon: Ruler,      color: 'from-[#28cd41] to-[#34d058]' },
  { to: '/teaching/math/geometry',     code: 'geometry',     title: '几何图形专项', desc: '角度、周长面积体积、图形性质与证明，需要时自动配示意图', Icon: Shapes,     color: 'from-[#af52de] to-[#d783ff]' },
];

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
        desc="口算速算、应用题精练、几何图形，逐项突破"
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {ITEMS.map(({ to, code, title, desc, Icon, color }) => (
          <Link key={code} to={to} className="card card-hover group relative overflow-hidden p-6">
            <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${color}`}>
              <Icon size={26} />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{desc}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#0071e3] transition group-hover:gap-2">
              开始练习 <ArrowRight size={15} />
            </div>
          </Link>
        ))}
      </div>

      <SectionHeader title="数学相关功能" />
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
