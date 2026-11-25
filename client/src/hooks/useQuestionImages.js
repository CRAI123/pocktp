/**
 * 按题按需生图：拿到题目后，对 need_image && image_prompt 的题逐张调用 /api/ai/image，
 * 并发限流（默认 2），避免一次性打爆接口或超出 Vercel 60s。
 * - 成功：把 data URL 写回 question.image（仅内存，不写历史库）
 * - 402（算力不足）：置 stopped，停止后续所有生图并回调 onCreditsError
 * - 其它错误：标记 imageError，等用户手动重试
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { ai } from '../api';

const CONCURRENCY = 2;

export function useQuestionImages(questions, setQuestions, { enabled = true, onCreditsError } = {}) {
  const inFlight = useRef(new Set());     // 正在生图的 q.id
  const stopped = useRef(false);          // 遇到 402 后停止后续
  const cbRef = useRef(onCreditsError);
  cbRef.current = onCreditsError;
  const [loadingCount, setLoadingCount] = useState(0);
  const [creditsError, setCreditsError] = useState(false);

  const patch = useCallback((id, fields) => {
    setQuestions(prev => prev.map(q => (q.id === id ? { ...q, ...fields } : q)));
  }, [setQuestions]);

  // 题目整体更换（新一批生成）→ 重置停止标记，允许重新生图
  useEffect(() => {
    stopped.current = false;
    setCreditsError(false);
  }, [questions]);

  useEffect(() => {
    if (!enabled || stopped.current) return;
    const pending = (questions || []).filter(q =>
      q?.need_image
      && q?.image_prompt
      && !q.image
      && !q.imageLoading
      && !q.imageError
      && !inFlight.current.has(q.id),
    );
    if (!pending.length) return;

    let active = 0;
    let idx = 0;
    const bump = n => setLoadingCount(c => Math.max(0, c + n));

    const runNext = async () => {
      while (idx < pending.length && active < CONCURRENCY) {
        const q = pending[idx++];
        if (stopped.current) return;
        if (inFlight.current.has(q.id)) continue;
        inFlight.current.add(q.id);
        active += 1;
        bump(1);
        patch(q.id, { imageLoading: true, imageError: '' });
        try {
          const res = await ai.image(q.image_prompt);
          patch(q.id, { image: res?.url || '', imageLoading: false });
        } catch (e) {
          inFlight.current.delete(q.id);
          if (e?.status === 402) {
            stopped.current = true;
            setCreditsError(true);
            cbRef.current?.(e);
            patch(q.id, { imageLoading: false });
          } else {
            patch(q.id, { imageLoading: false, imageError: e?.message || '生图失败' });
          }
        } finally {
          active -= 1;
          bump(-1);
          runNext();
        }
      }
    };
    runNext();
  }, [questions, enabled, patch]);

  const retry = useCallback((id) => {
    inFlight.current.delete(id);
    stopped.current = false;
    setCreditsError(false);
    setQuestions(prev => prev.map(q => (q.id === id ? { ...q, imageError: '', imageLoading: false } : q)));
  }, [setQuestions]);

  return { loadingCount, creditsError, retry };
}
