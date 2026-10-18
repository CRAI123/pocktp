import { useCallback, useEffect, useRef, useState } from 'react';
import { ai } from '../api.js';

/**
 * 页面级自动出题 hook：
 * - 挂载 / reload()（重试按钮）时按当前配置出题一次
 * - cfg 变化不触发重新生成（避免与配置面板内部生成双重扣费），reload 时始终使用最新 cfg
 */
export function useAutoQuestions(type, defaults = {}) {
  /* 用 ref 存最新配置：reload 时取当前值，而不是 effect 闭包里的旧值 */
  const cfgRef = useRef(defaults);
  cfgRef.current = defaults;

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const { grade = '3', difficulty = 'medium', count = 10, keyword = '综合练习' } = cfgRef.current || {};
    setLoading(true);
    setError('');
    ai.generate({ type, grade, difficulty, count, keyword })
      .then(d => {
        if (!cancelled) setQuestions(d.questions || []);
      })
      .catch(e => {
        if (!cancelled) setError(e.message || '生成失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [type, reloadKey]);

  return { questions, loading, error, reload };
}
