import { Link } from 'react-router-dom';
import { Pen, ListOrdered, BookOpen, SpellCheck, ArrowRight } from 'lucide-react';
import { SectionHeader } from '../../components/ui.jsx';

const ITEMS = [
  { to: '/teaching/english/sentence',  code: 'sentence',  title: '句子填空练习', desc: '时态、句型、语法填空综合训练', Icon: Pen, color: 'from-[#28cd41] to-[#34d058]' },
  { to: '/teaching/english/wordbank',  code: 'wordbank',  title: '选词填空专项', desc: '根据词库选出合适的词填入短文', Icon: ListOrdered, color: 'from-[#0071e3] to-[#00c6ff]' },
  { to: '/teaching/english/reading',   code: 'reading',   title: '阅读理解专项', desc: '短文阅读 + 选择题（主旨/细节/推断/词义）', Icon: BookOpen, color: 'from-[#5856d6] to-[#af52de]' },
  { to: '/teaching/english/dictation', code: 'dictation', title: '单词听写专项', desc: '看中文释义写英文，巩固课本核心词汇', Icon: SpellCheck, color: 'from-[#ff9500] to-[#ffcc00]' },
];

export default function EnglishIndex() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="英语专项练习"
        desc="聚焦句子与语篇填空，覆盖常见考点"
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
