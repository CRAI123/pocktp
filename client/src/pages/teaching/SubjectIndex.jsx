/** 学科总入口：语文 / 数学 / 英语 三大功能入口 */
import { Link } from 'react-router-dom';
import { BookText, Sigma, Languages, ArrowRight, Sparkles } from 'lucide-react';
import { SectionHeader } from '../../components/ui.jsx';

const SUBJECTS = [
  {
    to: '/teaching/chinese', code: 'chinese', label: '语文', desc: '生字默写、看拼音写汉字、病句修改专项训练', color: 'from-[#ff3b30] to-[#ff9500]', Icon: BookText,
    items: ['生字默写练习', '看拼音写汉字', '病句修改专项'],
  },
  {
    to: '/teaching/math', code: 'math', label: '数学', desc: '口算、应用题、几何专项（即将上线）', color: 'from-[#0071e3] to-[#00c6ff]', Icon: Sigma,
    items: ['口算速算', '应用题精练', '几何图形'],
  },
  {
    to: '/teaching/english', code: 'english', label: '英语', desc: '句子填空、选词填空专项训练', color: 'from-[#28cd41] to-[#34d058]', Icon: Languages,
    items: ['句子填空练习', '选词填空专项'],
  },
];

export default function SubjectIndex() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="教学专项练习"
        desc="按学科组织的专项题型训练，支持单题练习与 A3 / A4 纸质版打印"
        action={
          <div className="flex items-center gap-1.5 rounded-full bg-[#af52de]/10 px-3 py-1 text-xs text-[#7a36a3]">
            <Sparkles size={13} />AI 智能解析即将接入
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {SUBJECTS.map(({ to, code, label, desc, color, Icon, items }) => (
          <Link
            key={code} to={to}
            className="card card-hover group relative overflow-hidden p-6"
          >
            <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${color}`}>
              <Icon size={26} />
            </div>
            <h3 className="text-xl font-semibold tracking-tight">{label}专项练习</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{desc}</p>
            <ul className="mt-4 space-y-1.5 text-sm">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 text-ink-secondary">
                  <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${color}`} />{it}
                </li>
              ))}
            </ul>
            <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#0071e3] transition group-hover:gap-2">
              进入练习 <ArrowRight size={15} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
