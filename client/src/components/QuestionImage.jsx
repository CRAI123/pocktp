/**
 * 题目配图自适应组件 —— 固定在题干/材料之后居中展示，不随内容乱摆。
 * - 已生成：响应式图片（max-w / max-h，object-contain），点击可放大查看原图
 * - 生成中：骨架占位 + 「AI 正在生成配图…」
 * - 失败：小尺寸错误提示 + 重试按钮
 * variant="print" 用于打印/PDF：去掉阴影、边框、交互，控制最大高度避免撑爆版面
 */
import { useState } from 'react';

export default function QuestionImage({ q, variant = 'screen', onRetry, className = '' }) {
  const [zoom, setZoom] = useState(false);
  if (!q) return null;
  const needs = q.need_image && q.image_prompt;

  /* 打印时不渲染加载骨架 / 错误提示，只渲染已生成的图片 */
  if (variant === 'print') {
    if (!q.image) return null;
    return (
      <div className={`flex justify-center my-2 ${className}`}>
        <img
          src={q.image}
          alt={q.image_prompt || '题目配图'}
          className="max-w-full max-h-[360px] object-contain"
          crossOrigin="anonymous"
        />
      </div>
    );
  }

  if (q.image) {
    return (
      <>
        <div className={`flex justify-center w-full my-3 ${className}`}>
          <img
            src={q.image}
            alt={q.image_prompt || '题目配图'}
            title={q.image_prompt || ''}
            onClick={() => setZoom(true)}
            className="max-w-full max-h-[440px] object-contain rounded-xl border border-slate-200 bg-white shadow-sm cursor-zoom-in hover:shadow-md transition-shadow"
          />
        </div>
        {zoom && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setZoom(false)}
          >
            <img
              src={q.image}
              alt={q.image_prompt || '题目配图'}
              className="max-h-[92vh] max-w-full object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
            <span className="absolute top-4 right-4 text-white/80 text-sm select-none">点击任意处关闭</span>
          </div>
        )}
      </>
    );
  }

  if (needs && q.imageLoading) {
    return (
      <div className={`flex items-center justify-center gap-2 w-full my-3 py-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-sm ${className}`}>
        <span className="inline-block w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
        AI 正在生成配图…
      </div>
    );
  }

  if (needs && q.imageError) {
    return (
      <div className={`flex items-center justify-center gap-2 w-full my-3 py-3 rounded-xl border border-dashed border-rose-300 bg-rose-50 text-rose-600 text-xs ${className}`}>
        配图生成失败：{q.imageError}
        {onRetry && (
          <button
            type="button"
            onClick={() => onRetry(q.id)}
            className="ml-1 px-2 py-0.5 rounded bg-white border border-rose-300 text-rose-600 hover:bg-rose-100"
          >
            重试
          </button>
        )}
      </div>
    );
  }

  return null;
}
