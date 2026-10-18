import { Link } from 'react-router-dom';
import { BookText, PenLine, Stethoscope, ScrollText, ArrowRight } from 'lucide-react';
import { SectionHeader } from '../../components/ui.jsx';

const ITEMS = [
  { to: '/teaching/chinese/dictation', code: 'dictation', title: '生字默写练习', desc: '看词听写 / 看拼音写汉字，巩固生字词', Icon: BookText, color: 'from-[#ff3b30] to-[#ff9500]' },
  { to: '/teaching/chinese/pinyin',    code: 'pinyin',    title: '看拼音写汉字', desc: '根据拼音写汉字，攻克易错字与多音字', Icon: PenLine, color: 'from-[#ff9500] to-[#ffcc00]' },
  { to: '/teaching/chinese/fix',       code: 'fix',       title: '病句修改专项', desc: '搭配不当、成分残缺、前后矛盾等常见病句', Icon: Stethoscope, color: 'from-[#af52de] to-[#d783ff]' },
  { to: '/teaching/chinese/poem',      code: 'poem',      title: '古诗默写专项', desc: '课标必背古诗 · 给出上句写下句 / 关键句默写', Icon: ScrollText, color: 'from-[#0071e3] to-[#5856d6]' },
];

export default function ChineseIndex() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="语文专项练习"
        desc="从基础字词到句子能力，逐项突破"
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
    </div>
  );
}
