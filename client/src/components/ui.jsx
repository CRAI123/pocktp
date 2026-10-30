import { createPortal } from 'react-dom';
import { X, ShieldCheck, Inbox } from 'lucide-react';

/** 统计卡片：眉标 + 大数字 + 右侧色调图标；悬停轻微上浮 */
export function StatCard({ icon: Icon, label, value, hint, tone = 'blue' }) {
  const tones = {
    blue: { chip: 'bg-[#0071e3]/10 text-[#0071e3]', ring: 'group-hover:border-[#0071e3]/25' },
    green: { chip: 'bg-[#28cd41]/12 text-[#1a7f2b]', ring: 'group-hover:border-[#28cd41]/30' },
    orange: { chip: 'bg-[#ff9500]/12 text-[#a85300]', ring: 'group-hover:border-[#ff9500]/30' },
    purple: { chip: 'bg-[#af52de]/10 text-[#7b2f9e]', ring: 'group-hover:border-[#af52de]/25' },
  };
  const t = tones[tone] || tones.blue;
  return (
    <div className={`card group flex flex-col gap-2 p-4 transition hover:-translate-y-0.5 sm:p-5 ${t.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow truncate">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${t.chip}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="num text-[26px] font-semibold leading-none text-ink sm:text-[30px]">{value}</div>
      {hint && <div className="truncate text-[11px] text-ink-secondary/75">{hint}</div>}
    </div>
  );
}

/** 区块标题：品牌圆点 + 紧凑大标题 + 说明 */
export function SectionHeader({ title, desc, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="brand-gradient h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(0,113,227,0.08)]" />
          <h2 className="display truncate text-[24px] font-semibold text-ink sm:text-[28px]">{title}</h2>
        </div>
        {desc && <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-secondary sm:text-sm">{desc}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** 主按钮 / 次按钮 */
export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'brand-gradient text-white shadow-[0_10px_24px_-12px_rgba(0,113,227,0.60)] hover:brightness-[1.06]',
    secondary: 'border border-black/[0.08] bg-white/75 text-ink shadow-sm hover:border-black/[0.14] hover:bg-white',
    danger: 'border border-[#ff3b30]/15 bg-[#ff3b30]/10 text-[#d70015] hover:bg-[#ff3b30]/15',
  };
  return (
    <button {...props} className={`btn-pill inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

/** 标签 */
export function Badge({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-black/[0.045] text-ink-secondary ring-black/[0.06]',
    blue: 'bg-[#0071e3]/10 text-[#0059b3] ring-[#0071e3]/15',
    green: 'bg-[#28cd41]/12 text-[#1a7f2b] ring-[#28cd41]/20',
    orange: 'bg-[#ff9500]/12 text-[#a85300] ring-[#ff9500]/20',
    red: 'bg-[#ff3b30]/10 text-[#b3251c] ring-[#ff3b30]/15',
    purple: 'bg-[#af52de]/10 text-[#7b2f9e] ring-[#af52de]/15',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] || tones.gray}`}>{children}</span>;
}

/** 弹窗：遮罩淡入 + 面板缩放上浮；窄屏从底部弹出更顺手 */
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  /* 用 Portal 挂到 body：避免被页面的 transform/filter 祖先（如 .page-enter 入场动画）
   * 变成 fixed 定位的包含块，导致弹窗跑到页面内容中部甚至屏幕外 */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div className="fade-in absolute inset-0 bg-[#12141a]/40 backdrop-blur-md" onClick={onClose} />
      <div className={`modal-in card relative w-full ${width} max-h-[88vh] overflow-y-auto p-5 sm:p-6`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="display text-lg font-semibold tracking-tight text-ink">{title}</h3>
          <button onClick={onClose} aria-label="关闭" className="btn-pill -mr-1 grid h-8 w-8 shrink-0 place-items-center text-ink-secondary transition hover:bg-black/[0.06] hover:text-ink">
            <X size={17} />
          </button>
        </div>
        <div className="hairline mb-5" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 表单字段 */
export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-black/[0.09] bg-white px-3.5 py-2.5 text-sm text-ink shadow-[inset_0_1px_2px_rgba(16,24,40,0.04)] outline-none transition placeholder:text-ink-secondary/50 hover:border-black/20 focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/10';

/** 空状态：图标 + 标题 + 可选描述与引导按钮 */
export function Empty({ icon: Icon = Inbox, text = '暂无数据', desc, action }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-black/[0.03] text-ink-secondary/60 ring-1 ring-inset ring-black/[0.05]">
        <span className="brand-gradient absolute inset-x-4 bottom-0 h-px opacity-40" />
        <Icon size={26} />
      </div>
      <div>
        <div className="text-sm font-semibold text-ink">{text}</div>
        {desc && <div className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-secondary">{desc}</div>}
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
