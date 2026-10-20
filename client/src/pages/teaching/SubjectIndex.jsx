/** 学科总入口：语文 / 数学 / 英语 专项 + 综合测试（逐科独立生成） */
import { Link } from 'react-router-dom';
import { BookText, Sigma, Languages, ArrowRight, Sparkles, GraduationCap, Layers, CheckSquare, Printer, Timer } from 'lucide-react';
import { SectionHeader } from '../../components/ui.jsx';

const SUBJECTS = [
  {
    to: '/teaching/chinese', code: 'chinese', label: '语文', color: 'from-[#ff3b30] to-[#ff9500]', Icon: BookText,
    desc: '生字默写、看拼音写汉字、病句修改、古诗默写',
    items: ['生字默写', '看拼音写汉字', '病句修改', '古诗默写'],
  },
  {
    to: '/teaching/math', code: 'math', label: '数学', color: 'from-[#0071e3] to-[#00c6ff]', Icon: Sigma,
    desc: '口算、应用题、几何专项（即将上线）',
    items: ['口算速算', '应用题精练', '几何图形'],
  },
  {
    to: '/teaching/english', code: 'english', label: '英语', color: 'from-[#28cd41] to-[#34d058]', Icon: Languages,
    desc: '句子填空、选词填空、阅读理解、单词听写、短文选词填空',
    items: ['句子填空', '选词填空', '阅读理解', '单词听写', '短文选词填空'],
  },
];

/* 综合测试三步流程 */
const STEPS = [
  { Icon: Layers, title: '① 逐科生成', desc: '语数英分开出题，独立管理不混杂' },
  { Icon: CheckSquare, title: '② 勾选组卷', desc: '逐题筛选，不满意可单题重出' },
  { Icon: Printer, title: '③ 一键打印', desc: 'A4 标准分卷 + 独立答案页' },
];

export default function SubjectIndex() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="教学专项练习"
        desc="按学科组织的专项题型训练，支持 AI 出题、举一反三与 A4 / A3 打印"
        action={
          <div className="flex items-center gap-1.5 rounded-full bg-[#0071e3]/10 px-3 py-1 text-xs font-medium text-[#0071e3]">
            <Sparkles size={13} />AI 出题已接入
          </div>
        }
      />

      {/* ============ 综合测试：主推入口（品牌渐变氛围 + 三步流程） ============ */}
      <Link to="/teaching/exam" className="card card-hover group relative overflow-hidden">
        <div className="brand-gradient absolute inset-x-0 top-0 h-1" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0071e3]/[0.05] via-transparent to-[#28cd41]/[0.07]" />
        <div className="relative p-6 sm:p-7">
          <div className="flex flex-wrap items-start gap-4">
            <div className="brand-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-md shadow-blue-500/25">
              <GraduationCap size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
                综合测试
                <span className="rounded-full bg-[#ff9500]/10 px-2 py-0.5 text-xs font-medium text-[#ff9500]">仿中考题型</span>
                <span className="rounded-full bg-[#0071e3]/10 px-2 py-0.5 text-xs font-medium text-[#0071e3]">逐科独立生成</span>
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                语文 / 数学 / 英语 分开出题、分开管理、分开组卷：题型完整覆盖阅读理解、完形填空、作文；全年级 + 中考新风向。
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#0071e3]/10 px-4 py-2 text-sm font-medium text-[#0071e3] transition group-hover:bg-[#0071e3] group-hover:text-white">
              进入组卷 <ArrowRight size={15} />
            </span>
          </div>
          {/* 三步流程 */}
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {STEPS.map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3.5 py-2.5 ring-1 ring-black/[0.05]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-ink-secondary">
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">{title}</div>
                  <div className="truncate text-xs text-ink-secondary">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Link>

      {/* ============ 课堂练习：全科目，按课题与题型出卷 ============ */}
      <Link to="/teaching/classroom-practice" className="card card-hover group relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#28cd41]/[0.05] via-transparent to-[#0071e3]/[0.06]" />
        <div className="relative flex flex-wrap items-center gap-4 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#28cd41] to-[#34d058] text-white shadow-md shadow-green-500/25">
            <Timer size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
              课堂练习
              <span className="rounded-full bg-[#28cd41]/10 px-2 py-0.5 text-xs font-medium text-[#1f9e33]">全科目</span>
              <span className="rounded-full bg-[#0071e3]/10 px-2 py-0.5 text-xs font-medium text-[#0071e3]">描述词可改</span>
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
              输入课题与知识点，自选题型数量（如 1 道选择题 + 2 道论述题），自动生成命题描述词——确认或直接修改后 AI 出卷，适合课堂 5-10 分钟即时检测。
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#28cd41]/10 px-4 py-2 text-sm font-medium text-[#1f9e33] transition group-hover:bg-[#28cd41] group-hover:text-white">
            去出卷 <ArrowRight size={15} />
          </span>
        </div>
      </Link>

      {/* ============ 三大学科专项入口 ============ */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {SUBJECTS.map(({ to, code, label, desc, color, Icon, items }) => (
          <Link
            key={code} to={to}
            className="card card-hover group relative overflow-hidden p-6"
          >
            <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-[0.08] blur-2xl transition group-hover:opacity-20 ${color}`} />
            <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${color}`}>
              <Icon size={26} />
            </div>
            <h3 className="text-xl font-semibold tracking-tight">{label}专项练习</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{desc}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {items.map(it => (
                <span key={it} className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs text-ink-secondary">{it}</span>
              ))}
            </div>
            <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#0071e3] transition group-hover:gap-2">
              进入练习 <ArrowRight size={15} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
