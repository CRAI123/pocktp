import { X, ShieldCheck, Inbox } from 'lucide-react';

/** 统计卡片 */
export function StatCard({ icon: Icon, label, value, hint, tone = 'blue' }) {
  const tones = {
    blue: 'from-[#0071e3] to-[#00c6ff] shadow-[#0071e3]/30',
    green: 'from-[#28cd41] to-[#34d058] shadow-[#28cd41]/30',
    orange: 'from-[#ff9500] to-[#ffcc00] shadow-[#ff9500]/30',
    purple: 'from-[#af52de] to-[#d783ff] shadow-[#af52de]/30',
  };
  return (
    <div className="card card-hover group flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 sm:h-12 sm:w-12 ${tones[tone]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold tracking-tight tabular-nums sm:text-[26px] sm:leading-8">{value}</div>
        <div className="truncate text-xs text-ink-secondary sm:text-sm">{label}{hint ? ` · ${hint}` : ''}</div>
      </div>
    </div>
  );
}

/** 区块标题：渐变强调条 + 大标题 */
export function SectionHeader({ title, desc, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="brand-gradient mt-1.5 h-7 w-1.5 shrink-0 rounded-full sm:mt-2 sm:h-8" />
        <div>
          <h2 className="text-[22px] font-bold tracking-tight sm:text-[26px]">{title}</h2>
          {desc && <p className="mt-0.5 text-sm text-ink-secondary">{desc}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** 主按钮 / 次按钮 */
export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'brand-gradient text-white shadow-lg shadow-[#0071e3]/25 hover:shadow-xl hover:shadow-[#0071e3]/30 hover:brightness-105',
    secondary: 'bg-black/[0.05] text-ink hover:bg-black/[0.08]',
    danger: 'bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/15',
  };
  return (
    <button {...props} className={`btn-pill inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

/** 标签 */
export function Badge({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-black/[0.05] text-ink-secondary',
    blue: 'bg-[#0071e3]/10 text-[#0071e3]',
    green: 'bg-[#28cd41]/12 text-[#1fa733]',
    orange: 'bg-[#ff9500]/12 text-[#c93400]',
    red: 'bg-[#ff3b30]/10 text-[#ff3b30]',
    purple: 'bg-[#af52de]/10 text-[#af52de]',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** 弹窗：遮罩淡入 + 面板缩放上浮 */
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-[#1d1d1f]/35 backdrop-blur-md" onClick={onClose} />
      <div className={`modal-in card relative w-full ${width} max-h-[85vh] overflow-y-auto p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} className="btn-pill p-1.5 text-ink-secondary hover:bg-black/5"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 表单字段 */
export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-black/10 bg-bg-light px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/15';

/** 空状态：图标 + 标题 + 可选描述与引导按钮 */
export function Empty({ icon: Icon = Inbox, text = '暂无数据', desc, action }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.04] text-ink-secondary/50">
        <Icon size={26} />
      </div>
      <div>
        <div className="text-sm font-medium text-ink">{text}</div>
        {desc && <div className="mt-1 text-xs leading-relaxed text-ink-secondary">{desc}</div>}
      </div>
      {action}
    </div>
  );
}

/** 列表骨架屏：与卡片列表布局一致，避免文字加载提示的生硬感 */
export function SkeletonList({ rows = 4 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex items-center gap-4 p-5">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-black/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-black/[0.06]" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-black/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rayzo 集团品牌背书（底部居中）：集团署名 + 官网服务链接 + 审查声明 */
export function BrandFooter({ fixed = false, className = '' }) {
  return (
    <footer
      className={`${fixed ? 'absolute inset-x-0 bottom-0' : ''} flex flex-col items-center gap-0.5 px-5 pb-4 text-center text-xs text-ink-secondary/60 sm:pb-5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
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
  );
}

/** 状态 -> Badge 配色 */
export const statusTone = {
  出勤: 'green', 迟到: 'orange', 缺勤: 'red', 请假: 'blue',
  已批改: 'green', 待批改: 'orange', 未提交: 'gray',
  高: 'red', 中: 'orange', 低: 'gray',
  课件: 'blue', 教案: 'purple', 习题: 'orange', 视频: 'green', 其他: 'gray',
};
