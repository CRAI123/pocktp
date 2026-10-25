import { useState } from 'react';
import { Wand2, Copy, RefreshCw, MessageSquare, Newspaper } from 'lucide-react';
import { ai, auth } from '../api.js';
import { SectionHeader, Button, Badge } from '../components/ui.jsx';
import { notifyDone } from '../desktop.js';

const TYPES = [
  { key: 'notice', label: '家长通知', icon: MessageSquare, cost: 2, placeholder: '例：下周三下午三点开家长会，地点本班教室，请家长提前十分钟到场，带上笔记本', hint: '200-400 字，家长群直接发送' },
  { key: 'weekly', label: '班级周报', icon: Newspaper, cost: 3, placeholder: '例：本周完成期中复习；表扬小明、小红进步明显；下周运动会，提醒穿运动鞋', hint: '含本周回顾 / 表扬进步 / 温馨提示 / 下周安排' },
];

/** AI 文案助手：家长通知 / 班级周报（按类型计费） */
export default function AiWriter() {
  const [tab, setTab] = useState('notice');
  const [points, setPoints] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const cur = TYPES.find(t => t.key === tab);

  const generate = async () => {
    if (!points.trim() || loading) return;
    setLoading(true); setError(''); setCopied(false);
    try {
      const d = await ai.write(tab, { points: points.trim() });
      setText(d.text);
      notifyDone('AI 文案已生成', `${cur?.label || '文案'}已生成，可复制或导出`);
      if (d.credits != null && auth.teacher) auth.save(auth.token, { ...auth.teacher, credits: d.credits });
    } catch (e) {
      setError(e.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader title="AI 文案助手" desc="输入要点，一键生成规范得体的家长通知与班级周报" />

      {/* 类型切换 */}
      <div className="mb-5 flex gap-2">
        {TYPES.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setError(''); }}
            className={`btn-pill flex items-center gap-2 px-4 py-2 text-sm font-medium transition ${tab === t.key ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'bg-black/[0.05] text-ink-secondary hover:bg-black/[0.08]'}`}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
        <Badge tone="purple">每次 {cur.cost} 算力</Badge>
      </div>

      {/* 要点输入 */}
      <div className="card mb-5 p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">要点（大白话写即可）</span>
          <span className="text-xs text-ink-secondary">{cur.hint}</span>
        </div>
        <textarea
          className="w-full resize-y rounded-xl border border-black/10 bg-bg-light px-3.5 py-3 text-sm leading-relaxed outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/15"
          rows={4}
          placeholder={cur.placeholder}
          value={points}
          onChange={e => setPoints(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={generate} disabled={!points.trim() || loading}>
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {loading ? 'AI 撰写中…' : text ? '重新生成' : '一键生成'}
          </Button>
          {error && <span className="text-sm text-[#ff3b30]">{error}</span>}
        </div>
      </div>

      {/* 生成结果：可编辑 */}
      {text && (
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">生成结果（可直接修改）</span>
            <Button variant="secondary" onClick={copy}>
              <Copy size={14} />{copied ? '已复制' : '复制全文'}
            </Button>
          </div>
          <textarea
            className="w-full resize-y rounded-xl border border-black/5 bg-bg-light px-3.5 py-3 text-sm leading-relaxed outline-none transition focus:border-[#0071e3] focus:bg-white"
            rows={12}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="mt-1 text-right text-[10px] text-ink-secondary">{text.length} 字</div>
        </div>
      )}
    </div>
  );
}
